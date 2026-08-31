import * as noteKey from './key'

const TRASH_DIR = 'trash'

export function build(
  userId: string,
  input: { revTs: string; trashId: string; notebookId: string; title: string; summary?: string }
) {
  const id = noteKey.encodeSegment(input.trashId)
  const nb = noteKey.encodeSegment(input.notebookId)
  const ts = noteKey.encodeSegment(noteKey.truncate(input.title, 40)) +
    '%0A' +
    noteKey.encodeSegment(noteKey.truncate(input.summary || '', 100))
  return `${userId}/${TRASH_DIR}/${input.revTs}_${id}_${nb}_${ts}.json`
}

export function parse(key: string) {
  const userId = key.slice(0, key.indexOf(`/${TRASH_DIR}/`))
  const prefix = `${userId}/${TRASH_DIR}/`
  const withoutJson = key.slice(0, -5)
  const body = withoutJson.slice(prefix.length)
  const parts = body.split('_')
  const rev = parts[0]
  const trashId = noteKey.decodeSegment(parts[1])
  const notebookId = noteKey.decodeSegment(parts[2])
  const titleSummary = noteKey.decodeSegment(parts.slice(3).join('_'))
  const nlIdx = titleSummary.indexOf('\n')
  const title = nlIdx >= 0 ? titleSummary.slice(0, nlIdx) : titleSummary
  const summary = nlIdx >= 0 ? titleSummary.slice(nlIdx + 1) : ''

  return { key, userId, revTs: rev, trashId, notebookId, title, summary, deletedAt: noteKey.revTsToMs(rev) }
}

export function ownerPrefix(userId: string) {
  return `${userId}/${TRASH_DIR}/`
}

export function belongsTo(key: string, userId: string) {
  return key.startsWith(ownerPrefix(userId))
}
