import type {JsonType} from './util.ts'
import {PassThrough, type Readable} from 'node:stream'
import Fsp from 'node:fs/promises'
import Fs, {type WriteStream} from 'node:fs'
import type {BusboyFileStream} from '@fastify/busboy'
import {RequestFileTooLargeError} from './errors.ts'

export class MultipartField<IsJson extends boolean = boolean> {
  public readonly type = 'field'

  constructor(
    public readonly fieldName: string,
    public readonly mimeType: string,
    public readonly transferEncoding: string,
    public readonly value: IsJson extends false ? string : JsonType,
    public readonly fieldnameTruncated: boolean,
    public readonly valueTruncated: boolean,
    public readonly isJson: IsJson = false as IsJson,
  ) {
  }

  public toBuffer(): Buffer {
    if (this.isJson) {
      return Buffer.from(JSON.stringify(this.value), 'utf8')
    }

    return Buffer.from(this.value as string, 'utf8')
  }

  public toStream(): Readable {
    const pt = new PassThrough()
    pt.end(this.toBuffer())

    return pt
  }

  public toString(): string {
    if (this.isJson) {
      return JSON.stringify(this.value)
    }

    return this.value as string
  }
}

export class MultipartFile {
  public readonly type = 'file'
  public destroyed = false

  constructor(
    public readonly fieldName: string,
    public readonly fileName: string,
    public readonly size: number,
    public readonly mimeType: string,
    public readonly localTempPath: string,
    private inMemoryBuffer: Buffer | null,
  ) {
  }

  public async toBuffer(): Promise<Buffer> {
    if (this.destroyed) {
      throw new Error('Cannot read file after it has been destroyed')
    }

    if (this.inMemoryBuffer) {
      return this.inMemoryBuffer
    }

    return Fsp.readFile(this.localTempPath)
  }

  public toStream(): Readable {
    if (this.destroyed) {
      throw new Error('Cannot read file after it has been destroyed')
    }

    if (this.inMemoryBuffer) {
      const pt = new PassThrough()
      pt.end(this.inMemoryBuffer)
      return pt
    }

    return Fs.createReadStream(this.localTempPath)
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) {
      return
    }
    this.destroyed = true

    if (this.inMemoryBuffer) {
      this.inMemoryBuffer = null
      return
    }

    await Fsp.unlink(this.localTempPath)
  }

  public get isInMemory(): boolean {
    return this.inMemoryBuffer !== null
  }

  public get isPersisted(): boolean {
    return this.inMemoryBuffer === null
  }

  public get isDestroyed(): boolean {
    return this.destroyed
  }

  public get length(): number {
    return this.size
  }

  public async persistToDisk(): Promise<void> {
    if (this.destroyed) {
      throw new Error('Cannot persist file after it has been destroyed')
    }

    if (!this.inMemoryBuffer) {
      // already persisted to disk
      return
    }

    await Fsp.writeFile(this.localTempPath, this.inMemoryBuffer, {flush: true})
  }
}

export async function createMultipartFileFromStream(
  fieldName: string,
  stream: BusboyFileStream,
  fileName: string,
  mimeType: string,
  tempFilePath: string,
  maxMemorySize: number,
): Promise<MultipartFile> {

  let fileSize = 0

  let chunks: Buffer[] = []
  let inMemorySize = 0

  let tempFileStream: WriteStream | null = null

  for await (const chunk of stream) {

    if (!tempFileStream) {

      // append only if its in-memory mode
      chunks.push(chunk)
      inMemorySize += chunk.length

    } else {

      // write to file mode
      tempFileStream.write(chunk)
    }

    // switching to file mode if data is large
    if (!tempFileStream && inMemorySize >= maxMemorySize) {
      tempFileStream = Fs.createWriteStream(tempFilePath, {flags: 'w', autoClose: true, flush: true})

      // write in-memory chunks to the file
      for (const c of chunks) {
        tempFileStream.write(c)
      }

      // clear the chunk array
      chunks = []
    }

    fileSize += chunk.length
  }

  if (tempFileStream) {
    await new Promise<void>((resolve, reject) => {
      tempFileStream!.on('finish', resolve)
      tempFileStream!.on('end', resolve)
      tempFileStream!.on('error', (err: Error) => {
        reject(err)
      })

      tempFileStream!.end()
    })
  }

  // a truncated stream means that the file is too large
  // temp file stream is already closed, but we need to delete the file
  // in memory buffers will be garbage collected
  if (stream.truncated) {
    if (tempFileStream) {
      await Fsp.unlink(tempFilePath)
    } else {
      chunks = []
    }

    throw new RequestFileTooLargeError()
  }

  const inMemoryCombinedBuffer = tempFileStream
    ? null
    : Buffer.concat(chunks)

  return new MultipartFile(
    fieldName,
    fileName,
    fileSize,
    mimeType,
    tempFilePath,
    inMemoryCombinedBuffer,
  )
}
