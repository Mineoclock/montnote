import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '@/api/client'
import type { NoteListItem } from '@/api/types'
import { TRASH_NOTEBOOK_ID, useNotebooksStore } from './notebooks'
import { isUnsavedRecoveryKey, readUnsavedRecovery, recoveryToListItem, UNSAVED_RECOVERY_LIST_KEY } from './unsavedRecovery'

// 本地缓存：仅镜像「全部笔记」头部 20 条，供首屏即时渲染（非离线/同步，server 为权威）
const CACHE_KEY = 'montnote.notes.head'
const CACHE_MAX = 20
const AUTO_REFRESH_INTERVAL_MS = 60_000
const AUTO_REFRESH_SKIP_SCROLL_TOP = 300
const AUTO_REFRESH_SKIP_VIEWPORT_RATIO = 0.6

function readCache(): NoteListItem[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeCache(list: NoteListItem[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, CACHE_MAX)))
}

export const useNotesStore = defineStore('notes', () => {
  const nb = useNotebooksStore()
  const items = ref<NoteListItem[]>([])
  const loading = ref(false)
  const query = ref('')
  const searching = ref(false)
  const nextToken = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  let lastRefreshStartedAt = 0
  let listScrollTop = 0
  let listScrollClientHeight = 0

  const isTrashView = computed(() => nb.current === TRASH_NOTEBOOK_ID)
  const hasMore = computed(() => (searching.value ? nextCursor.value : nextToken.value) !== null)

  function shouldShowUnsavedRecovery(notebookId: string) {
    return !isTrashView.value && !searching.value && (nb.current === null || nb.current === notebookId)
  }

  function shouldShowNote(notebookId: string) {
    return !isTrashView.value && !searching.value && (nb.current === null || nb.current === notebookId)
  }

  function withUnsavedRecovery(list: NoteListItem[]) {
    const recovery = readUnsavedRecovery()
    const withoutLocal = list.filter((item) => !isUnsavedRecoveryKey(item.key) && item.key !== recovery?.key)
    if (!recovery || !shouldShowUnsavedRecovery(recovery.notebookId)) return withoutLocal
    return [recoveryToListItem(recovery, nb.displayName(recovery.notebookId)), ...withoutLocal]
  }

  function hasVisibleUnsavedRecoveryForKey(key: string) {
    const recovery = readUnsavedRecovery()
    return recovery?.key === key && shouldShowUnsavedRecovery(recovery.notebookId)
  }

  function upsertUnsavedRecovery() {
    const recovery = readUnsavedRecovery()
    removeLocal(UNSAVED_RECOVERY_LIST_KEY)
    if (!recovery || !shouldShowUnsavedRecovery(recovery.notebookId)) return
    if (recovery.key) removeLocal(recovery.key)
    items.value.unshift(recoveryToListItem(recovery, nb.displayName(recovery.notebookId)))
  }

  async function refresh() {
    lastRefreshStartedAt = Date.now()
    query.value = ''
    searching.value = false
    items.value = nb.current === null && !isTrashView.value ? withUnsavedRecovery(readCache()) : withUnsavedRecovery([]) // 先渲染本地缓存
    nextToken.value = null
    nextCursor.value = null
    loading.value = true
    try {
      const res = isTrashView.value
        ? await api.listTrash()
        : await api.listNotes({ notebook: nb.current ?? undefined })
      items.value = withUnsavedRecovery(res.items) // 最新覆盖本地
      nextToken.value = res.nextToken
      if (nb.current === null && !isTrashView.value) writeCache(res.items)
    } finally {
      loading.value = false
    }
  }

  async function refreshIfStale(maxAgeMs = AUTO_REFRESH_INTERVAL_MS) {
    if (loading.value) return false
    if (shouldSkipAutoRefreshForListScroll()) return false
    if (Date.now() - lastRefreshStartedAt < maxAgeMs) return false
    await refresh()
    return true
  }

  function recordListScroll(scrollTop: number, clientHeight: number) {
    listScrollTop = scrollTop
    listScrollClientHeight = clientHeight
  }

  function shouldSkipAutoRefreshForListScroll() {
    return listScrollTop > Math.max(AUTO_REFRESH_SKIP_SCROLL_TOP, listScrollClientHeight * AUTO_REFRESH_SKIP_VIEWPORT_RATIO)
  }

  async function search(q: string) {
    if (loading.value && searching.value) return
    query.value = q
    searching.value = true
    items.value = []
    nextCursor.value = null
    loading.value = true
    try {
      const res = await api.searchNotes({ q })
      items.value = res.items
      nextCursor.value = res.nextCursor
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      if (searching.value) {
        const res = await api.searchNotes({ q: query.value, cursor: nextCursor.value! })
        items.value.push(...res.items)
        nextCursor.value = res.nextCursor
      } else if (isTrashView.value) {
        const res = await api.listTrash({ token: nextToken.value! })
        items.value.push(...res.items)
        nextToken.value = res.nextToken
      } else {
        const res = await api.listNotes({ notebook: nb.current ?? undefined, token: nextToken.value! })
        const recovery = readUnsavedRecovery()
        items.value.push(...res.items.filter((item) => !isUnsavedRecoveryKey(item.key) && item.key !== recovery?.key))
        nextToken.value = res.nextToken
      }
    } finally {
      loading.value = false
    }
  }

  // key 可变：写操作后回写列表 + 本地缓存（缓存为「全部笔记」头部镜像，与当前筛选无关）
  function applyCreated(item: NoteListItem) {
    removeLocal(UNSAVED_RECOVERY_LIST_KEY)
    removeLocal(item.key)
    if (shouldShowNote(item.notebookId)) items.value.unshift(item)
    const c = readCache().filter((x) => x.key !== item.key)
    c.unshift(item)
    writeCache(c)
  }

  function applyUpdated(oldKey: string, item: NoteListItem) {
    removeLocal(oldKey)
    removeLocal(UNSAVED_RECOVERY_LIST_KEY)
    removeLocal(item.key)
    if (shouldShowNote(item.notebookId)) items.value.unshift(item)
    const c = readCache().filter((x) => x.key !== oldKey && x.key !== item.key)
    c.unshift(item)
    writeCache(c)
  }

  function removeByKey(key: string) {
    const i = items.value.findIndex((x) => x.key === key)
    if (i >= 0) items.value.splice(i, 1)
    writeCache(readCache().filter((x) => x.key !== key))
  }

  function upsertLocal(item: NoteListItem) {
    if (hasVisibleUnsavedRecoveryForKey(item.key)) {
      removeLocal(item.key)
      upsertUnsavedRecovery()
      return
    }
    const i = items.value.findIndex((x) => x.key === item.key)
    if (i >= 0) {
      items.value.splice(i, 1, item)
    } else {
      items.value.unshift(item)
    }
  }

  function removeLocal(key: string) {
    const i = items.value.findIndex((x) => x.key === key)
    if (i >= 0) items.value.splice(i, 1)
  }

  async function remove(key: string) {
    await api.deleteNote(key)
    removeByKey(key)
  }

  async function restoreTrash(key: string) {
    const res = await api.restoreTrashNote(key)
    removeByKey(key)
    return res
  }

  async function purgeTrash(key: string) {
    await api.deleteTrashNote(key)
    removeByKey(key)
  }

  async function purgeTrashMany(keys: string[]) {
    const res = await api.deleteTrashNotes(keys)
    for (const k of res.success) removeByKey(k)
    return res
  }

  return {
    items, loading, query, searching, hasMore, isTrashView,
    refresh, refreshIfStale, recordListScroll, search, loadMore, remove, restoreTrash, purgeTrash, purgeTrashMany, applyCreated, applyUpdated, removeByKey, upsertLocal, removeLocal, upsertUnsavedRecovery
  }
})
