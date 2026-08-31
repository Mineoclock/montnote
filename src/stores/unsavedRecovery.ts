import type { JSONContent } from '@tiptap/core'
import type { LocalSaveStatus, NoteListItem } from '@/api/types'
import { DEFAULT_NOTEBOOK_ID } from './notebooks'

const TITLE_PREVIEW_LIMIT = 24
const SUMMARY_PREVIEW_LIMIT = 48

export const UNSAVED_RECOVERY_STORAGE_KEY = 'montnote.note.unsavedRecovery'
export const UNSAVED_RECOVERY_LIST_KEY = '__unsaved_recovery__'
export const UNSAVED_RECOVERY_QUOTA_MESSAGE = '本地草稿空间不足，无法保存恢复副本'

export interface UnsavedRecovery {
  key: string | null
  notebookId: string
  content: JSONContent
  text: string
  createdAt: number | null
  updatedAt: number | null
  savedAt: number
  status: LocalSaveStatus
}

function normalizePreviewText(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
}

function derivePreview(t: string): { title: string; summary: string } {
  const lines = t.split('\n')
  const lineIndex = lines.findIndex((line) => line.trim())
  if (lineIndex === -1) return { title: '', summary: '' }

  const titleLine = lines[lineIndex].trim()
  const summarySource = [titleLine.slice(TITLE_PREVIEW_LIMIT), ...lines.slice(lineIndex + 1)].join('\n')
  return {
    title: titleLine.slice(0, TITLE_PREVIEW_LIMIT),
    summary: normalizePreviewText(summarySource).slice(0, SUMMARY_PREVIEW_LIMIT)
  }
}

export function isUnsavedRecoveryKey(key: string) {
  return key === UNSAVED_RECOVERY_LIST_KEY
}

export function readUnsavedRecovery(): UnsavedRecovery | null {
  try {
    const raw = localStorage.getItem(UNSAVED_RECOVERY_STORAGE_KEY)
    if (!raw) return null
    const recovery = JSON.parse(raw) as Partial<UnsavedRecovery>
    if (!recovery || typeof recovery !== 'object') return null
    if (!recovery.content || typeof recovery.text !== 'string') return null
    return {
      key: typeof recovery.key === 'string' ? recovery.key : null,
      notebookId: recovery.notebookId || DEFAULT_NOTEBOOK_ID,
      content: recovery.content,
      text: recovery.text,
      createdAt: recovery.createdAt ?? null,
      updatedAt: recovery.updatedAt ?? null,
      savedAt: recovery.savedAt || Date.now(),
      status: recovery.status === 'saving' || recovery.status === 'failed'
        ? recovery.status
        : 'pending'
    }
  } catch {
    clearUnsavedRecovery()
    return null
  }
}

export function writeUnsavedRecovery(recovery: UnsavedRecovery) {
  try {
    localStorage.setItem(UNSAVED_RECOVERY_STORAGE_KEY, JSON.stringify(recovery))
  } catch (error) {
    const record = error as { name?: string; code?: number }
    if (
      record?.name === 'QuotaExceededError' ||
      record?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      record?.code === 22 ||
      record?.code === 1014
    ) {
      throw new Error(UNSAVED_RECOVERY_QUOTA_MESSAGE)
    }
    throw error
  }
}

export function clearUnsavedRecovery() {
  localStorage.removeItem(UNSAVED_RECOVERY_STORAGE_KEY)
}

export function recoveryToListItem(recovery: UnsavedRecovery, notebookName: string): NoteListItem {
  const preview = derivePreview(recovery.text)
  return {
    key: UNSAVED_RECOVERY_LIST_KEY,
    notebookId: recovery.notebookId,
    notebookName,
    title: preview.title || '新笔记',
    summary: preview.summary,
    updatedAt: recovery.savedAt,
    localSaveStatus: recovery.status
  }
}
