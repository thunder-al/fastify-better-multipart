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
    tempDir: string
  },
): FastifyContentTypeParser {

  const {maxInMemoryFileSize, tempDir} = opts

  return function (
    request: FastifyRequest,
    rawRequest: RawRequestDefaultExpression,
    done: (err: Error | null, body?: any) => void,
  ) {
    // set multipart flag for next handlers
    // this is the only place where the flag is sets
    (<any>request)[kIsMultipart] = true

    let lastError: Error | null = null

    const headers = request.headers as BusboyHeaders
    const bus = createBusboy({
      headers: headers,
      // TODO: add support for options
    })

    function release() {
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

    bus.on('file', async (
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
    })

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