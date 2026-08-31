import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { JSONContent } from '@tiptap/core'
import * as api from '@/api/client'
import type { LocalSaveStatus } from '@/api/types'
import { useNotesStore } from './notes'
import { DEFAULT_NOTEBOOK_ID, TRASH_NOTEBOOK_ID, useNotebooksStore } from './notebooks'
import {
  clearUnsavedRecovery as clearStoredUnsavedRecovery,
  isUnsavedRecoveryKey,
  readUnsavedRecovery,
  UNSAVED_RECOVERY_LIST_KEY,
  writeUnsavedRecovery
} from './unsavedRecovery'

const AUTO_SAVE_DELAY_MS = 2000
const TITLE_PREVIEW_LIMIT = 24
const SUMMARY_PREVIEW_LIMIT = 48

function emptyDoc(): JSONContent {
  return { type: 'doc', content: [] }
}

// 旧数据兼容：content 可能是字符串
function asDoc(content: unknown): JSONContent {
  if (typeof content === 'string') {
    return {
      type: 'doc',
      content: content ? [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] : []
    }
  }
  return (content as JSONContent) || emptyDoc()
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

function saveErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '保存失败，请重试'
}

type NoteSource = 'notes' | 'trash'

type NoteStateSnapshot = {
  key: string | null
  notebookId: string
  content: JSONContent
  text: string
  createdAt: number | null
  updatedAt: number | null
  dirty: boolean
  recoveryOpen: boolean
  source: NoteSource
  deletedAt: number | null
  originalKey: string | null
  originalNotebookId: string | null
}

export const useNoteStore = defineStore('note', () => {
  const interruptedRecovery = readUnsavedRecovery()
  if (interruptedRecovery && interruptedRecovery.status !== 'pending') {
    try {
      // 上一次会话没有完成同步确认，只能确定本地草稿仍待保存。
      writeUnsavedRecovery({ ...interruptedRecovery, status: 'pending' })
    } catch {
      // 本地恢复副本写入失败不应阻断笔记编辑器初始化。
    }
  }

  const key = ref<string | null>(null) // null = 未保存的新笔记
  const notebookId = ref(DEFAULT_NOTEBOOK_ID)
  const content = ref<JSONContent>(emptyDoc())
  const text = ref('')
  const createdAt = ref<number | null>(null)
  const updatedAt = ref<number | null>(null)
  const dirty = ref(false)
  const saving = ref(false)
  const opening = ref(false)
  const loadSeq = ref(0) // 外部载入笔记的信号（供编辑器同步内容）
  const autoSaveError = ref('')
  const recoveryOpen = ref(false)
  const listPreviewEnabled = ref(true)
  const source = ref<NoteSource>('notes')
  const deletedAt = ref<number | null>(null)
  const originalKey = ref<string | null>(null)
  const originalNotebookId = ref<string | null>(null)
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let changeSeq = 0
  let saveInFlight: Promise<void> | null = null
  let flushInFlight: Promise<void> | null = null
  let saveAgainAfterCurrent = false
  let openRequestSeq = 0

  const isTrash = computed(() => source.value === 'trash')
  const listKey = computed(() => recoveryOpen.value ? UNSAVED_RECOVERY_LIST_KEY : key.value)

  function resetState(opts: {
    key?: string | null
    notebookId?: string
    content?: JSONContent
    text?: string
    createdAt?: number | null
    updatedAt?: number | null
    dirty?: boolean
    source?: NoteSource
    deletedAt?: number | null
    originalKey?: string | null
    originalNotebookId?: string | null
  } = {}) {
    key.value = opts.key ?? null
    notebookId.value = opts.notebookId ?? DEFAULT_NOTEBOOK_ID
    content.value = opts.content ?? emptyDoc()
    text.value = opts.text ?? ''
    createdAt.value = opts.createdAt ?? null
    updatedAt.value = opts.updatedAt ?? null
    dirty.value = opts.dirty ?? false
    recoveryOpen.value = false
    source.value = opts.source ?? 'notes'
    deletedAt.value = opts.deletedAt ?? null
    originalKey.value = opts.originalKey ?? null
    originalNotebookId.value = opts.originalNotebookId ?? null
  }

  function snapshotState(): NoteStateSnapshot {
    return {
      key: key.value,
      notebookId: notebookId.value,
      content: content.value,
      text: text.value,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      dirty: dirty.value,
      recoveryOpen: recoveryOpen.value,
      source: source.value,
      deletedAt: deletedAt.value,
      originalKey: originalKey.value,
      originalNotebookId: originalNotebookId.value
    }
  }

  function restoreSnapshot(snapshot: NoteStateSnapshot) {
    key.value = snapshot.key
    notebookId.value = snapshot.notebookId
    content.value = snapshot.content
    text.value = snapshot.text
    createdAt.value = snapshot.createdAt
    updatedAt.value = snapshot.updatedAt
    dirty.value = snapshot.dirty
    recoveryOpen.value = snapshot.recoveryOpen
    source.value = snapshot.source
    deletedAt.value = snapshot.deletedAt
    originalKey.value = snapshot.originalKey
    originalNotebookId.value = snapshot.originalNotebookId
  }

  function cancelPendingOpen() {
    openRequestSeq++
    opening.value = false
  }

  function clearAutoSaveTimer() {
    if (!autoSaveTimer) return
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  function scheduleAutoSave() {
    clearAutoSaveTimer()
    if (!dirty.value || saving.value || opening.value || isTrash.value) return
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      save().catch((error) => {
        autoSaveError.value = saveErrorMessage(error)
      })
    }, AUTO_SAVE_DELAY_MS)
  }

  function markDirty(autoSave = true) {
    changeSeq++
    dirty.value = true
    autoSaveError.value = ''
    if (autoSave) scheduleAutoSave()
  }

  function isLocalNew() {
    return key.value === null && createdAt.value === null
  }

  function recoverySnapshot(status: LocalSaveStatus) {
    return {
      key: key.value,
      notebookId: notebookId.value,
      content: content.value,
      text: text.value,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      savedAt: Date.now(),
      status
    }
  }

  function persistUnsavedRecovery(status: LocalSaveStatus) {
    if (!text.value.trim()) return false
    try {
      writeUnsavedRecovery(recoverySnapshot(status))
      recoveryOpen.value = true
      useNotesStore().upsertUnsavedRecovery()
      return true
    } catch {
      return false
    }
  }

  function clearUnsavedRecovery() {
    clearStoredUnsavedRecovery()
    recoveryOpen.value = false
    useNotesStore().removeLocal(UNSAVED_RECOVERY_LIST_KEY)
  }

  function updateOpenRecovery() {
    if (!recoveryOpen.value) return
    persistUnsavedRecovery(saving.value ? 'saving' : 'pending')
  }

  function openNew(nb?: string) {
    clearAutoSaveTimer()
    cancelPendingOpen()
    resetState({ notebookId: nb || DEFAULT_NOTEBOOK_ID, source: 'notes' })
    loadSeq.value++
  }

  function setUnsavedNotebook(nb?: string) {
    if (isTrash.value) return
    notebookId.value = nb || DEFAULT_NOTEBOOK_ID
    if (!dirty.value && !saving.value) return
    changeSeq++
    dirty.value = true
    autoSaveError.value = ''
    if (saving.value) saveAgainAfterCurrent = true
    updateOpenRecovery()
    scheduleAutoSave()
  }

  async function open(k: string) {
    clearAutoSaveTimer()
    const requestSeq = ++openRequestSeq
    if (isUnsavedRecoveryKey(k)) {
      const recovery = readUnsavedRecovery()
      if (!recovery) throw new Error('未找到本地未保存内容')
      cancelPendingOpen()
      resetState({
        key: recovery.key,
        notebookId: recovery.notebookId,
        content: asDoc(recovery.content),
        text: recovery.text,
        createdAt: recovery.createdAt,
        updatedAt: recovery.updatedAt,
        dirty: true,
        source: 'notes'
      })
      recoveryOpen.value = true
      opening.value = false
      loadSeq.value++
      useNotesStore().upsertUnsavedRecovery()
      scheduleAutoSave()
      return
    }
    const previous = snapshotState()
    resetState({ key: k, source: k.startsWith('trash/') ? 'trash' : 'notes' })
    opening.value = true
    loadSeq.value++

    try {
      if (k.startsWith('trash/')) {
        const doc = await api.getTrashNote(k)
        if (requestSeq !== openRequestSeq) return
        resetState({
          key: k,
          notebookId: doc.notebookId,
          content: asDoc(doc.content),
          text: doc.text || '',
          createdAt: doc.createdAt,
          updatedAt: null,
          dirty: false,
          source: 'trash',
          deletedAt: doc.deletedAt,
          originalKey: doc.originalKey,
          originalNotebookId: doc.originalNotebookId
        })
      } else {
        const doc = await api.getNote(k)
        if (requestSeq !== openRequestSeq) return
        resetState({
          key: k,
          notebookId: doc.notebookId,
          content: asDoc(doc.content),
          text: doc.text || '',
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          dirty: false,
          source: 'notes'
        })
      }
      if (requestSeq !== openRequestSeq) return
      opening.value = false
      loadSeq.value++
    } catch (error) {
      if (requestSeq === openRequestSeq) {
        restoreSnapshot(previous)
        opening.value = false
        loadSeq.value++
      }
      throw error
    }
  }

  function setBody(json: JSONContent, plain: string) {
    if (isTrash.value) return
    content.value = json
    text.value = plain
    if (!key.value && !plain.trim()) {
      clearAutoSaveTimer()
      dirty.value = false
      syncListPreview()
      return
    }
    markDirty()
    updateOpenRecovery()
    syncListPreview()
  }

  function setNotebook(nb: string) {
    if (isTrash.value) return
    notebookId.value = nb
    markDirty()
    updateOpenRecovery()
    syncListPreview()
  }

  function previewTitle() {
    const { title } = derivePreview(text.value)
    return title || '新笔记'
  }

  function previewSummary() {
    return derivePreview(text.value).summary
  }

  function syncListPreview() {
    if (!listPreviewEnabled.value) return
    const notes = useNotesStore()
    if (notes.isTrashView || isTrash.value) return
    if (!key.value) return
    notes.upsertLocal({
      key: key.value,
      notebookId: notebookId.value,
      notebookName: useNotebooksStore().displayName(notebookId.value),
      title: previewTitle(),
      summary: previewSummary(),
      updatedAt: Date.now()
    })
  }

  function setListPreviewEnabled(enabled: boolean) {
    listPreviewEnabled.value = enabled
  }

  async function save() {
    clearAutoSaveTimer()
    if (saving.value) {
      saveAgainAfterCurrent = true
      await saveInFlight
      return
    }
    if (!dirty.value) return
    if (isTrash.value) throw new Error('最近删除中的笔记不可直接保存，请先恢复')
    if (!text.value.trim()) {
      dirty.value = false
      return
    }
    const preview = derivePreview(text.value)
    const savedSeq = changeSeq
    saving.value = true
    persistUnsavedRecovery('saving')
    const notes = useNotesStore()
    const body = { notebookId: notebookId.value, content: content.value, text: text.value }
    const savedNotebookId = body.notebookId
    let savedOk = false
    saveInFlight = (async () => {
      if (key.value) {
        const oldKey = key.value
        const res = await api.updateNote({ ...body, key: oldKey })
        key.value = res.key
        updatedAt.value = res.updatedAt
        notes.applyUpdated(oldKey, { key: res.key, notebookId: savedNotebookId, notebookName: useNotebooksStore().displayName(savedNotebookId), title: preview.title || '新笔记', summary: preview.summary, updatedAt: res.updatedAt })
      } else {
        const res = await api.createNote(body)
        key.value = res.key
        createdAt.value = res.createdAt
        updatedAt.value = res.updatedAt
        notes.applyCreated({ key: res.key, notebookId: savedNotebookId, notebookName: useNotebooksStore().displayName(savedNotebookId), title: preview.title || '新笔记', summary: preview.summary, updatedAt: res.updatedAt })
      }
      dirty.value = changeSeq !== savedSeq
      if (dirty.value) updateOpenRecovery()
      else clearUnsavedRecovery()
      savedOk = true
    })()

    try {
      await saveInFlight
    } catch (error) {
      persistUnsavedRecovery('failed')
      throw error
    } finally {
      saving.value = false
      saveInFlight = null
      const shouldSaveAgain = saveAgainAfterCurrent || dirty.value
      saveAgainAfterCurrent = false
      if (savedOk && shouldSaveAgain) {
        scheduleAutoSave()
      }
    }
  }

  async function flushAutoSave() {
    if (flushInFlight) {
      await flushInFlight
      return
    }
    const flush = (async () => {
      clearAutoSaveTimer()
      await save()
      while (dirty.value && !isTrash.value && text.value.trim()) {
        clearAutoSaveTimer()
        await save()
      }
    })()
    flushInFlight = flush
    try {
      await flush
    } finally {
      if (flushInFlight === flush) flushInFlight = null
    }
  }

  async function waitForPendingSave() {
    if (!saving.value && !flushInFlight && !saveInFlight) return
    try {
      await flushAutoSave()
    } catch {
      // 保存失败内容已经写入本地草稿，不阻止打开其他笔记。
    }
  }

  function saveInBackground() {
    if (!dirty.value && !saving.value) return
    flushAutoSave().catch(() => {})
  }

  async function restoreFromTrash() {
    if (!key.value || !isTrash.value) throw new Error('当前不是最近删除笔记')
    const trashKey = key.value
    const targetNotebookId = notebookId.value || DEFAULT_NOTEBOOK_ID
    const notes = useNotesStore()
    const notebooks = useNotebooksStore()
    const res = await api.restoreTrashNote(trashKey)
    notes.removeByKey(trashKey)
    notebooks.select(targetNotebookId === TRASH_NOTEBOOK_ID ? DEFAULT_NOTEBOOK_ID : targetNotebookId)
    await notes.refresh()
    await open(res.key)
  }

  async function purgeFromTrash() {
    if (!key.value || !isTrash.value) throw new Error('当前不是最近删除笔记')
    const trashKey = key.value
    const notes = useNotesStore()
    clearAutoSaveTimer()
    await api.deleteTrashNote(trashKey)
    notes.removeByKey(trashKey)
    cancelPendingOpen()
    resetState({ notebookId: DEFAULT_NOTEBOOK_ID, source: 'notes' })
    loadSeq.value++
  }

  function discardUnsavedRecovery() {
    const wasOpen = recoveryOpen.value
    clearUnsavedRecovery()
    if (!wasOpen) return
    clearAutoSaveTimer()
    resetState({ notebookId: DEFAULT_NOTEBOOK_ID, source: 'notes' })
    loadSeq.value++
  }

  return {
    key, listKey, notebook: notebookId, notebookId, content, text, createdAt, updatedAt, dirty, saving, opening, loadSeq, autoSaveError,
    source, isTrash, deletedAt, originalKey, originalNotebookId,
    isLocalNew, syncListPreview, setListPreviewEnabled, openNew, open, setBody, setNotebook, setUnsavedNotebook, save, flushAutoSave, waitForPendingSave, saveInBackground, restoreFromTrash, purgeFromTrash, discardUnsavedRecovery
  }
})
