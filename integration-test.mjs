import Fastify from 'fastify'
import axios from 'axios'
import {betterMultipartPlugin} from './dist/index.js'


const http = Fastify({logger: true})

http.setErrorHandler(err => {
  if (err.statusCode && err.statusCode >= 500) {
    console.error('Error:', err)
    process.exit(1)
  }
})

http.register(betterMultipartPlugin, {
  maxBodyLimit: '10 MB', // limit to 10MB for testing
  maxInMemoryFileSize: 2000, // limit in-memory file size to 2KB
})

http.post('/', async (req, reply) => {
  const field = req.body.field
  if (field !== 'qwe') {
    throw new Error('Fail: field value is not "qwe"')
  }

  const fileSmall = req.body.fileSmall
  if (!fileSmall) {
    throw new Error('Fail: fileSmall is not present')
  }
  if (fileSmall.size !== 1024) {
    throw new Error(`Fail: fileSmall size is not 1024 bytes (got ${fileSmall.size} bytes)`)
  }
  if (!fileSmall.isInMemory) {
    throw new Error('Fail: fileSmall is not in memory')
  }
  const fileSmallBuffer = await fileSmall.toBuffer()
  if (fileSmallBuffer.length !== 1024) {
    throw new Error(`Fail: fileSmall buffer length is not 1024 bytes (got ${fileSmallBuffer.length} bytes)`)
  }
  if (!fileSmallBuffer.every(byte => byte === 1)) {
    throw new Error('Fail: fileSmall buffer does not contain all bytes equal to 1')
  }


  const fileBig = req.body.fileBig
  if (!fileBig) {
    throw new Error('Fail: fileBig is not present')
  }
  if (fileBig.size !== 1024 * 1024 * 5) {
    throw new Error(`Fail: fileBig size is not 5MB (got ${fileBig.size / 1024 / 1024}MB)`)
  }
  if (fileBig.isInMemory) {
    throw new Error('Fail: fileBig is in memory, but it should be on disk due to size limit')
  }
  const fileBigBuffer = await fileBig.toBuffer()
  if (fileBigBuffer.length !== 1024 * 1024 * 5) {
    throw new Error(`Fail: fileBig buffer length is not 10MB (got ${fileBigBuffer.length / 1024 / 1024}MB)`)
  }
  if (!fileBigBuffer.every(byte => byte === 2)) {
    throw new Error('Fail: fileBig buffer does not contain all bytes equal to 2')
  }

})

await http.listen({
  host: '127.0.0.1',
  port: 2353,
})

const formData = new FormData

// just field. string
formData.set('field', 'qwe')

// small file
formData.set('fileSmall', new Blob([Buffer.alloc(1024).fill(1)]))

// big file
formData.set('fileBig', new Blob([Buffer.alloc(1024 * 1024 * 5).fill(2)]))

await axios.post('http://127.0.0.1:2353', formData, {})

await http.close()

console.log('done')