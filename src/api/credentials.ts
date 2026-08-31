export interface OssCredentials {
  username: string
  accessKeyId: string
  accessKeySecret: string
}

const LS_KEY = 'montnote.oss.credentials'
const LEGACY_SK_KEY = 'montnote.sk'
const VERSION = 2

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
    username: input.username.trim(),
    accessKeyId: input.accessKeyId.trim(),
    accessKeySecret: input.accessKeySecret.trim()
  }
}

export function validateUsername(username: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username)) {
    throw new Error('用户名只能包含字母、数字、下划线和连字符，长度 1-64')
  }
}

export async function saveCredentials(input: OssCredentials) {
  const credentials = normalizeCredentials(input)
  validateUsername(credentials.username)
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
    validateUsername(credentials.username)
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
