import type { ServerResponse } from 'node:http'

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.end(JSON.stringify(payload))
}

export function sendNoContent(response: ServerResponse) {
  response.statusCode = 204
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.end()
}

export function asHttpError(error: unknown) {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof Error) {
    return new HttpError(error.message, 500)
  }

  return new HttpError('未知服务异常。', 500)
}
