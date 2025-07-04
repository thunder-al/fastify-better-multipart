import type {FastifyInstance} from 'fastify'
import {fastifyDecoratedValue, isMultipartRequest, parseSize} from './util.ts'
import {createContentTypeParser} from './content-type-parser.ts'
import Fsp from 'node:fs/promises'
import Os from 'node:os'
import Path from 'node:path'
import type {BusboyConfig} from '@fastify/busboy'

export const kIsMultipart = Symbol('betterMultipart.isMultipart')

export interface BetterMultipartPluginOptions {
  /**
   * The directory where temporary files will be stored.
   * If not specified, a system default temporary directory will be used.
   */
  tempDir?: string
  /**
   * Whether to automatically create a temporary directory if it does not exist.
   * @default true.
   */
  autoCreateTempDir?: boolean
  /**
   * Partial configuration for the underlying Busboy instance.
   * @default empty, busboy defaults
   */
  busboy?: Pick<BusboyConfig, 'highWaterMark' | 'fileHwm' | 'defCharset' | 'isPartAFile' | 'preservePath'>
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
   * Busboy limits configuration.
   */
  busboyLimits?: BusboyConfig['limits']
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

  const autoCreateTempDir = options?.autoCreateTempDir ?? true
  const tempDir = options?.tempDir
    ? options.tempDir
    : await Fsp.mkdtemp(Path.join(Os.tmpdir(), 'better-multipart-'))
  try {
    const stat = await Fsp.stat(tempDir)

    if (!stat.isDirectory()) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error(`Is not a directory`)
    }

  } catch (e: any) {
    if (autoCreateTempDir) {
      await Fsp.mkdir(tempDir, {recursive: true})
    } else {
      throw new Error(`Temporary directory invalid ${tempDir}: ${e.toString()}`)
    }
  }

  // Decorate the Fastify instance with a method to check if the request is multipart
  // By default its false, modifies by the content type parser
  fastify.decorateRequest(kIsMultipart, false)

  fastify.decorateRequest('isMultipart', function () {
    return isMultipartRequest(this)
  })

  fastify.decorateRequest('multipartFiles', fastifyDecoratedValue([]))
  fastify.decorateRequest('multipartFields', fastifyDecoratedValue([]))
  fastify.decorateRequest('multipartEntries', fastifyDecoratedValue([])) // multipartFiles + multipartFields

  // lets name temp files with an index
  // anyway, temp dir will be unique
  let nextTempFileIndex = 0
  fastify.decorate(
    'getNextMultipartTempFileName',
    () => `${nextTempFileIndex++}`,
  )

  fastify.addContentTypeParser(
    'multipart/form-data',
    createContentTypeParser({
      maxInMemoryFileSize,
      maxBodyLimit,
      tempDir,
      busboyConfig: options?.busboy,
      busboyLimits: options?.busboyLimits,
    }),
  )

  fastify.addHook('onResponse', async (req, _repl) => {
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