import {test} from 'vitest'
import {createRandomFile, readStreamToBuffer} from './commons.ts'
import {betterMultipartPlugin, MultipartFile} from '../index.ts'
import {fastify} from 'fastify'

test('basic usage', async ({expect}) => {
  const http = fastify({})

  http.register(betterMultipartPlugin, {
    maxBodyLimit: '4 MB',
    maxInMemoryFileSize: '2 KB',
  })

  http.post('/', async (req) => {
    expect(req.isMultipart(), 'is multipart request').toBe(true)

    const body = req.body as any

    // fields

    expect(body.field1, 'field1').toBe('just string')
    expect(body.field2, 'field2').toBe('another string')
    expect(body.field3, 'field3').toBe('string filed after file entries')

    // file1

    const file1 = body.file1 as MultipartFile
    const file1Buffer = await file1.toBuffer()
    expect(file1.size).toBe(1024) // 1 KB
    expect(file1.length).toBe(1024) // 1 KB (same as above)
    expect(file1Buffer).toHaveLength(1024) // 1 KB (actual buffer size)
    expect(file1.isInMemory).toBe(true) // small file. stored in memory
    expect(file1.isPersisted).toBe(false) // stored in memory
    expect(file1.isDestroyed).toBe(false) // exists and not destroyed
    expect(file1.fileName).toBe('file-1024.bin') // file name from "user"
    expect(
      Buffer.compare(file1Buffer, await file1.toBuffer()),
      'file1 content iterative read check',
      // multiple reads should return the same buffer
    ).toBe(0)
    expect(
      Buffer.compare(file1Buffer, await readStreamToBuffer(file1.toStream())),
      'file1 content stream read check',
      // stream read should return the same buffer
    ).toBe(0)

    // file2

    const file2 = body.file2 as MultipartFile
    const file2Buffer = await file2.toBuffer()
    expect(file2.size).toBe(4096) // 4 KB
    expect(file2.length).toBe(4096) // 4 KB (same as above)
    expect(file2Buffer).toHaveLength(4096) // 4 KB (actual buffer size)
    expect(file2.isInMemory).toBe(false) // big file. stored on disk
    expect(file2.isPersisted).toBe(true) // stored on disk
    expect(file2.isDestroyed).toBe(false) // exists and not destroyed
    expect(file2.fileName).toBe('file-4096.bin') // file name from "user"
    expect(
      Buffer.compare(file2Buffer, await file2.toBuffer()),
      'file2 content iterative read check',
      // multiple reads should return the same buffer
    ).toBe(0)
    expect(
      Buffer.compare(file2Buffer, await readStreamToBuffer(file2.toStream())),
      'file2 content stream read check',
      // stream read should return the same buffer
    ).toBe(0)

    // file3

    const file3 = body.file3 as MultipartFile
    const file3Buffer = await file3.toBuffer()
    expect(file3.size).toBe(2 * 1024 * 1024) // 2 MB
    expect(file3.length).toBe(2 * 1024 * 1024) // 2 MB (same as above)
    expect(file3Buffer).toHaveLength(2 * 1024 * 1024) // 2 MB (actual buffer size)
    expect(file3.isInMemory).toBe(false) // big file. stored on disk
    expect(file3.isPersisted).toBe(true) // stored on disk
    expect(file3.isDestroyed).toBe(false) // exists and not destroyed
    expect(file3.fileName).toBe('file-2097152.bin') // file name from "user"
    expect(
      Buffer.compare(file3Buffer, await file3.toBuffer()),
      'file3 content iterative read check',
      // multiple reads should return the same buffer
    ).toBe(0)
    expect(
      Buffer.compare(file3Buffer, await readStreamToBuffer(file3.toStream())),
      'file3 content stream read check',
      // stream read should return the same buffer
    ).toBe(0)

    return {success: true}
  })

  const formData = new FormData()

  formData.append('field1', 'just string')
  formData.append('field2', 'another string')
  formData.append('file1', await createRandomFile(1024)) // 1 KB. must be in memory
  formData.append('file2', await createRandomFile(4 * 1024)) // 4 KB. must be saved to disk
  formData.append('file3', await createRandomFile(2 * 1024 * 1024)) // 2 MB. big. must be saved to disk
  formData.append('field3', 'string filed after file entries')

  const response = await http.inject({
    method: 'POST',
    url: '/',
    body: formData,
  })

  expect(response.json()).toEqual({success: true})
  expect(response.statusCode).toBe(200)
})