<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronDown, Circle, CircleCheck, FolderInput, Menu, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from '@lucide/vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { DEFAULT_NOTEBOOK_ID, TRASH_NOTEBOOK_ID, TRASH_NOTEBOOK_NAME, useNotebooksStore } from '@/stores/notebooks'
import { useNotesStore } from '@/stores/notes'
import { useNoteStore } from '@/stores/note'
import { NOTEBOOKS_PANEL_QUERY } from '@/stores/app'
import { ApiError } from '@/api/client'
import * as api from '@/api/client'
import { useDialog } from '@/composables/useDialog'
import type { NoteListItem, Notebook } from '@/api/types'
import { UNSAVED_RECOVERY_LIST_KEY, isUnsavedRecoveryKey, readUnsavedRecovery, writeUnsavedRecovery } from '@/stores/unsavedRecovery'
import { formatNoteListTime } from '@/utils/noteList'
import NoteListCard from '@/components/NoteListCard.vue'

const { isWide } = useBreakpoint()
const route = useRoute()
const router = useRouter()
const notebooks = useNotebooksStore()
const notes = useNotesStore()
const note = useNoteStore()
const emit = defineEmits<{ open: [key: string]; new: []; search: []; refresh: [] }>()

const TOP_REFRESH_ARM_DISTANCE = 80
const TOP_REFRESH_TRIGGER_DISTANCE = 8
const LOAD_MORE_TRIGGER_DISTANCE = 240
const managerOpen = computed(() => !isWide.value && route.query.panel === NOTEBOOKS_PANEL_QUERY)
const selectionMode = shallowRef(false)
const selectedNotebook = shallowRef<string | null>(null)
const suppressNextClick = shallowRef(false)
const pending = shallowRef(false)
const managerError = shallowRef('')
const noteSelectionMode = shallowRef(false)
const selectedNoteKeys = shallowRef<Set<string>>(new Set())
const movePickerOpen = shallowRef(false)
const notebookMenuOpen = shallowRef(false)
const pressedNoteKey = shallowRef<string | null>(null)
const suppressNextNoteClick = shallowRef(false)
const noteBulkPending = shallowRef(false)
const hasScrolledAwayFromTop = shallowRef(false)
const mobileListRef = shallowRef<HTMLElement | null>(null)
const desktopListRef = shallowRef<HTMLElement | null>(null)
const dialog = useDialog()
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let noteLongPressTimer: ReturnType<typeof setTimeout> | null = null
let lastNoteContextSelectAt = 0
let lastNoteContextSelectKey = ''
let managerOpenedFromButton = false
let autoLoadBlocked = false

const selectedCount = computed(() => selectedNotebook.value === null ? 0 : 1)
const managerTitle = computed(() => selectionMode.value ? `已选择 ${selectedCount.value} 项` : '笔记本')
const customNotebooks = computed(() => notebooks.notebooks.filter((nb) => nb.id !== DEFAULT_NOTEBOOK_ID))
const hasEditableNotebook = computed(() => customNotebooks.value.length > 0)
const selectedNoteCount = computed(() => selectedNoteKeys.value.size)
const availableMoveNotebooks = computed(() => {
  // 获取所有选中笔记所在的笔记本 ID 集合
  const currentNotebookIds = new Set(selectedNoteItems.value.map(item => item.notebookId))
  // 过滤掉这些笔记本，只返回可移动到的笔记本
  return notebooks.notebooks.filter(nb => !currentNotebookIds.has(nb.id))
})
const activeNoteKey = computed(() => note.listKey)
const selectedNoteItems = computed(() => {
  const byKey = new Map(notes.items.map((item) => [item.key, item]))
  return [...selectedNoteKeys.value].map((key) => byKey.get(key)).filter((item): item is NoteListItem => Boolean(item))
})
const isTrashView = computed(() => notes.isTrashView)
const canCreateNote = computed(() => !isTrashView.value)
const canSearchNotes = computed(() => true)
const searchButtonLabel = computed(() => isTrashView.value ? '搜索最近删除' : '搜索全部笔记')
const isRefreshingNotes = computed(() => notes.loading && !notes.searching)
const mobileNotebookEntries = computed(() => {
  return [
    { id: null, name: '全部笔记' },
    ...notebooks.notebooks
      .filter((nb) => nb.id !== TRASH_NOTEBOOK_ID)
      .map((nb) => ({ id: nb.id, name: nb.name })),
    { id: TRASH_NOTEBOOK_ID, name: TRASH_NOTEBOOK_NAME }
  ]
})
const currentMobileNotebookName = computed(() => {
  if (notebooks.current === null) return '全部笔记'
  if (notebooks.current === TRASH_NOTEBOOK_ID) return TRASH_NOTEBOOK_NAME
  return notebooks.displayName(notebooks.current)
})

function select(nb: string | null) {
  if (notes.loading && !notes.searching) return
  notebookMenuOpen.value = false
  notebooks.select(nb)
  notes.refresh()
}

async function handleManualRefresh() {
  if (isRefreshingNotes.value) return
  notebookMenuOpen.value = false
  emit('refresh')
}

function loadMoreIfNeeded(el: HTMLElement) {
  if (noteSelectionMode.value || !notes.hasMore || notes.loading) return
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distanceToBottom > LOAD_MORE_TRIGGER_DISTANCE) {
    autoLoadBlocked = false
    return
  }
  if (autoLoadBlocked) return
  void notes.loadMore().catch((e) => {
    autoLoadBlocked = true
    dialog.alert({ title: e instanceof Error ? e.message : '加载失败' })
  })
}

function checkActiveListForMore() {
  const el = isWide.value ? desktopListRef.value : mobileListRef.value
  if (el) loadMoreIfNeeded(el)
}

function handleListScroll(event: Event) {
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  notes.recordListScroll(el.scrollTop, el.clientHeight)
  loadMoreIfNeeded(el)
  if (el.scrollTop > TOP_REFRESH_ARM_DISTANCE) {
    hasScrolledAwayFromTop.value = true
    return
  }
  if (!hasScrolledAwayFromTop.value || el.scrollTop > TOP_REFRESH_TRIGGER_DISTANCE) return
  hasScrolledAwayFromTop.value = false
  notes.refreshIfStale().catch((e) => {
    dialog.alert({ title: e instanceof Error ? e.message : '加载失败' })
  })
}

function isNoteSelected(key: string) {
  return selectedNoteKeys.value.has(key)
}

function isCurrentNote(key: string) {
  return activeNoteKey.value === key
}

function isUnsavedNote(key: string) {
  return isUnsavedRecoveryKey(key)
}

function localSaveStatus(item: NoteListItem) {
  if (item.localSaveStatus) return item.localSaveStatus
  return isUnsavedNote(item.key) ? 'pending' : null
}

function isSavingNote(item: NoteListItem) {
  return localSaveStatus(item) === 'saving'
}

function isSavingNoteKey(key: string) {
  const item = notes.items.find((candidate) => candidate.key === key)
  return item ? isSavingNote(item) : false
}

function setNoteSelected(key: string, selected: boolean) {
  const next = new Set(selectedNoteKeys.value)
  if (selected) next.add(key)
  else next.delete(key)
  selectedNoteKeys.value = next
}

function enterNoteSelection(key: string) {
  noteSelectionMode.value = true
  selectedNoteKeys.value = new Set([key])
  suppressNextNoteClick.value = true
  clearNoteLongPress()
}

function exitNoteSelection() {
  noteSelectionMode.value = false
  selectedNoteKeys.value = new Set()
  movePickerOpen.value = false
  suppressNextNoteClick.value = false
  clearNoteLongPress()
}

function closeMovePicker() {
  if (noteBulkPending.value) return
  movePickerOpen.value = false
}

function clearNoteLongPress() {
  if (!noteLongPressTimer) return
  clearTimeout(noteLongPressTimer)
  noteLongPressTimer = null
}

function clearNotePress() {
  pressedNoteKey.value = null
  clearNoteLongPress()
}

function startNoteLongPress(key: string) {
  if (noteSelectionMode.value || isSavingNoteKey(key)) return
  if (!isWide.value) pressedNoteKey.value = key
  clearNoteLongPress()
  noteLongPressTimer = setTimeout(() => {
    noteLongPressTimer = null
    pressedNoteKey.value = null
    enterNoteSelection(key)
  }, 520)
}

function handleNoteClick(key: string) {
  if (noteSelectionMode.value) {
    // 在选择模式中，直接处理选择，不检查 suppress
    setNoteSelected(key, !isNoteSelected(key))
    return
  }
  if (suppressNextNoteClick.value) {
    suppressNextNoteClick.value = false
    return
  }
  emit('open', key)
}

function handleNoteContextSelect(key: string) {
  if (isSavingNoteKey(key)) return
  const now = Date.now()
  if (lastNoteContextSelectKey === key && now - lastNoteContextSelectAt < 250) return
  lastNoteContextSelectKey = key
  lastNoteContextSelectAt = now
  clearNoteLongPress()
  if (noteSelectionMode.value) {
    setNoteSelected(key, !isNoteSelected(key))
    return
  }
  enterNoteSelection(key)
}

function openManager() {
  managerError.value = ''
  notebookMenuOpen.value = false
  exitSelection()
  if (managerOpen.value) return
  managerOpenedFromButton = true
  router.push({ path: route.path, query: { ...route.query, panel: NOTEBOOKS_PANEL_QUERY } }).catch(() => {
    managerOpenedFromButton = false
  })
}

function toggleNotebookMenu() {
  notebookMenuOpen.value = !notebookMenuOpen.value
}

function openSearch() {
  notebookMenuOpen.value = false
  emit('search')
}

function closeManager() {
  if (pending.value) return
  if (managerOpen.value) {
    const nextQuery = { ...route.query }
    delete nextQuery.panel
    if (managerOpenedFromButton && window.history.state?.back) router.back()
    else router.replace({ path: route.path, query: nextQuery })
  }
  exitSelection()
}

function showManagerError(e: unknown, fallback: string) {
  managerError.value = e instanceof ApiError ? e.message : fallback
}

async function refreshNotes() {
  await notes.refresh()
}

watch(managerOpen, (open) => {
  if (open) return
  managerOpenedFromButton = false
  managerError.value = ''
  exitSelection()
})

watch([isWide, () => notes.items.length, () => notes.hasMore, () => notes.loading, noteSelectionMode], () => {
  if (notes.loading) {
    autoLoadBlocked = false
    return
  }
  void nextTick(checkActiveListForMore)
})

function isEditableNotebook(nb: Notebook) {
  return isEditableNotebookId(nb.id)
}

function isEditableNotebookId(id: string | null) {
  return id !== null && id !== DEFAULT_NOTEBOOK_ID && id !== TRASH_NOTEBOOK_ID
}

function trashNoteLabel() {
  return isTrashView.value ? '永久删除' : '删除'
}

function trashNoteDialogTitle() {
  return isTrashView.value ? '永久删除笔记' : '删除笔记'
}

function trashNoteDialogMessage(count: number) {
  return isTrashView.value
    ? `永久删除已选择的 ${count} 条笔记？删除后不可恢复。`
    : `删除已选择的 ${count} 条笔记？`
}

async function selectFromManager(nb: string | null) {
  select(nb)
  closeManager()
}

async function promptCreateNotebook() {
  const name = await dialog.prompt({
    title: '新建笔记本'
  })
  if (!name) return
  pending.value = true
  managerError.value = ''
  try {
    await notebooks.create(name)
  } catch (e) {
    showManagerError(e, '创建失败')
  } finally {
    pending.value = false
  }
}

function enterSelection(id: string | null) {
  if (!hasEditableNotebook.value) return
  selectionMode.value = true
  selectedNotebook.value = isEditableNotebookId(id) ? id : null
  suppressNextClick.value = true
  managerError.value = ''
}

function exitSelection() {
  selectionMode.value = false
  selectedNotebook.value = null
  suppressNextClick.value = false
  clearLongPress()
}

function clearLongPress() {
  if (!longPressTimer) return
  clearTimeout(longPressTimer)
  longPressTimer = null
}

function startLongPress(id: string | null) {
  if (!hasEditableNotebook.value || selectionMode.value) return
  clearLongPress()
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    enterSelection(id)
  }, 520)
}

function handleStaticNotebookClick(id: string | null) {
  if (selectionMode.value) return
  if (suppressNextClick.value) {
    suppressNextClick.value = false
    return
  }
  selectFromManager(id)
}

function handleNotebookClick(nb: Notebook) {
  if (selectionMode.value) {
    // 在选择模式中，直接处理选择，不检查 suppress
    if (!isEditableNotebook(nb)) return
    selectedNotebook.value = selectedNotebook.value === nb.id ? null : nb.id
    return
  }
  if (suppressNextClick.value) {
    suppressNextClick.value = false
    return
  }
  selectFromManager(nb.id)
}

async function renameSelectedNotebook() {
  const id = selectedNotebook.value
  const nb = notebooks.notebooks.find((item) => item.id === id)
  if (!nb || !isEditableNotebook(nb)) return
  const to = await dialog.prompt({
    title: '重命名笔记本',
    defaultValue: nb.name
  })
  if (!to || to === nb.name) {
    return
  }
  pending.value = true
  managerError.value = ''
  try {
    await notebooks.rename(nb.id, to)
    selectedNotebook.value = nb.id
    await refreshNotes()
  } catch (e) {
    showManagerError(e, '重命名失败')
  } finally {
    pending.value = false
  }
}

async function removeSelectedNotebook() {
  if (pending.value) return
  const id = selectedNotebook.value
  const nb = notebooks.notebooks.find((item) => item.id === id)
  if (!nb || !isEditableNotebook(nb)) return
  const ok = await dialog.confirm({
    title: '删除笔记本',
    message: `删除「${nb.name}」？其中笔记会移到默认笔记本。`,
    confirmText: '删除'
  })
  if (!ok) return
  pending.value = true
  managerError.value = ''
  try {
    await notebooks.remove(nb.id)
    exitSelection()
    await refreshNotes()
  } catch (e) {
    showManagerError(e, '删除失败')
  } finally {
    pending.value = false
  }
}

function openMovePicker() {
  if (isTrashView.value) return
  if (noteBulkPending.value) return
  if (selectedNoteCount.value === 0) return
  movePickerOpen.value = true
}

function movedListItem(oldKey: string, newKey: string, targetNotebook: Notebook, updatedAt: number): NoteListItem {
  const current = notes.items.find((item) => item.key === oldKey)
  return {
    key: newKey,
    notebookId: targetNotebook.id,
    notebookName: targetNotebook.name,
    title: current?.title || '新笔记',
    summary: current?.summary || '',
    updatedAt
  }
}

function moveStoredUnsavedRecovery(targetNotebook: Notebook) {
  const recovery = readUnsavedRecovery()
  if (!recovery) return
  writeUnsavedRecovery({
    ...recovery,
    notebookId: targetNotebook.id,
    savedAt: Date.now()
  })
  notes.upsertUnsavedRecovery()
}

async function moveOpenNoteIfSelected(keys: Set<string>, targetNotebook: Notebook) {
  const listKey = activeNoteKey.value
  const currentKey = note.key
  if (!listKey || !keys.has(listKey)) return

  if (note.isLocalNew()) {
    note.setUnsavedNotebook(targetNotebook.id)
    keys.delete(listKey)
    return
  }

  if (!currentKey) return
  keys.delete(listKey)
  keys.delete(currentKey)
  if (note.notebookId !== targetNotebook.id) {
    note.setNotebook(targetNotebook.id)
  }
  await note.flushAutoSave()
  if (note.key) keys.delete(note.key)
}

async function moveSelectedNotes(targetNotebook: Notebook) {
  if (isTrashView.value || noteBulkPending.value) return
  if (selectedNoteCount.value === 0) return
  noteBulkPending.value = true
  try {
    const keys = new Set(selectedNoteKeys.value)
    await moveOpenNoteIfSelected(keys, targetNotebook)

    if (keys.has(UNSAVED_RECOVERY_LIST_KEY)) {
      moveStoredUnsavedRecovery(targetNotebook)
      keys.delete(UNSAVED_RECOVERY_LIST_KEY)
    }

    for (const key of keys) {
      if (key.startsWith('__')) continue
      const item = notes.items.find((it) => it.key === key)
      if (item?.notebookId === targetNotebook.id) continue
      const doc = await api.getNote(key)
      if (doc.notebookId === targetNotebook.id) continue
      const res = await api.updateNote({
        key,
        notebookId: targetNotebook.id,
        content: doc.content,
        text: doc.text || ''
      })
      notes.applyUpdated(key, movedListItem(key, res.key, targetNotebook, res.updatedAt))
    }
    movePickerOpen.value = false
    exitNoteSelection()
    await refreshNotes()
  } catch (e) {
    await dialog.alert({ title: e instanceof Error ? e.message : '移动失败' })
  } finally {
    noteBulkPending.value = false
  }
}

async function deleteSelectedNotes() {
  if (noteBulkPending.value) return
  if (selectedNoteCount.value === 0) return
  if (isTrashView.value) {
    const ok = await dialog.confirm({
      title: trashNoteDialogTitle(),
      message: trashNoteDialogMessage(selectedNoteCount.value),
      confirmText: trashNoteLabel()
    })
    if (!ok) return
  }

  noteBulkPending.value = true
  let shouldRefreshAfterLocalDelete = false
  try {
    const trashKeys: string[] = []
    for (const key of selectedNoteKeys.value) {
      if (isUnsavedRecoveryKey(key)) {
        note.discardUnsavedRecovery()
        shouldRefreshAfterLocalDelete = true
      } else if (key.startsWith('__')) {
        notes.removeLocal(key)
      } else if (isTrashView.value) {
        trashKeys.push(key)
      } else {
        await notes.remove(key)
      }
    }
    if (trashKeys.length) {
      const res = await notes.purgeTrashMany(trashKeys)
      if (res.errors.length) {
        await dialog.alert({ title: `${res.errors.length} 条笔记删除失败，请重试` })
      }
    }
    exitNoteSelection()
    if (shouldRefreshAfterLocalDelete) await refreshNotes()
  } catch (e) {
    await dialog.alert({ title: e instanceof ApiError ? e.message : '删除失败' })
  } finally {
    noteBulkPending.value = false
  }
}

async function restoreSelectedNotes() {
  if (noteBulkPending.value || selectedNoteCount.value === 0 || !isTrashView.value) return
  noteBulkPending.value = true
  try {
    for (const key of selectedNoteKeys.value) {
      await notes.restoreTrash(key)
    }
    exitNoteSelection()
  } catch (e) {
    await dialog.alert({ title: e instanceof ApiError ? e.message : '恢复失败' })
  } finally {
    noteBulkPending.value = false
  }
}
</script>

<template>
  <!-- 手机：笔记本下拉 + 搜索 + 双列瀑布流 + FAB -->
  <section v-if="!isWide" class="pane mobile" :class="{ selecting: noteSelectionMode }">
    <div class="mobile-list-header">
      <div v-if="noteSelectionMode" class="note-select-header">
        <button class="icon-button" type="button" :disabled="noteBulkPending" title="取消" aria-label="取消" @click="exitNoteSelection">
          <X :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <strong>已选择 {{ selectedNoteCount }} 项</strong>
        <span class="note-select-header-spacer"></span>
      </div>

      <div v-else class="mobile-notebook-row">
        <button class="refresh-button icon-button" type="button" title="刷新" aria-label="刷新笔记" :disabled="isRefreshingNotes" @click="handleManualRefresh">
          <RefreshCw :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <div class="mobile-notebook-menu-wrap">
          <div class="mobile-notebook-pill">
            <button class="mobile-notebook-manage icon-button" type="button" title="管理笔记本" aria-label="管理笔记本" @click="openManager">
              <Menu :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <button class="mobile-notebook-select" type="button" :aria-expanded="notebookMenuOpen" @click="toggleNotebookMenu">
              <span class="mobile-notebook-name">{{ currentMobileNotebookName }}</span>
              <ChevronDown class="mobile-notebook-chevron" :class="{ open: notebookMenuOpen }" :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <div v-if="notebookMenuOpen" class="mobile-notebook-menu" role="listbox">
            <button
              v-for="entry in mobileNotebookEntries"
              :key="entry.id ?? '__all'"
              class="mobile-notebook-menu-item"
              type="button"
              :class="{ active: notebooks.current === entry.id }"
              role="option"
              :aria-selected="notebooks.current === entry.id"
              @click="select(entry.id)"
            >
              {{ entry.name }}
            </button>
          </div>
        </div>
        <button v-if="canSearchNotes" class="search-button icon-button" type="button" :title="searchButtonLabel" :aria-label="searchButtonLabel" @click="openSearch">
          <Search :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div ref="mobileListRef" class="cards" @scroll.passive="handleListScroll">
      <div class="card-columns">
        <NoteListCard
          v-for="it in notes.items"
          :key="it.key"
          :item="it"
          :selecting="noteSelectionMode"
          :selected="isNoteSelected(it.key)"
          :pressed="!noteSelectionMode && pressedNoteKey === it.key"
          :unsaved="isUnsavedNote(it.key)"
          :local-save-status="localSaveStatus(it)"
          :time-text="formatNoteListTime(it)"
          @pointerdown="startNoteLongPress(it.key)"
          @pointerup="clearNotePress"
          @pointerleave="clearNotePress"
          @pointercancel="clearNotePress"
          @contextmenu.stop.prevent="handleNoteContextSelect(it.key)"
          @click="handleNoteClick(it.key)"
        />
      </div>
    </div>
    <button v-if="!noteSelectionMode && canCreateNote" class="fab" @click="emit('new')">＋</button>
    <footer v-if="noteSelectionMode" class="note-bulk-toolbar">
      <div class="pill-toolbar" role="toolbar" aria-label="笔记批量操作">
        <button v-if="!isTrashView" type="button" title="移动到笔记本" aria-label="移动到笔记本" :disabled="noteBulkPending || selectedNoteCount === 0" @click="openMovePicker">
          <FolderInput :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button v-if="isTrashView" type="button" title="恢复" aria-label="恢复" :disabled="noteBulkPending || selectedNoteCount === 0" @click="restoreSelectedNotes">
          <RotateCcw :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button type="button" :title="trashNoteLabel()" :aria-label="trashNoteLabel()" :disabled="noteBulkPending || selectedNoteCount === 0" @click="deleteSelectedNotes">
          <Trash2 :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </footer>
  </section>

  <!-- 大屏：紧凑列表 -->
  <section v-else class="pane" :class="{ selecting: noteSelectionMode }">
    <div class="desktop-top-area">
      <div v-if="noteSelectionMode" class="note-select-header desktop-select-header">
        <button class="icon-button" type="button" :disabled="noteBulkPending" title="取消" aria-label="取消" @click="exitNoteSelection">
          <X :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <span class="note-select-header-spacer"></span>
      </div>
      <div v-else class="desktop-top-controls">
        <header>
          <div class="header-main">
            <button class="refresh-button icon-button" type="button" title="刷新" aria-label="刷新笔记" :disabled="isRefreshingNotes" @click="handleManualRefresh">
              <RefreshCw :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <div class="desktop-actions">
            <button v-if="canSearchNotes" class="search-button icon-button" type="button" :title="searchButtonLabel" :aria-label="searchButtonLabel" @click="emit('search')">
              <Search :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
            <span v-else class="search-button toolbar-placeholder" aria-hidden="true"></span>
            <button v-if="canCreateNote" class="add" type="button" title="新建笔记" aria-label="新建笔记" @click="$emit('new')">
              <Plus :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
            <span v-else class="add toolbar-placeholder" aria-hidden="true"></span>
          </div>
        </header>
      </div>
    </div>
    <ul ref="desktopListRef" class="list" @scroll.passive="handleListScroll">
      <li
        v-for="it in notes.items"
        :key="it.key"
        :class="{ selecting: noteSelectionMode, selected: isNoteSelected(it.key), active: !noteSelectionMode && isCurrentNote(it.key) }"
        @pointerdown="startNoteLongPress(it.key)"
        @pointerup="clearNoteLongPress"
        @pointerleave="clearNoteLongPress"
        @pointercancel="clearNoteLongPress"
        @mousedown.right.prevent="handleNoteContextSelect(it.key)"
        @contextmenu.stop.prevent="handleNoteContextSelect(it.key)"
        @click="handleNoteClick(it.key)"
      >
        <span
          v-if="noteSelectionMode"
          class="note-select-badge"
          :class="{ checked: isNoteSelected(it.key) }"
          :aria-label="isNoteSelected(it.key) ? '已选' : '选择'"
        >
          <CircleCheck v-if="isNoteSelected(it.key)" :size="16" :stroke-width="2" aria-hidden="true" />
          <Circle v-else :size="16" :stroke-width="2" aria-hidden="true" />
        </span>
        <div class="title">
          <span class="title-text">{{ it.title || '(无标题)' }}</span>
          <span v-if="isSavingNote(it)" class="save-status-badge saving-badge">保存中</span>
          <template v-else-if="localSaveStatus(it) === 'failed'">
            <span class="save-status-badge failed-badge">保存失败</span>
            <span class="unsaved-badge">草稿</span>
          </template>
          <span v-else-if="localSaveStatus(it) === 'pending'" class="unsaved-badge">草稿</span>
        </div>
        <div class="summary">{{ it.summary }}</div>
      </li>
    </ul>
    <footer v-if="noteSelectionMode" class="note-bulk-toolbar">
      <div class="pill-toolbar" role="toolbar" aria-label="笔记批量操作">
        <button v-if="!isTrashView" type="button" title="移动到笔记本" aria-label="移动到笔记本" :disabled="noteBulkPending || selectedNoteCount === 0" @click="openMovePicker">
          <FolderInput :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button v-if="isTrashView" type="button" title="恢复" aria-label="恢复" :disabled="noteBulkPending || selectedNoteCount === 0" @click="restoreSelectedNotes">
          <RotateCcw :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button type="button" :title="trashNoteLabel()" :aria-label="trashNoteLabel()" :disabled="noteBulkPending || selectedNoteCount === 0" @click="deleteSelectedNotes">
          <Trash2 :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </footer>
  </section>

  <div v-if="movePickerOpen" class="move-picker-backdrop" tabindex="-1" @keydown.esc="closeMovePicker" @click.self="closeMovePicker">
    <section class="move-picker" role="dialog" aria-modal="true" aria-labelledby="move-picker-title">
      <header class="move-picker-header">
        <button
          class="move-picker-nav-button icon-button"
          type="button"
          title="取消"
          aria-label="取消"
          :disabled="noteBulkPending"
          @click="closeMovePicker"
        >
          <X :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <h2 id="move-picker-title" class="move-picker-title">移动 {{ selectedNoteCount }} 项</h2>
        <span class="move-picker-header-spacer" aria-hidden="true"></span>
      </header>

      <main class="move-picker-content">
        <ul class="manager-card">
          <li
            v-for="nb in availableMoveNotebooks"
            :key="nb.id"
            class="manager-row"
          >
            <button
              class="manager-row-main"
              type="button"
              :disabled="noteBulkPending"
              @click="moveSelectedNotes(nb)"
            >
              <span class="manager-name">{{ nb.name }}</span>
              <span class="manager-hint">移动</span>
            </button>
          </li>
        </ul>
      </main>
    </section>
  </div>

  <div v-if="managerOpen" class="manager-backdrop" tabindex="-1" @keydown.esc="closeManager">
    <section class="manager" role="dialog" aria-modal="true" aria-labelledby="manager-title">
      <div class="manager-top-overlay">
        <header class="manager-header">
          <button
            v-if="selectionMode"
            class="manager-text-button icon-button"
            type="button"
            title="取消"
            aria-label="取消"
            :disabled="pending"
            @click="exitSelection"
          >
            <X :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            v-else
            class="manager-nav-button icon-button"
            type="button"
            title="返回"
            aria-label="返回"
            :disabled="pending"
            @click="closeManager"
          >
            <ArrowLeft :size="18" :stroke-width="2" aria-hidden="true" />
          </button>

          <h2 id="manager-title" class="manager-title">{{ managerTitle }}</h2>

          <button
            v-if="!selectionMode"
            class="icon-button manager-add-button"
            type="button"
            title="新建笔记本"
            aria-label="新建笔记本"
            :disabled="pending"
            @click="promptCreateNotebook"
          >
            <Plus :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
          <span v-else class="manager-header-spacer"></span>
        </header>
      </div>
      <main class="manager-content" :class="{ selecting: selectionMode }">
        <p v-if="managerError" class="manager-error">{{ managerError }}</p>
        <ul class="manager-card">
          <li class="manager-row">
            <button
              class="manager-row-main"
              type="button"
              :disabled="selectionMode || pending"
              @pointerdown="startLongPress(null)"
              @pointerup="clearLongPress"
              @pointerleave="clearLongPress"
              @pointercancel="clearLongPress"
              @contextmenu.stop.prevent="enterSelection(null)"
              @click="handleStaticNotebookClick(null)"
            >
              <span class="manager-name">全部笔记</span>
              <span v-if="!selectionMode" class="manager-hint">进入</span>
            </button>
          </li>
          <li class="manager-row" :class="{ muted: selectionMode }">
            <button
              class="manager-row-main"
              type="button"
              :disabled="pending || selectionMode"
              @pointerdown="startLongPress(DEFAULT_NOTEBOOK_ID)"
              @pointerup="clearLongPress"
              @pointerleave="clearLongPress"
              @pointercancel="clearLongPress"
              @contextmenu.stop.prevent="enterSelection(DEFAULT_NOTEBOOK_ID)"
              @click="handleStaticNotebookClick(DEFAULT_NOTEBOOK_ID)"
            >
              <span class="manager-name">默认笔记本</span>
              <span v-if="!selectionMode" class="manager-hint">进入</span>
            </button>
          </li>
          <li
            v-for="nb in customNotebooks"
            :key="nb.id"
            class="manager-row"
            :class="{ selected: selectedNotebook === nb.id }"
          >
            <button
              class="manager-row-main"
              type="button"
              :disabled="pending"
              @pointerdown="startLongPress(nb.id)"
              @pointerup="clearLongPress"
              @pointerleave="clearLongPress"
              @pointercancel="clearLongPress"
              @contextmenu.stop.prevent="enterSelection(nb.id)"
              @click="handleNotebookClick(nb)"
            >
              <span class="manager-name">{{ nb.name }}</span>
              <span
                v-if="selectionMode"
                class="select-text"
                :class="{ checked: selectedNotebook === nb.id }"
                :aria-label="selectedNotebook === nb.id ? '已选' : '选择'"
              >
                <CircleCheck v-if="selectedNotebook === nb.id" :size="18" :stroke-width="2" aria-hidden="true" />
                <Circle v-else :size="18" :stroke-width="2" aria-hidden="true" />
              </span>
              <span v-else class="manager-hint">进入</span>
            </button>
          </li>
          <li class="manager-row" :class="{ muted: selectionMode }">
            <button
              class="manager-row-main"
              type="button"
              :disabled="pending || selectionMode"
              @pointerdown="startLongPress(TRASH_NOTEBOOK_ID)"
              @pointerup="clearLongPress"
              @pointerleave="clearLongPress"
              @pointercancel="clearLongPress"
              @contextmenu.stop.prevent="enterSelection(TRASH_NOTEBOOK_ID)"
              @click="handleStaticNotebookClick(TRASH_NOTEBOOK_ID)"
            >
              <span class="manager-name">{{ TRASH_NOTEBOOK_NAME }}</span>
              <span v-if="!selectionMode" class="manager-hint">进入</span>
            </button>
          </li>
        </ul>
      </main>

      <footer v-if="selectionMode" class="manager-toolbar">
        <div class="pill-toolbar" role="toolbar" aria-label="笔记本批量操作">
          <button type="button" title="编辑" aria-label="编辑" :disabled="pending || selectedNotebook === null" @click="renameSelectedNotebook">
            <Pencil :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
          <button type="button" title="删除" aria-label="删除" :disabled="pending || selectedNotebook === null" @click="removeSelectedNotebook">
            <Trash2 :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.pane {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--page-pad-y) var(--page-pad-x) 0;
  gap: var(--space-3);
  overflow: hidden;
  background: transparent;
}
.title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  min-width: 0;
}
.title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unsaved-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
.save-status-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
.saving-badge {
  background: var(--glass-bg-soft);
  color: var(--text-secondary);
}
.failed-badge {
  background: rgba(239, 68, 68, 0.16);
  color: #ef4444;
}
.local-save-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}
.summary {
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.mobile {
  --mobile-list-header-height: calc(var(--page-pad-y) + 58px);
  gap: 0;
  padding-top: 0;
}
.mobile-list-header {
  position: absolute;
  z-index: 4;
  top: 0;
  right: 0;
  left: 0;
  height: var(--mobile-list-header-height);
  padding: var(--page-pad-y) var(--page-pad-x) 0;
  background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 16%, transparent 100%);
  pointer-events: none;
}
.mobile-list-header > * {
  pointer-events: auto;
}
.note-select-header {
  min-height: 40px;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 64px;
  align-items: center;
  gap: var(--space-2);
}
.note-select-header strong {
  text-align: center;
  font-size: 15px;
}
.note-select-header button {
  width: 42px;
  min-width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  color: var(--text);
  padding: 0;
  cursor: default;
  box-shadow: var(--glass-highlight);
}
.note-select-header-spacer {
  width: 42px;
  height: 42px;
}
.note-select-header button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.mobile-notebook-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.mobile-notebook-menu-wrap {
  position: relative;
  flex: 0 1 auto;
  display: flex;
  justify-content: center;
  min-width: 0;
}
.mobile-notebook-pill {
  width: max-content;
  min-width: 130px;
  max-width: min(240px, calc(100vw - var(--page-pad-x) * 2 - 104px));
  min-height: 42px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  color: var(--text);
  padding: 4px 8px 4px 6px;
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
}
.mobile-notebook-row.without-search .mobile-notebook-pill {
  max-width: min(260px, calc(100vw - var(--page-pad-x) * 2 - 62px));
}
.mobile-notebook-manage {
  width: 32px;
  min-width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  padding: 0;
  cursor: default;
}
.mobile-notebook-select {
  min-width: 0;
  min-height: 32px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0;
  cursor: default;
}
.mobile-notebook-name {
  min-width: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 720;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-notebook-chevron {
  justify-self: center;
  color: var(--text-secondary);
  transition: transform 0.16s ease;
}
.mobile-notebook-chevron.open {
  transform: rotate(180deg);
}
.mobile-notebook-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 8;
  width: max-content;
  min-width: 180px;
  max-width: min(260px, calc(100vw - var(--page-pad-x) * 2));
  max-height: min(320px, calc(100vh - var(--mobile-list-header-height) - 24px));
  overflow: auto;
  padding: 6px;
  border: var(--glass-fab-border);
  border-radius: var(--radius-card);
  background: var(--glass-fab);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  transform: translateX(-50%);
}
.mobile-notebook-menu-item {
  width: 100%;
  min-height: 36px;
  display: block;
  border: 1px solid transparent;
  border-radius: var(--radius-control-sm);
  background: transparent;
  color: var(--text);
  padding: 7px 10px;
  text-align: left;
  font-size: 13px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}
.mobile-notebook-menu-item.active {
  border-color: var(--border-strong);
  background: var(--glass-bg-strong);
}
.refresh-button,
.search-button {
  flex: 0 0 auto;
  border: var(--glass-border);
  background: var(--glass-bg-soft);
  font-size: 14px;
  cursor: default;
}
.refresh-button,
.search-button {
  width: 42px;
  min-width: 42px;
  height: 42px;
  border-radius: var(--radius-pill);
  padding: 0;
  color: var(--text);
  font-weight: 700;
  box-shadow: var(--glass-highlight);
}
.refresh-button:disabled,
.search-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.refresh-button:disabled svg {
  animation: refresh-spin 0.8s linear infinite;
}
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cards {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  margin: 0 calc(var(--page-pad-x) * -1);
  padding: var(--mobile-list-header-height) var(--page-pad-x) 0;
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
  scrollbar-width: none;
}
.cards::-webkit-scrollbar {
  display: none;
}
.card-columns {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.note-select-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg-soft);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.note-select-badge.checked,
.selected .note-select-badge {
  border-color: var(--border-strong);
  background: var(--accent);
  color: var(--accent-contrast);
}
.fab {
  position: absolute;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  width: 56px;
  height: 56px;
  border: var(--glass-fab-border);
  border-radius: var(--radius-pill);
  background: var(--glass-fab);
  color: var(--text);
  font-size: 30px;
  cursor: default;
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  transform: translateX(-50%);
}
.fab:active {
  transform: translateX(-50%) scale(0.96);
}
.note-bulk-toolbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  justify-content: center;
  padding: 0 var(--space-4) calc(20px + env(safe-area-inset-bottom));
  pointer-events: none;
}
.pill-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  min-height: 56px;
  padding: 6px 18px;
  border: var(--glass-fab-border);
  border-radius: var(--radius-pill);
  background: var(--glass-fab);
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
  pointer-events: auto;
}
.pill-toolbar button {
  width: 34px;
  min-width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-control-sm);
  background: transparent;
  color: var(--text);
  cursor: default;
}
.pill-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.pane.selecting .cards {
  padding-bottom: calc(78px + env(safe-area-inset-bottom));
}

/* ---- desktop ---- */
.desktop-top-area {
  position: absolute;
  z-index: 4;
  top: 0;
  right: 0;
  left: 0;
  height: var(--desktop-list-header-height);
  padding: var(--space-3) var(--space-2) 0;
  background: linear-gradient(to bottom, var(--bg-soft) 0%, var(--bg-soft) 20%, transparent 100%);
  pointer-events: none;
}
.desktop-top-area > * {
  pointer-events: auto;
}
.desktop-top-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.desktop-select-header {
  margin: 0;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
.desktop-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.desktop-actions .search-button {
  height: 42px;
}
.header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.desktop-top-controls .refresh-button,
.desktop-top-controls .search-button {
  height: 42px;
  width: 42px;
  min-width: 42px;
  padding: 0;
  font-size: 13px;
  white-space: nowrap;
}
.toolbar-placeholder {
  visibility: hidden;
  pointer-events: none;
}
.add {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-strong);
  color: var(--text);
  font-size: 20px;
  cursor: default;
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
}
.list {
  list-style: none;
  margin: 0;
  overflow: auto;
  flex: 1;
  padding: var(--desktop-list-header-height) 2px 2px;
  scrollbar-width: none;
}
.list::-webkit-scrollbar {
  display: none;
}
.list li {
  position: relative;
  padding: 11px 10px 11px 12px;
  border-radius: var(--radius-control);
  border: 1px solid transparent;
  touch-action: manipulation;
  user-select: none;
  cursor: default;
}
.list li + li {
  margin-top: 6px;
}
.list li.selected {
  border-color: var(--border-strong);
  background: var(--glass-bg-soft);
  box-shadow: var(--glass-highlight);
}
.list li.active {
  background: var(--surface-selected);
  color: var(--text);
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .refresh-button:disabled svg {
    animation-duration: 1.6s;
  }
}

.list .summary,
.list .meta {
  color: var(--text-secondary);
  font-size: 13px;
}
.list .summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pane.selecting .list {
  padding-bottom: 104px;
}
.pane:not(.mobile) .note-bulk-toolbar {
  padding-top: 28px;
  background: linear-gradient(to bottom, transparent 0%, var(--bg-soft) 80%, var(--bg-soft) 100%);
}
.move-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: end center;
  padding: var(--page-pad-y) var(--page-pad-x) var(--page-pad-bottom);
  background: rgba(0, 0, 0, 0.46);
}
.move-picker {
  width: min(100%, 420px);
  max-height: min(72vh, 560px);
  display: flex;
  flex-direction: column;
  border: var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--bg);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  overflow: hidden;
}
.move-picker-header {
  min-height: 56px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 42px;
  align-items: center;
  gap: var(--space-2);
  padding: 10px 12px 4px;
}
.move-picker-title {
  min-width: 0;
  margin: 0;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.move-picker-nav-button,
.move-picker-header-spacer {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
}
.move-picker-nav-button {
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  color: var(--text);
  cursor: default;
  box-shadow: var(--glass-highlight);
}
.move-picker-nav-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.move-picker-content {
  min-height: 0;
  overflow: auto;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom));
  scrollbar-width: none;
}
.move-picker-content::-webkit-scrollbar {
  display: none;
}
.manager-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.56);
}
.manager {
  --manager-header-height: calc(var(--page-pad-y) + 58px);
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: var(--bg);
  overflow: hidden;
}
.manager-top-overlay {
  position: absolute;
  z-index: 22;
  top: 0;
  right: 0;
  left: 0;
  height: var(--manager-header-height);
  padding: calc(16px + env(safe-area-inset-top)) var(--page-pad-x) 28px;
  background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 20%, transparent 100%);
  pointer-events: none;
}
.manager-top-overlay > * {
  pointer-events: auto;
}
.manager-header {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: 0;
}
.manager-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}
.manager-nav-button,
.manager-header-spacer {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
}
.manager-nav-button,
.manager-text-button,
.manager-add-button {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: default;
  box-shadow: var(--glass-highlight);
}
.manager-text-button {
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}
.manager-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--manager-header-height) var(--page-pad-x) calc(28px + env(safe-area-inset-bottom));
  scrollbar-width: none;
}
.manager-content.selecting {
  padding-bottom: calc(106px + env(safe-area-inset-bottom));
}
.manager-content::-webkit-scrollbar {
  display: none;
}
.manager-card {
  border: var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--glass-bg);
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
.manager-row-main:disabled {
  cursor: default;
  opacity: 0.45;
}
.manager-error {
  margin: 0 0 var(--space-3);
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 120, 84, 0.28);
  background: rgba(194, 65, 12, 0.18);
  color: #ffb199;
  font-size: 14px;
}
.manager-row {
  min-height: 54px;
  display: flex;
  align-items: center;
}
.manager-row:not(:last-child) .manager-row-main {
  border-bottom: 1px solid var(--border);
}
.manager-row-main {
  min-width: 0;
  flex: 1;
  align-self: stretch;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  padding: 0 var(--space-3);
  text-align: left;
  touch-action: manipulation;
  user-select: none;
  cursor: default;
}
.manager-row.selected .manager-row-main {
  background: rgba(255, 255, 255, 0.08);
}
.manager-row.muted {
  opacity: 0.45;
}
.manager-name {
  min-width: 0;
  justify-self: start;
  text-align: left;
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.manager-count {
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 500;
}
.manager-hint {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.manager-hint {
  justify-self: end;
}
.select-text {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg-soft);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.select-text.checked {
  border-color: var(--border-strong);
  background: var(--accent);
  color: var(--accent-contrast);
}
.select-text.disabled {
  opacity: 0.45;
}
.manager-toolbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 21;
  padding: 28px var(--space-4) calc(20px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
  background: linear-gradient(to bottom, transparent 0%, var(--bg) 20%, var(--bg) 100%);
  pointer-events: none;
}
@media (min-width: 768px) {
  .manager-backdrop {
    display: flex;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }
  .manager {
    width: min(520px, 100%);
    height: min(760px, 100%);
    margin: auto;
    padding: var(--space-4) var(--space-4) 0;
    border-radius: var(--radius-card);
    border: var(--glass-border);
    background: var(--glass-bg);
    box-shadow: var(--glass-shadow), var(--glass-highlight);
  }
  .manager-top-overlay {
    position: static;
    z-index: auto;
    min-height: 0;
    padding: 0;
    background: transparent;
    pointer-events: auto;
  }
  .manager-header {
    margin-bottom: var(--space-1);
  }
  .manager-content,
  .manager-content.selecting {
    padding: 6px 0 calc(28px + env(safe-area-inset-bottom));
  }
  .manager-toolbar {
    position: sticky;
    margin: 0 calc(var(--space-4) * -1);
    padding-top: 0;
    background: transparent;
  }
  .pane {
    --desktop-list-header-height: 66px;
    padding: var(--space-2);
    border: var(--glass-border);
    border-radius: calc(var(--radius-card) + 2px);
    background: var(--glass-bg);
    box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
  }
}
</style>
