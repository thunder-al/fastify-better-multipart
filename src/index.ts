import {fastifyPlugin} from 'fastify-plugin'
import {type BetterMultipartPluginOptions, pluginFunction} from './plugin.ts'
import {MultipartField, MultipartFile} from './entry.ts'

export {kIsMultipart, type BetterMultipartPluginOptions} from './plugin.ts'
export {MultipartFile, MultipartField} from './entry.ts'

export const betterMultipartPlugin = fastifyPlugin<BetterMultipartPluginOptions>(
  pluginFunction,
  {
    name: '@thunderal/fastify-better-multipart',
    fastify: '5.x',
  },
)

export default betterMultipartPlugin

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Returns true if the request is a multipart request.
     */
    isMultipart: () => boolean

    /**
     * Contains an array of `MultipartFile` uploaded files.
     */
    multipartFiles: Array<MultipartFile>

    /**
     * Contains an array of `MultipartField` uploaded fields.
     * (useful if you want to get more data about the field)
     */
    multipartFields: Array<MultipartField>

    /**
     * Contains an array of `MultipartFile` and `MultipartField` entries.
     */
    multipartEntries: Array<MultipartFile | MultipartField>
  }

  interface FastifyInstance {
    /**
     * Returns a unique temporary file name for multipart uploads.
     * (used internally)
     * @internal
     */
    getNextMultipartTempFileName: (request: FastifyRequest) => string
  }
}