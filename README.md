# @thunderal/fastify-better-multipart

A multipart form data body parser plugin for Fastify that just works.

![](./logo.svg)

Works similar to [`@fastify/multipart`](https://github.com/fastify/fastify-multipart) and uses the same underlying
parsing library [`@fastify/busboy`](https://github.com/fastify/busboy) to parse multipart form data,
but provides a more intuitive API and predictable behavior.

## Features

- 🚀 **Easy to use**: Simple API with both promise-based and streaming interfaces
- 🔄 **Memory-efficient**: Configurable in-memory file size limits
- 📁 **Automatic file handling**: Smart management of temporary files
- 🧠 **Type-safe**: Written in TypeScript with full type definitions
- ⚡ **High performance**: Built on top of @fastify/busboy for optimal parsing speed
- 🔍 **Intuitive access**: Access form fields directly from the request body or dedicated arrays
- 📦 **Lightweight**: Minimal dependencies, focused on multipart parsing
- 🔧 **CJS, ESM, DTS and TypeScript** support

## How It Works

This plugin aims to provide simple yet resource-efficient handling of `multipart/form-data`.

The plugin automatically parses incoming multipart requests before validation, that means you can
validate requests fields and files using Fastify's built-in validation features.

Each multipart field (not file) attaches to the request body as a string.

Each uploaded file is represented as an instance of `MultipartFile` and its data placed in buffer unless
it exceeds the `maxInMemoryFileSize` limit, in which case it is saved to a temporary file on disk.  
Each `MultipartFile` have a `localTempPath` property that points to the temporary file location on disk,
but this file exists only if the file was saved to disk if it exceeds the `maxInMemoryFileSize` limit
or `persistToDisk()` method was called, so you should always call `persistToDisk()` method if you need to
access the file by its `localTempPath` path.

All multipart entries are available in the request as arrays:

- `request.multipartFiles` - an array of all uploaded files as `MultipartFile` instances
- `request.multipartFields` - an array of all form fields as `MultipartField` instances
- `request.multipartEntries` - an array of all entries (files and fields) as `MultipartFile | MultipartField` instances

All multipart files persisted to disk delete themselves automatically when the request is finished.

## Installation

```bash
# Using npm
npm install @thunderal/fastify-better-multipart

# Using yarn
yarn add @thunderal/fastify-better-multipart

# Using pnpm
pnpm add @thunderal/fastify-better-multipart
```

## Usage

### Basic Example

```js
//
// server
//

import fastify from 'fastify'
import betterMultipartPlugin from '@thunderal/fastify-better-multipart'

const app = fastify()

// Register the plugin
app.register(betterMultipartPlugin, {
  maxBodyLimit: '100MB', // Maximum size of the entire request (default: 100MB)
  maxInMemoryFileSize: '5MB', // Files larger than this will be saved to disk (default: 5MB)
})

// Create a route that handles multipart form data
app.post('/upload', async (request, reply) => {
  const file = req.body.someFile // MultipartFile. Access the uploaded file
  const field = req.body.someField // string. Access a regular form field

  file.fileName // Original filename
  file.mimetype // MIME type of the file
  file.size // Size of the file in bytes
  await file.toBuffer() // Get file content as a Buffer (warning: may cause OOM if file is large)
  file.toStream() // Get a readable stream of the file content

  await file.persistToDisk() // Save the file to disk if it is in memory
  file.localTempPath // Path where the file is stored on disk (may not exist if `persistToDisk` was not called)
})

app.listen({port: 3000})

//
// client
//

const formData = new FormData()
formData.append('someFile', fileInput.files[0]) // Append a file from an input element
formData.append('someField', 'someValue') // Append a regular form field

const response = await fetch('http://localhost:3000/upload', {
  method: 'POST',
  body: formData,
})
```

## API Reference

### MultipartFile Properties and Methods

| Property/Method   | Type              | Description                                     |
|-------------------|-------------------|-------------------------------------------------|
| `fieldName`       | `string`          | Name of the form field the file was uploaded as |
| `fileName`        | `string`          | Original filename provided by the client        |
| `mimetype`        | `string`          | MIME type of the file                           |
| `encoding`        | `string`          | Encoding of the file                            |
| `size`            | `number`          | Size of the file in bytes                       |
| `isInMemory`      | `boolean`         | Whether the file is stored in memory or on disk |
| `isPersisted`     | `boolean`         | Whether the file is stored on disk              |
| `isDestroyed`     | `boolean`         | Whether the file has been destroyed             |
| `localTempPath`   | `string`          | Local temporary path where the file is stored   |
| `persistToDisk()` | `Promise<void>`   | Saves the file to disk if it is in memory       |
| `toBuffer()`      | `Promise<Buffer>` | Returns the file content as a Buffer            |
| `toStream()`      | `ReadableStream`  | Returns a readable stream of the file content   |

### Request Decorations

| Property/Method    | Type                                     | Description                                        |
|--------------------|------------------------------------------|----------------------------------------------------|
| `isMultipart()`    | `boolean`                                | Returns true if the request is a multipart request |
| `multipartFiles`   | `Array<MultipartFile>`                   | Array of uploaded files                            |
| `multipartFields`  | `Array<MultipartField>`                  | Array of form fields                               |
| `multipartEntries` | `Array<MultipartFile \| MultipartField>` | Array of all entries (files and fields)            |

## License

MIT © ThunderAl
