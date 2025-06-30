import {test} from 'vitest'
import {createRandomFile} from './commons.ts'
import {betterMultipartPlugin} from '../index.ts'
import {fastify} from 'fastify'

test('basic usage', async ({onTestFinished, expect}) => {
  const http = fastify({})

  http.register(betterMultipartPlugin, {
    maxBodyLimit: '1 MB',
  })

  http.post('/', async (req) => {
    expect(req.isMultipart(), 'is multipart request').toBe(true)
    return {success: true}
  })

  const tooLargeRequestPattern = expect.objectContaining({
    statusCode: 413,
    code: 'FST_REQ_TOO_LARGE',
    message: 'request is too large',
  })

  const formData1 = new FormData()
  formData1.append('file1', await createRandomFile(1024 * 1024)) // 1 MB

  // must file because of maxBodyLimit < file+formFata
  const response1 = await http.inject({
    method: 'POST',
    url: '/',
    body: formData1,
  })
  expect(response1.json()).toEqual(tooLargeRequestPattern)

  const formData2 = new FormData()
  formData2.append('file1', await createRandomFile(1000 * 1024)) // almost 1 MB, but less than maxBodyLimit

  const response2 = await http.inject({
    method: 'POST',
    url: '/',
    body: formData2,
  })
  expect(response2.json()).toEqual({success: true})

  const formData3 = new FormData()
  // multiple files that are more than maxBodyLimit
  formData3.append('file1', await createRandomFile(300 * 1024)) // 300 KB
  formData3.append('file2', await createRandomFile(300 * 1024)) // 300 KB
  formData3.append('file3', await createRandomFile(300 * 1024)) // 300 KB
  formData3.append('file3', await createRandomFile(300 * 1024)) // 300 KB

  const response3 = await http.inject({
    method: 'POST',
    url: '/',
    body: formData3,
  })
  expect(response3.json()).toEqual(tooLargeRequestPattern)
})