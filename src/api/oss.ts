import OSS from 'ali-oss'
import type { OssCredentials } from './credentials'
import { Unauthorized } from './errors'

interface ListOptions {
  prefix: string
  'max-keys'?: number
  'continuation-token'?: string
}

interface ListResult {
  objects: string[]
  nextToken: string | null
}

interface OssObject {
  name: string
}

interface OssListResponse {
  objects?: OssObject[]
  isTruncated?: boolean
  nextContinuationToken?: string
}

interface OssGetResponse {
  content?: unknown
}

interface OssClient {
  put(name: string, file: Blob | string, options?: unknown): Promise<unknown>
  get(name: string): Promise<OssGetResponse>
  delete(name: string): Promise<unknown>
  deleteMulti(names: string[]): Promise<{ deleted?: { Key: string }[]; deleteErrors?: { Key: string; Code: string; Message: string }[] }>
  listV2(options: ListOptions): Promise<OssListResponse>
}

const region = import.meta.env.VITE_OSS_REGION
const bucket = import.meta.env.VITE_OSS_BUCKET

let credentials: OssCredentials | null = null
let client: OssClient | null = null

export function setOssCredentials(next: OssCredentials | null) {
  credentials = next
  client = next
    ? new OSS({
      region,
      bucket,
      accessKeyId: next.accessKeyId,
      accessKeySecret: next.accessKeySecret,
      secure: true
    }) as OssClient
    : null
}

export function currentUsername() {
  if (!credentials) throw Unauthorized()
  return credentials.username
}

function activeClient() {
  if (!client) throw Unauthorized()
  if (!region || !bucket) throw new Error('未配置 OSS：请在 montnote-web/.env 设置 VITE_OSS_REGION 和 VITE_OSS_BUCKET 后重启')
  return client
}

async function contentToText(content: unknown) {
  if (typeof content === 'string') return content
  if (content instanceof Blob) return content.text()
  if (content instanceof ArrayBuffer) return new TextDecoder().decode(content)
  if (content instanceof Uint8Array) return new TextDecoder().decode(content)
  if (content && typeof content === 'object' && 'toString' in content) {
    return String((content as { toString: () => string }).toString())
  }
  return ''
}

export async function putObject(key: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json; charset=utf-8' })
  await activeClient().put(key, blob, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}

export async function getObject<T>(key: string): Promise<T | null> {
  try {
    const res = await activeClient().get(key)
    return JSON.parse(await contentToText(res.content)) as T
  } catch (err) {
    const record = err as { status?: number; code?: string }
    if (record.status === 404 || record.code === 'NoSuchKey') return null
    throw err
  }
}

export async function deleteObject(key: string) {
  try {
    await activeClient().delete(key)
  } catch {
    // best-effort
  }
}

export async function deleteMulti(keys: string[]): Promise<{ success: string[]; errors: string[] }> {
  if (keys.length === 0) return { success: [], errors: [] }
  try {
    const res = await activeClient().deleteMulti(keys)
    const success = (res.deleted || []).map((d) => d.Key)
    const errors = (res.deleteErrors || []).map((e) => e.Key)
    return { success, errors }
  } catch {
    return { success: [], errors: keys }
  }
}

export async function listV2(opts: ListOptions): Promise<ListResult> {
  const res = await activeClient().listV2(opts)
  return {
    objects: (res.objects || []).map((o) => o.name),
    nextToken: res.isTruncated ? res.nextContinuationToken || null : null
  }
}
