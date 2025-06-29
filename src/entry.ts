import type {JsonType} from './util.ts'
import {PassThrough, type Readable} from 'node:stream'
import Fsp from 'node:fs/promises'
import Fs from 'node:fs'
import type {BusboyFileStream} from '@fastify/busboy'

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
    public readonly mimeType: string,
    public readonly localTempPath: string,
  ) {
  }

  public async toBuffer(): Promise<Buffer> {
    if (this.destroyed) {
      throw new Error('Cannot read file after it has been destroyed')
    }

    return Fsp.readFile(this.localTempPath)
  }

  public toStream(): Readable {
    if (this.destroyed) {
      throw new Error('Cannot read file after it has been destroyed')
    }

    return Fs.createReadStream(this.localTempPath)
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) {
      return
    }
    this.destroyed = true

    await Fsp.unlink(this.localTempPath)
  }
}

export async function createMultipartFileFromStream(
  fieldName: string,
  stream: BusboyFileStream,
  filename: string,
  mimeType: string,
  tempFilePath: string,
  maxMemorySize: number,
): Promise<MultipartFile> {
  // TODO: write to buffer if the file is small enough
  // TODO: in loop, throw FST_REQ_FILE_TOO_LARGE if stream.truncated is true
  await Fsp.writeFile(tempFilePath, stream, {flush: true})

  return new MultipartFile(
    fieldName,
    filename,
    mimeType,
    tempFilePath,
  )
}
