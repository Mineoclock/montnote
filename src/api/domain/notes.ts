import type { Note, NoteListItem, NoteWrite } from '../types'
import { BadRequest, Forbidden, NotFound } from '../errors'
import * as oss from '../oss'
import * as key from './key'
import * as notebooks from './notebooks'
import * as trash from './trash'
import { decodeCursor, encodeCursor } from './cursor'
import { derivePreview } from './preview'

const LIMITS = { content: 1_000_000 }
const LIST_BATCH = 100

function validate(body: NoteWrite, requireContent: boolean) {
  if (requireContent && (!body.text || !body.text.trim())) throw BadRequest('text is required')
  if (body.notebookId) notebooks.validateId(body.notebookId)
  if (body.text && body.text.length > LIMITS.content) throw BadRequest('笔记内容过长，最多支持 100 万字符')
}

function assertOwner(k: string, userId: string) {
  if (!key.belongsTo(k, userId)) throw Forbidden()
}

export async function create(userId: string, body: NoteWrite) {
  validate(body, true)
  const now = Date.now()
  const notebookId = await notebooks.ensure(userId, body.notebookId || notebooks.DEFAULT_NOTEBOOK_ID)
  const rev = key.revTs(now)
  const preview = derivePreview(body.text)
  const k = key.build(userId, { revTs: rev, notebookId, title: preview.title, summary: preview.summary })
  const obj = { notebookId, content: body.content, text: body.text || '', createdAt: now, updatedAt: now }
  await oss.putObject(k, obj)
  return { key: k, createdAt: now, updatedAt: now }
}

export async function get(userId: string, noteKey: string): Promise<Omit<Note, 'key'>> {
  if (!noteKey) throw BadRequest('key is required')
  assertOwner(noteKey, userId)
  const obj = await oss.getObject<Omit<Note, 'key'>>(noteKey)
  if (!obj) throw NotFound()
  const parsed = key.parse(noteKey)
  const notebookNames = await notebooks.namesById(userId)
  const notebookId = notebookNames.has(parsed.notebookId) ? parsed.notebookId : notebooks.DEFAULT_NOTEBOOK_ID
  return { ...obj, notebookId }
}

export async function list(
  userId: string,
  { notebook, token, limit = 50 }: { notebook?: string; token?: string; limit?: number }
) {
  const notebookId = notebook
  const cappedLimit = Math.max(1, Math.min(1000, Number(limit) || 50))
  const prefix = key.ownerPrefix(userId)
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

    let batch = res.objects.map(key.parse).map((item) => {
      const id = notebookNames.has(item.notebookId) ? item.notebookId : notebooks.DEFAULT_NOTEBOOK_ID
      return { ...item, notebookId: id, notebookName: notebookNames.get(id) || notebooks.DEFAULT_NOTEBOOK_NAME }
    })
    if (notebookId) batch = batch.filter((i) => i.notebookId === notebookId)
    const rows = batch.map(({ key: k, notebookId: nb, notebookName, title, summary, updatedAt }) => ({
      key: k,
      notebookId: nb,
      notebookName,
      title,
      summary,
      updatedAt
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

export async function update(userId: string, body: NoteWrite & { key: string }) {
  validate(body, true)
  const oldKey = body.key
  if (!oldKey) throw BadRequest('key is required')
  assertOwner(oldKey, userId)

  const oldObj = await oss.getObject<Omit<Note, 'key'>>(oldKey)
  const now = Date.now()
  const notebookId = await notebooks.ensure(userId, body.notebookId || notebooks.DEFAULT_NOTEBOOK_ID)
  const rev = key.revTs(now)
  const preview = derivePreview(body.text)
  const newKey = key.build(userId, { revTs: rev, notebookId, title: preview.title, summary: preview.summary })

  if (oldObj) {
    const obj = { notebookId, content: body.content, text: body.text || '', createdAt: oldObj.createdAt, updatedAt: now }
    await oss.putObject(newKey, obj)
    void oss.deleteObject(oldKey)
    return { key: newKey, updatedAt: now }
  }

  const obj = { notebookId, content: body.content, text: body.text || '', createdAt: now, updatedAt: now }
  await oss.putObject(newKey, obj)
  return { key: newKey, updatedAt: now, savedAsNew: true }
}

export async function remove(userId: string, noteKey: string) {
  if (!noteKey) throw BadRequest('key is required')
  assertOwner(noteKey, userId)
  return trash.moveFromNotes(userId, noteKey)
}
