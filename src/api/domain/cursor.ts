import { BadRequest } from '../errors'

interface Cursor {
  t: string
  c: number
}

export function encodeCursor(t: string, c: number) {
  return btoa(JSON.stringify({ t, c }))
}

export function decodeCursor(cursor: string | undefined, message = 'Invalid token'): Cursor {
  if (!cursor) return { t: '', c: 0 }
  try {
    const parsed = JSON.parse(atob(cursor)) as Partial<Cursor>
    return { t: String(parsed.t || ''), c: Number(parsed.c) || 0 }
  } catch {
    throw BadRequest(message)
  }
}
