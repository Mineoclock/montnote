import type { Note, NoteListItem, NoteWrite, Notebook, TrashNote } from './types'
import type { OssCredentials } from './credentials'
import { beginGlobalLoading, endGlobalLoading } from '@/composables/useGlobalLoading'
import { ApiError, toApiError, Unauthorized } from './errors'
import { currentUsername, setOssCredentials } from './oss'
import * as notes from './domain/notes'
import * as trash from './domain/trash'
import * as notebooks from './domain/notebooks'
import * as search from './domain/search'

export { ApiError }

const OSS_AUTH_ERROR_CODES = new Set([
  'AccessDenied',
  'InvalidAccessKeyId',
  'InvalidAccessKeySecret',
  'SignatureDoesNotMatch'
])

let unauthorizedHandler: (() => void) | null = null

export function setCredentials(credentials: OssCredentials | null) {
  setOssCredentials(credentials)
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

async function request<T>(fn: (userId: string) => Promise<T>): Promise<T> {
  beginGlobalLoading()
  try {
    const userId = currentUsername()
    return await fn(userId)
  } catch (err) {
    const apiError = toApiError(err)
    if (
      apiError.status === 401 ||
      apiError.code === 'Unauthorized' ||
      OSS_AUTH_ERROR_CODES.has(apiError.code)
    ) {
      unauthorizedHandler?.()
    }
    throw apiError
  } finally {
    endGlobalLoading()
  }
}

// --- notes ---
export function listNotes(p: { notebook?: string; token?: string; limit?: number } = {}) {
  return request<{ items: NoteListItem[]; nextToken: string | null }>((userId) => notes.list(userId, p))
}

export function getNote(key: string) {
  return request<Omit<Note, 'key'>>((userId) => notes.get(userId, key))
}

export function createNote(body: NoteWrite) {
  return request<{ key: string; createdAt: number; updatedAt: number }>((userId) => notes.create(userId, body))
}

export function updateNote(body: NoteWrite & { key: string }) {
  return request<{ key: string; updatedAt: number; savedAsNew?: boolean }>((userId) => notes.update(userId, body))
}

export function deleteNote(key: string) {
  return request<{ ok: true }>((userId) => notes.remove(userId, key) as Promise<{ ok: true }>)
}

export function searchNotes(p: { q: string; cursor?: string; source?: 'notes' | 'trash' }) {
  return request<{ items: NoteListItem[]; nextCursor: string | null }>((userId) => search.search(userId, p))
}

// --- trash ---
export function listTrash(p: { notebook?: string; token?: string; limit?: number } = {}) {
  return request<{ items: NoteListItem[]; nextToken: string | null }>((userId) => trash.list(userId, p))
}

export function getTrashNote(key: string) {
  return request<Omit<TrashNote, 'key'>>((userId) => trash.get(userId, key))
}

export function restoreTrashNote(key: string) {
  return request<{ key: string; updatedAt: number }>((userId) => trash.restore(userId, key))
}

export function deleteTrashNote(key: string) {
  return request<{ ok: true }>((userId) => trash.remove(userId, key) as Promise<{ ok: true }>)
}

export function deleteTrashNotes(keys: string[]) {
  return request<{ success: string[]; errors: string[] }>((userId) => trash.removeMany(userId, keys))
}

// --- notebooks ---
export function listNotebooks() {
  return request<{ notebooks: Notebook[] }>((userId) => notebooks.list(userId))
}

export function createNotebook(name: string) {
  return request<{ notebooks: Notebook[] }>((userId) => notebooks.create(userId, name))
}

export function renameNotebook(id: string, name: string) {
  return request<{ notebooks: Notebook[] }>((userId) => notebooks.rename(userId, id, name))
}

export function deleteNotebook(id: string) {
  return request<{ notebooks: Notebook[] }>((userId) => notebooks.remove(userId, id))
}

export function assertConfigured() {
  const region = import.meta.env.VITE_OSS_REGION
  const bucket = import.meta.env.VITE_OSS_BUCKET
  if (!region || !bucket) throw Unauthorized('未配置 OSS：请在 montnote-web/.env 设置 VITE_OSS_REGION 和 VITE_OSS_BUCKET 后重启')
}
