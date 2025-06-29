import {createError} from '@fastify/error'

// most of the errors are copied from @fastify/multipart

export const PartsLimitError = createError('FST_PARTS_LIMIT', 'reach parts limit', 413)
export const FilesLimitError = createError('FST_FILES_LIMIT', 'reach files limit', 413)
export const FieldsLimitError = createError('FST_FIELDS_LIMIT', 'reach fields limit', 413)
export const RequestTooLargeError = createError('FST_REQ_TOO_LARGE', 'request is too large', 413)
export const RequestFileTooLargeError = createError('FST_REQ_FILE_TOO_LARGE', 'request file too large', 413)
export const PrototypeViolationError = createError('FST_PROTO_VIOLATION', 'prototype property is not allowed as field name', 400)
export const InvalidJSONFieldError = createError('FST_INVALID_JSON_FIELD_ERROR', 'a request field is not a valid JSON as declared by its Content-Type', 406)
export const InvalidMultipartContentTypeError = createError('FST_INVALID_MULTIPART_CONTENT_TYPE', 'the request is not multipart', 406)
export const FileBufferNotFoundError = createError('FST_FILE_BUFFER_NOT_FOUND', 'the file buffer was not found', 500)
