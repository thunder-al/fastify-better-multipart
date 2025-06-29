import type {FastifyRequest} from 'fastify'
import {kIsMultipart} from './plugin.ts'
import type {Readable} from 'node:stream'

export type JsonType = { [key: string]: JsonType } | Array<JsonType> | string | number | boolean | null

/**
 * Parses a size in string format (e.g., "10MB", "1GB") or number format (e.g., 1024) into bytes.
 * supports only "KB", "MB", "GB" suffixes.
 */
export function parseSize(size: string | number): number {
  if (typeof size === 'number') {
    return size
  }

  const match = size.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/)
  if (!match) {
    throw new Error(`Invalid size format: ${size}`)
  }

  const value = parseFloat(match[1])
  const unit = match[2]?.toUpperCase() || ''

  switch (unit) {
    case 'KB':
      return value * 1024
    case 'MB':
      return value * 1024 * 1024
    case 'GB':
      return value * 1024 * 1024 * 1024
    default:
      return value
  }
}

/**
 * Checks if the request is a multipart request.
 */
export function isMultipartRequest(request: FastifyRequest) {
  return (<any>request)[kIsMultipart] === true
}

/**
 * Drains a stream by consuming all its data until it ends or closes.
 */
export function drainStream(stream: Readable) {
  // copied from @fastify/multipart

  return new Promise<void>((resolve, reject) => {

    stream.on('data', () => {
      // nothing
    })

    stream.on('close', () => resolve())

    stream.on('end', () => resolve())

    stream.on('error', (error: Error) => reject(error))
  })
}