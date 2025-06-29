import type {FastifyInstance, FastifyRequest} from 'fastify'
import {isMultipartRequest, parseSize} from './util.ts'
import {createContentTypeParser} from './content-type-parser.ts'
import Fsp from 'node:fs/promises'
import Os from 'node:os'
import Path from 'node:path'

export const kIsMultipart = Symbol('betterMultipart.isMultipart')

export interface BetterMultipartPluginOptions {
  /**
   * The maximum file size allowed for uploads.
   * Can be a number (in bytes) or a string (e.g., "10MB", "1GB").
   * Defaults to 100MB.
   */
  maxBodyLimit?: number | string
  /**
   * The maximum size of a file that can be kept in memory.
   * If a file exceeds this size, it will be saved to disk.
   * Can be a number (in bytes) or a string (e.g., "10MB", "1GB").
   * Defaults to 5MB.
   */
  maxInMemoryFileSize?: number | string
  /**
   * The directory where temporary files will be stored.
   * If not specified, a system default temporary directory will be used.
   */
  tempDir?: string
}

export async function pluginFunction(
  fastify: FastifyInstance,
  options: BetterMultipartPluginOptions,
) {

  const maxBodyLimit = parseSize(options?.maxBodyLimit ?? '100MB')
  if (maxBodyLimit <= 0) {
    throw new Error('maxBodyLimit must be a positive number or a valid size string')
  }

  const maxInMemoryFileSize = parseSize(options?.maxInMemoryFileSize ?? '5MB')
  if (maxInMemoryFileSize <= 0) {
    throw new Error('maxInMemoryFileSize must be a positive number or a valid size string')
  }

  const tempDir = options?.tempDir
    ? options.tempDir
    : await Fsp.mkdtemp(Path.join(Os.tmpdir(), 'better-multipart-'))

  // Decorate the Fastify instance with a method to check if the request is multipart
  // By default its false, modifies by the content type parser
  fastify.decorateRequest(kIsMultipart, false)

  fastify.decorateRequest('isMultipart', function () {
    return isMultipartRequest(this)
  })

  fastify.decorateRequest('multipartFiles', [])
  fastify.decorateRequest('multipartFields', [])
  fastify.decorateRequest('multipartEntries', []) // multipartFiles + multipartFields

  // lets name temp files with an index
  // anyway, temp dir will be unique
  let nextTempFileIndex = 0
  fastify.decorate('getNextTempFileName', (req: FastifyRequest) => `${nextTempFileIndex++}`)

  fastify.addContentTypeParser(
    'multipart/form-data',
    {bodyLimit: maxBodyLimit},
    createContentTypeParser({
      maxInMemoryFileSize,
      tempDir,
    }),
  )

  fastify.addHook('onRequest', async (req, repl) => {
    if (!req.isMultipart()) {
      return
    }

    // cleanup persisted temp file entries
    const files = req.multipartFiles
    if (files && Array.isArray(files) && files.length > 0) {
      await Promise.all(
        files.map(f => f.destroy()),
      )
    }
  })

}