export interface OssCredentials {
  region: string
  bucket: string
  username: string
  accessKeyId: string
  accessKeySecret: string
}

const LS_KEY = 'montnote.oss.credentials'
const LEGACY_SK_KEY = 'montnote.sk'
const VERSION = 3

function xorEncryptDecrypt(data: string, key: string): string {
  if (!key) return data
  let result = ''
  for (let i = 0; i < data.length; i += 1) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return result
}

function encode(data: string, key: string): string {
  return btoa(xorEncryptDecrypt(data, key))
}

function decode(data: string, key: string): string {
  return xorEncryptDecrypt(atob(data), key)
}

function secretKey(): string {
  const key = import.meta.env.VITE_CREDENTIALS_KEY
  if (!key) {
    throw new Error('缺少环境变量 VITE_CREDENTIALS_KEY，请在 .env 中配置')
  }
  return key
}

function normalizeCredentials(input: OssCredentials): OssCredentials {
  return {
    region: String(input.region ?? '').trim(),
    bucket: String(input.bucket ?? '').trim(),
    username: normalizeUsername(String(input.username ?? '')),
    accessKeyId: String(input.accessKeyId ?? '').trim(),
    accessKeySecret: String(input.accessKeySecret ?? '').trim()
  }
}

function normalizeUsername(username: string) {
  return username.replace(/^\/+|\/+$/g, '')
}

function validateCredentials(credentials: OssCredentials) {
  if (!credentials.region) throw new Error('OSS Region 不能为空')
  if (!credentials.bucket) throw new Error('OSS Bucket 不能为空')
  validateUsername(credentials.username)
  if (!credentials.accessKeyId) throw new Error('AccessKey ID 不能为空')
  if (!credentials.accessKeySecret) throw new Error('AccessKey Secret 不能为空')
}

function validateUsername(username: string) {
  const segments = username.split('/')
  if (
    !username ||
    username.length > 128 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9_.-]+$/.test(segment))
  ) {
    throw new Error('OSS 目录前缀只能包含字母、数字、点、下划线、连字符和斜杠，长度 1-128')
  }
}

export async function saveCredentials(input: OssCredentials) {
  const credentials = normalizeCredentials(input)
  validateCredentials(credentials)
  const encrypted = encode(JSON.stringify(credentials), secretKey())
  localStorage.setItem(LS_KEY, JSON.stringify({ v: VERSION, data: encrypted }))
  localStorage.removeItem(LEGACY_SK_KEY)
  return credentials
}

export async function loadCredentials(): Promise<OssCredentials | null> {
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) return null
  try {
    const payload = JSON.parse(raw) as { v?: number; data?: string }
    if (payload.v !== VERSION || !payload.data) return null
    const decrypted = decode(payload.data, secretKey())
    const credentials = normalizeCredentials(JSON.parse(decrypted) as OssCredentials)
    validateCredentials(credentials)
    return credentials
  } catch {
    localStorage.removeItem(LS_KEY)
    return null
  }
}

export function clearCredentials() {
  localStorage.removeItem(LS_KEY)
  localStorage.removeItem(LEGACY_SK_KEY)
}
