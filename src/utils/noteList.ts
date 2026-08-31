import type { NoteListItem } from '@/api/types'

export function formatNoteListTime(item: NoteListItem) {
  const ts = item.updatedAt ?? item.deletedAt
  if (!ts) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(ts)
}
