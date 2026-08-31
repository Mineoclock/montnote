import type { Notebook } from '../types'
import { BadRequest } from '../errors'
import * as oss from '../oss'
import * as noteKey from './key'
import { derivePreview } from './preview'

export const DEFAULT_NOTEBOOK_ID = 'default'
export const DEFAULT_NOTEBOOK_NAME = '默认笔记本'

const NAME_MAX = 20
const ID_LEN = 7
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

interface NotebookRegistry {
  notebooks?: Notebook[]
}

function regKey(userId: string) {
  return `${userId}/notebooks.json`
}

export function validateName(name: string) {
  if (!name || !name.trim()) throw BadRequest('notebook name is required')
  if (name.length > NAME_MAX) throw BadRequest('notebook name too long')
}

export function validateId(id: string) {
  if (!id || (id !== DEFAULT_NOTEBOOK_ID && !/^[a-z0-9]{7}$/.test(id))) throw BadRequest('invalid notebook id')
}

function defaultNotebook() {
  return { id: DEFAULT_NOTEBOOK_ID, name: DEFAULT_NOTEBOOK_NAME }
}

function makeId() {
  let id = ''
  for (let i = 0; i < ID_LEN; i += 1) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
  return id
}

function normalize(notebooks: unknown): Notebook[] {
  const out: Notebook[] = []
  const seen = new Set<string>()
  for (const nb of Array.isArray(notebooks) ? notebooks : []) {
    if (!nb || typeof nb !== 'object') continue
    const record = nb as Partial<Notebook>
    if (!record.id || !record.name || seen.has(record.id)) continue
    out.push({ id: String(record.id), name: String(record.name) })
    seen.add(record.id)
  }
  if (!seen.has(DEFAULT_NOTEBOOK_ID)) out.unshift(defaultNotebook())
  return out
}

async function load(userId: string) {
  const obj = await oss.getObject<NotebookRegistry>(regKey(userId))
  if (!obj) {
    const notebooks = [defaultNotebook()]
    await save(userId, notebooks)
    return notebooks
  }
  return normalize(obj?.notebooks)
}

async function save(userId: string, names: Notebook[]) {
  await oss.putObject(regKey(userId), { notebooks: names })
}

export async function list(userId: string) {
  return { notebooks: await load(userId) }
}

export async function create(userId: string, name: string) {
  validateName(name)
  const notebooks = await load(userId)
  if (notebooks.some((nb) => nb.name === name)) throw BadRequest('notebook already exists')
  let id = makeId()
  while (notebooks.some((nb) => nb.id === id) || id === DEFAULT_NOTEBOOK_ID) id = makeId()
  notebooks.push({ id, name })
  await save(userId, notebooks)
  return { notebooks }
}

export async function rename(userId: string, id: string, name: string) {
  if (id === DEFAULT_NOTEBOOK_ID) throw BadRequest('default notebook cannot be renamed')
  validateId(id)
  validateName(name)
  const notebooks = await load(userId)
  const target = notebooks.find((nb) => nb.id === id)
  if (!target) throw BadRequest('notebook not found')
  if (notebooks.some((nb) => nb.id !== id && nb.name === name)) throw BadRequest('notebook already exists')
  target.name = name
  await save(userId, notebooks)
  return { notebooks }
}

export async function remove(userId: string, id: string) {
  if (id === DEFAULT_NOTEBOOK_ID) throw BadRequest('default notebook cannot be deleted')
  validateId(id)
  const notebooks = await load(userId)
  if (!notebooks.some((nb) => nb.id === id)) throw BadRequest('notebook not found')
  const next = notebooks.filter((nb) => nb.id !== id)
  await save(userId, next)
  return { notebooks: next }
}

export async function ensure(userId: string, id: string) {
  validateId(id)
  const notebooks = await load(userId)
  if (notebooks.some((nb) => nb.id === id)) return id
  return DEFAULT_NOTEBOOK_ID
}

export async function namesById(userId: string) {
  const notebooks = await load(userId)
  return new Map(notebooks.map((nb) => [nb.id, nb.name]))
}

export async function moveNotes(userId: string, fromId: string, toId: string) {
  let token: string | null = null
  do {
    const opts: { prefix: string; 'max-keys': number; 'continuation-token'?: string } = {
      prefix: noteKey.ownerPrefix(userId),
      'max-keys': 1000
    }
    if (token) opts['continuation-token'] = token
    const res = await oss.listV2(opts)
    for (const k of res.objects) {
      const parsed = noteKey.parse(k)
      if (parsed.notebookId !== fromId) continue
      const obj = await oss.getObject<Record<string, unknown>>(k)
      if (!obj) continue
      obj.notebookId = toId
      delete obj.title
      delete obj.notebook
      const preview = derivePreview(String(obj.text || ''))
      const newKey = noteKey.build(userId, {
        revTs: parsed.revTs,
        notebookId: toId,
        title: preview.title,
        summary: preview.summary
      })
      await oss.putObject(newKey, obj)
      if (newKey !== k) await oss.deleteObject(k)
    }
    token = res.nextToken
  } while (token)
}
