const BIG = 9999999999
const NOTE_DIR = 'notes'

function clean(s: string) {
  return String(s).replace(/[\u0000-\u001F\u007F]/g, ' ')
}

export function encodeSegment(s: string) {
  return clean(s).replace(/%/g, '%25').replace(/_/g, '%5F').replace(/\//g, '%2F')
}

export function decodeSegment(s: string) {
  return decodeURIComponent(s)
}

export function revTs(epochMs: number) {
  return String(BIG - Math.floor(epochMs / 1000)).padStart(10, '0')
}

export function revTsToMs(rev: string) {
  return (BIG - Number(rev)) * 1000
}

export function truncate(str: string, maxLen: number) {
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

export function build(userId: string, input: { revTs: string; notebookId: string; title: string; summary?: string }) {
  const nb = encodeSegment(input.notebookId)
  const ts = encodeSegment(truncate(input.title, 40)) + '%0A' + encodeSegment(truncate(input.summary || '', 100))
  return `${userId}/${NOTE_DIR}/${input.revTs}_${nb}_${ts}.json`
}

export function parse(key: string) {
  const prefix = key.slice(0, key.indexOf(`/${NOTE_DIR}/`) + NOTE_DIR.length + 2)
  const withoutJson = key.slice(0, -5)
  const slashIdx = withoutJson.indexOf('/', prefix.length)
  const userId = key.slice(0, key.indexOf(`/${NOTE_DIR}/`))
  const body = slashIdx >= 0 ? withoutJson.slice(slashIdx + 1) : withoutJson.slice(prefix.length)
  const parts = body.split('_')
  const rev = parts[0]
  const notebookId = decodeSegment(parts[1])
  const titleSummary = decodeSegment(parts.slice(2).join('_'))
  const nlIdx = titleSummary.indexOf('\n')
  const title = nlIdx >= 0 ? titleSummary.slice(0, nlIdx) : titleSummary
  const summary = nlIdx >= 0 ? titleSummary.slice(nlIdx + 1) : ''

  return { key, userId, revTs: rev, notebookId, title, summary, updatedAt: revTsToMs(rev) }
}

export function ownerPrefix(userId: string) {
  return `${userId}/${NOTE_DIR}/`
}

export function belongsTo(key: string, userId: string) {
  return key.startsWith(ownerPrefix(userId))
}
