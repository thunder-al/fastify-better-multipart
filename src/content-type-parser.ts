import type {FastifyContentTypeParser, FastifyRequest, RawRequestDefaultExpression} from 'fastify'
import {Busboy, type BusboyConfig, type BusboyFileStream, type BusboyHeaders} from '@fastify/busboy'
import {PassThrough} from 'node:stream'
import {kIsMultipart} from './plugin.ts'
import {createMultipartFileFromStream, MultipartField, MultipartFile} from './entry.ts'
import Path from 'node:path'
import {
  FieldsLimitError,
  FilesLimitError,
  InvalidJSONFieldError,
  PartsLimitError,
  PrototypeViolationError,
  RequestTooLargeError,
} from './errors.ts'
import JSON from 'secure-json-parse'

function createBusboy(options: BusboyConfig) {
  // Copied from @fastify/multipart
  try {
    return new Busboy(options)
  } catch (error) {
    const errorEmitter = new PassThrough()
    process.nextTick(function () {
      errorEmitter.emit('error', error)
    })
    return errorEmitter
  }
}

export function createContentTypeParser(
  opts: {
    maxInMemoryFileSize: number
    maxBodyLimit: number
    tempDir: string
  },
): FastifyContentTypeParser {

  const {maxInMemoryFileSize, maxBodyLimit, tempDir} = opts

  return function (
    request: FastifyRequest,
    rawRequest: RawRequestDefaultExpression,
    done: (err: Error | null, body?: any) => void,
  ) {
    // set multipart flag for next handlers
    // this is the only place where the flag is sets
    (<any>request)[kIsMultipart] = true

    // store last error because busboy events do not wait for async handlers
    let lastError: Error | null = null

    // tasks we should wait for before releasing the request and assembling the body
    const pendingAsyncTasks: Array<Promise<unknown>> = []

    function createPendingAsyncTask<
      T extends (...args: Array<any>) => Promise<any>
    >(task: T): (...args: Parameters<T>) => ReturnType<T> {
      return function (...args: Parameters<T>): ReturnType<T> {
        const p = task(...args) as ReturnType<T>
        pendingAsyncTasks.push(p)
        return p
      }
    }

    // busboy

    const headers = request.headers as BusboyHeaders
    const bus = createBusboy({
      headers: headers,
      // TODO: add support for options
    })

    async function release() {
      try {
        await Promise.all(pendingAsyncTasks)
      } catch (err: any) {
        lastError = err
      }

      rawRequest.unpipe(bus)

      if (lastError) {
        return done(lastError, {})
        // no need to clean up files here, onResponse hook will handle it
      }

      const body = buildBodyObject(request.multipartEntries)

      done(null, body)
    }

    // end of stream handlers

    bus.on('finish', release)
    bus.on('end', release)
    bus.on('close', release)
    bus.on('error', (err: Error) => {
      lastError = err
      release()
    })

    rawRequest.on('close', release)
    rawRequest.on('error', (err: Error) => {
      lastError = err
      release()
    })

    // error handlers

    bus.on('partsLimit', function () {
      lastError = new PartsLimitError()
      process.nextTick(() => release())
    })

    bus.on('filesLimit', function () {
      lastError = new FilesLimitError()
      process.nextTick(() => release())
    })

    bus.on('fieldsLimit', function () {
      lastError = new FieldsLimitError()
      process.nextTick(() => release())
    })

    // field and file handlers

    bus.on('file', createPendingAsyncTask(async (
      fieldName: string,
      stream: BusboyFileStream,
      filename: string,
      transferEncoding: string,
      mimeType: string,
    ) => {
      if (fieldName in Object.prototype) {
        lastError = new PrototypeViolationError()
        return
      }

      const tempName = request.server.getNextMultipartTempFileName(request)
      const tempPath = Path.join(tempDir, tempName)

      const f = await createMultipartFileFromStream(
        fieldName,
        stream,
        filename,
        mimeType,
        tempPath,
        maxInMemoryFileSize,
      )

      request.multipartFiles.push(f)
      request.multipartEntries.push(f)
    }))

    bus.on('field', (
        fieldName: string,
        value: string,
        fieldNameTruncated: boolean,
        valueTruncated: boolean,
        transferEncoding: string,
        mimeType: string,
      ) => {
        if (fieldName in Object.prototype) {
          lastError = new PrototypeViolationError()
          return
        }

        const isJsonField = mimeType === 'application/json' || mimeType === 'text/json' || mimeType.endsWith('+json')

        if (isJsonField) {
          try {
            value = JSON.parse(value)
          } catch (e) {
            lastError = new InvalidJSONFieldError()
            return
          }
        }

        const f = new MultipartField(
          fieldName,
          mimeType,
          transferEncoding,
          value,
          fieldNameTruncated,
          valueTruncated,
          isJsonField,
        )

        request.multipartFields.push(f)
        request.multipartEntries.push(f)
      },
    )

    // handling total body limit
    let totalBodySize = 0
    rawRequest.on('data', (chunk: Buffer) => {
      totalBodySize += chunk.length

      if (totalBodySize > maxBodyLimit) {
        lastError = new RequestTooLargeError()
        release()
      }
    })

    // finally, pipe the raw request to busboy

    rawRequest.pipe(bus)
  }
}

function buildBodyObject(entries: Array<MultipartField | MultipartFile>): Record<string, any> {
  const body: Record<string, any> = {}

  for (const entry of entries) {
    if (entry instanceof MultipartField) {
      body[entry.fieldName] = entry.value
    } else {
      body[entry.fieldName] = entry
    }
  }

  return body
}