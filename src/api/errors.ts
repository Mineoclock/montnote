export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const BadRequest = (msg: string) => new ApiError(400, 'BadRequest', msg)
export const Unauthorized = (msg = 'Unauthorized') => new ApiError(401, 'Unauthorized', msg)
export const Forbidden = (msg = 'Forbidden') => new ApiError(403, 'Forbidden', msg)
export const NotFound = (msg = 'Not Found') => new ApiError(404, 'NotFound', msg)

export function toApiError(err: unknown) {
  if (err instanceof ApiError) return err
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>
    const status = typeof record.status === 'number' ? record.status : 0
    const code = typeof record.code === 'string' ? record.code : 'Unknown'
    const message = typeof record.message === 'string' ? record.message : '请求失败'
    return new ApiError(status, code, message)
  }
  return new ApiError(0, 'Unknown', '请求失败')
}
