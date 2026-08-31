import type { NoteListItem } from '../types'
import { BadRequest } from '../errors'
import * as oss from '../oss'
import * as key from './key'
import * as trashKey from './trash-key'
import * as notebooks from './notebooks'
import { decodeCursor, encodeCursor } from './cursor'

const PAGE_SIZE = 20
const BATCH_SIZE = 100
const PARALLEL_CHUNK = 20

interface StoredNote {
  text?: string
}

function matches(obj: StoredNote, q: string) {
  return obj.text && obj.text.toLowerCase().includes(q.toLowerCase())
}

async function fetchChunk(keys: string[]) {
  const results: { key: string; obj: StoredNote }[] = []
  for (let i = 0; i < keys.length; i += PARALLEL_CHUNK) {
    const chunk = keys.slice(i, i + PARALLEL_CHUNK)
    const batch = await Promise.all(chunk.map(async (k) => {
      const obj = await oss.getObject<StoredNote>(k)
      return obj ? { key: k, obj } : null
    }))
    results.push(...batch.filter((item): item is { key: string; obj: StoredNote } => Boolean(item)))
  }
  return results
}

function sourceAdapter(source: 'notes' | 'trash' | undefined) {
  if (!source || source === 'notes') {
    return {
      ownerPrefix: key.ownerPrefix,
      parse: key.parse,
      timeField: 'updatedAt' as const
    }
  }
  if (source === 'trash') {
    return {
      ownerPrefix: trashKey.ownerPrefix,
      parse: trashKey.parse,
      timeField: 'deletedAt' as const
    }
  }
  throw BadRequest('invalid source')
}

export async function search(
  userId: string,
  input: { q: string; notebook?: string; cursor?: string; source?: 'notes' | 'trash' }
) {
  if (!input.q || !input.q.trim()) throw BadRequest('q is required')

  const adapter = sourceAdapter(input.source)
  const notebookId = input.notebook
  const notebookNames = await notebooks.namesById(userId)
  const { t, c } = decodeCursor(input.cursor, 'Invalid cursor')
  const prefix = adapter.ownerPrefix(userId)
  const results: NoteListItem[] = []
  let token = t || undefined
  let skip = c

  while (results.length < PAGE_SIZE) {
    const opts: { prefix: string; 'max-keys': number; 'continuation-token'?: string } = {
      prefix,
      'max-keys': BATCH_SIZE
    }
    if (token) opts['continuation-token'] = token
    const res = await oss.listV2(opts)

    if (res.objects.length === 0) return { items: results, nextCursor: null }

    const fetched = await fetchChunk(res.objects)
    const batchMatches: NoteListItem[] = []
    for (const { key: objectKey, obj } of fetched) {
      const parsed = adapter.parse(objectKey)
      const id = notebookNames.has(parsed.notebookId) ? parsed.notebookId : notebooks.DEFAULT_NOTEBOOK_ID
      if (notebookId && id !== notebookId) continue
      if (matches(obj, input.q)) {
        const item: NoteListItem = {
          key: objectKey,
          notebookId: id,
          notebookName: notebookNames.get(id) || notebooks.DEFAULT_NOTEBOOK_NAME,
          title: parsed.title,
          summary: parsed.summary
        }
        if (adapter.timeField === 'updatedAt' && 'updatedAt' in parsed) item.updatedAt = parsed.updatedAt
        if (adapter.timeField === 'deletedAt' && 'deletedAt' in parsed) item.deletedAt = parsed.deletedAt
        batchMatches.push(item)
      }
    }

    const available = batchMatches.slice(skip)
    skip = 0
    const take = available.slice(0, PAGE_SIZE - results.length)
    results.push(...take)

    if (results.length >= PAGE_SIZE) {
      const consumed = batchMatches.length - (available.length - take.length)
      if (take.length < available.length) return { items: results, nextCursor: encodeCursor(token || '', consumed) }
      if (res.nextToken) return { items: results, nextCursor: encodeCursor(res.nextToken, 0) }
      return { items: results, nextCursor: null }
    }

    if (!res.nextToken) break
    token = res.nextToken
  }

  return { items: results, nextCursor: null }
}
