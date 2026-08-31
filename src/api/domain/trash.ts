import type { Note, NoteListItem, TrashNote } from '../types'
import { BadRequest, Forbidden, NotFound } from '../errors'
import * as oss from '../oss'
import * as noteKey from './key'
import * as trashKey from './trash-key'
import * as notebooks from './notebooks'
import { decodeCursor, encodeCursor } from './cursor'
import { derivePreview } from './preview'

const LIST_BATCH = 100

function makeTrashId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function assertTrashOwner(k: string, userId: string) {
  if (!trashKey.belongsTo(k, userId)) throw Forbidden()
}

function assertNoteOwner(k: string, userId: string) {
  if (!noteKey.belongsTo(k, userId)) throw Forbidden()
}

export async function moveFromNotes(userId: string, noteObjectKey: string) {
  if (!noteObjectKey) throw BadRequest('key is required')
  assertNoteOwner(noteObjectKey, userId)

  const obj = await oss.getObject<Omit<Note, 'key'>>(noteObjectKey)
  if (!obj) return { ok: true }

  const parsed = noteKey.parse(noteObjectKey)
  const deletedAt = Date.now()
  const deletedRev = noteKey.revTs(deletedAt)
  const trashObjectKey = trashKey.build(userId, {
    revTs: deletedRev,
    trashId: makeTrashId(),
    notebookId: parsed.notebookId,
    title: parsed.title,
    summary: parsed.summary
  })

  await oss.putObject(trashObjectKey, {
    ...obj,
    originalKey: noteObjectKey,
    originalNotebookId: parsed.notebookId,
    deletedAt
  })
  await oss.deleteObject(noteObjectKey)
  return { ok: true }
}

export async function list(
  userId: string,
  { notebook, token, limit = 50 }: { notebook?: string; token?: string; limit?: number }
) {
  const notebookId = notebook
  const cappedLimit = Math.max(1, Math.min(1000, Number(limit) || 50))
  const prefix = trashKey.ownerPrefix(userId)
  const notebookNames = await notebooks.namesById(userId)
  const { t, c } = decodeCursor(token)
  const items: NoteListItem[] = []
  let pageToken = t || undefined
  let skip = c

  while (items.length < cappedLimit) {
    const opts: { prefix: string; 'max-keys': number; 'continuation-token'?: string } = {
      prefix,
      'max-keys': LIST_BATCH
    }
    if (pageToken) opts['continuation-token'] = pageToken
    const res = await oss.listV2(opts)
    if (res.objects.length === 0) return { items, nextToken: null }

    let batch = res.objects.map(trashKey.parse).map((item) => {
      const id = notebookNames.has(item.notebookId) ? item.notebookId : notebooks.DEFAULT_NOTEBOOK_ID
      return { ...item, notebookId: id, notebookName: notebookNames.get(id) || notebooks.DEFAULT_NOTEBOOK_NAME }
    })
    if (notebookId) batch = batch.filter((i) => i.notebookId === notebookId)
    const rows = batch.map(({ key: k, notebookId: nb, notebookName, title, summary, deletedAt }) => ({
      key: k,
      notebookId: nb,
      notebookName,
      title,
      summary,
      deletedAt
    }))

    const available = rows.slice(skip)
    skip = 0
    const take = available.slice(0, cappedLimit - items.length)
    items.push(...take)

    if (items.length >= cappedLimit) {
      const consumed = rows.length - (available.length - take.length)
      if (take.length < available.length) return { items, nextToken: encodeCursor(pageToken || '', consumed) }
      if (res.nextToken) return { items, nextToken: encodeCursor(res.nextToken, 0) }
      return { items, nextToken: null }
    }

    if (!res.nextToken) break
    pageToken = res.nextToken
  }

  return { items, nextToken: null }
}

export async function get(userId: string, trashObjectKey: string): Promise<Omit<TrashNote, 'key'>> {
  if (!trashObjectKey) throw BadRequest('key is required')
  assertTrashOwner(trashObjectKey, userId)

  const obj = await oss.getObject<Omit<TrashNote, 'key'>>(trashObjectKey)
  if (!obj) throw NotFound()

  const parsed = trashKey.parse(trashObjectKey)
  const notebookNames = await notebooks.namesById(userId)
  const notebookId = notebookNames.has(parsed.notebookId) ? parsed.notebookId : notebooks.DEFAULT_NOTEBOOK_ID
  return { ...obj, notebookId, deletedAt: obj.deletedAt || parsed.deletedAt }
}

export async function restore(userId: string, trashObjectKey: string) {
  if (!trashObjectKey) throw BadRequest('key is required')
  assertTrashOwner(trashObjectKey, userId)

  const obj = await oss.getObject<Omit<TrashNote, 'key'>>(trashObjectKey)
  if (!obj) throw NotFound()

  const now = Date.now()
  const notebookId = await notebooks.ensure(userId, obj.originalNotebookId || obj.notebookId || notebooks.DEFAULT_NOTEBOOK_ID)
  const preview = derivePreview(obj.text)
  const newKey = noteKey.build(userId, {
    revTs: noteKey.revTs(now),
    notebookId,
    title: preview.title,
    summary: preview.summary
  })
  const restored = {
    notebookId,
    content: obj.content,
    text: obj.text || '',
    createdAt: obj.createdAt || now,
    updatedAt: now
  }

  await oss.putObject(newKey, restored)
  await oss.deleteObject(trashObjectKey)
  return { key: newKey, updatedAt: now }
}

export async function remove(userId: string, trashObjectKey: string) {
  if (!trashObjectKey) throw BadRequest('key is required')
  assertTrashOwner(trashObjectKey, userId)
  await oss.deleteObject(trashObjectKey)
  return { ok: true }
}

export async function removeMany(userId: string, trashObjectKeys: string[]) {
  if (!trashObjectKeys.length) return { success: [] as string[], errors: [] as string[] }
  for (const k of trashObjectKeys) {
    if (!k) throw BadRequest('key is required')
    assertTrashOwner(k, userId)
  }
  const res = await oss.deleteMulti(trashObjectKeys)
  return res
}
