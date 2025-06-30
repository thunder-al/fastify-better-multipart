import type {FileOptions} from 'buffer'
import type {Readable} from 'node:stream'

export function fromMb(mb: number): number {
  if (mb < 0) {
    throw new Error('fromMb expects a positive number')
  }
  return mb * 1024 * 1024
}

export async function createRandomBuffer(size: number): Promise<Buffer> {
  if (size < 0) {
    throw new Error('createRandomBuffer expects a positive number')
  }

  const buffer = Buffer.alloc(size)
  for (let i = 0; i < size; i++) {
    buffer[i] = Math.floor(Math.random() * 256)
  }

  return buffer
}

export async function createRandomFile(size: number, options: FileOptions = {}): Promise<File> {
  const buffer = await createRandomBuffer(size)

  return new File(
    [buffer],
    `file-${size}.bin`,
    {
      type: 'application/octet-stream',
      lastModified: Date.now(),
      ...options,
    },
  )
}

export async function readStreamToBuffer(stream: Readable) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []

    stream.on('data', (chunk) => {
      chunks.push(chunk)
    })

    stream.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    stream.on('error', (err) => {
      reject(err)
    })
  })
}