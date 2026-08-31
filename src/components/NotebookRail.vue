<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Circle, CircleCheck, Pencil, Plus, Trash2, X } from '@lucide/vue'
import { DEFAULT_NOTEBOOK_ID, DEFAULT_NOTEBOOK_NAME, TRASH_NOTEBOOK_ID, TRASH_NOTEBOOK_NAME, useNotebooksStore } from '@/stores/notebooks'
import { useNotesStore } from '@/stores/notes'
import { ApiError } from '@/api/client'
import { useDialog } from '@/composables/useDialog'
import type { Notebook } from '@/api/types'

const notebooks = useNotebooksStore()
const notes = useNotesStore()
const selectionMode = shallowRef(false)
const selectedNotebook = shallowRef<string | null>(null)
const pending = shallowRef(false)
const error = shallowRef('')
const emit = defineEmits<{ select: [id: string | null] }>()
const dialog = useDialog()

const entries = computed(() => [
  { id: null, name: '全部笔记', kind: 'all' },
  ...notebooks.notebooks.map((nb) => ({ id: nb.id, name: notebookName(nb), kind: 'notebook' })),
  { id: TRASH_NOTEBOOK_ID, name: TRASH_NOTEBOOK_NAME, kind: 'trash' }
])
const hasEditableNotebook = computed(() => notebooks.notebooks.some((nb) => isEditable(nb.id)))

function notebookName(nb: Notebook) {
  return nb.id === DEFAULT_NOTEBOOK_ID ? DEFAULT_NOTEBOOK_NAME : nb.name
}

function selectNotebook(id: string | null) {
  if (selectionMode.value) {
    toggleSelected(id)
    return
  }
  emit('select', id)
}

function isEditable(id: string | null) {
  return id !== null && id !== DEFAULT_NOTEBOOK_ID && id !== TRASH_NOTEBOOK_ID
}

function toggleSelected(id: string | null) {
  if (!isEditable(id)) return
  selectedNotebook.value = selectedNotebook.value === id ? null : id
}

function enterSelection(id: string | null) {
  if (!hasEditableNotebook.value) return
  selectionMode.value = true
  selectedNotebook.value = isEditable(id) ? id : null
  error.value = ''
}

function exitSelection() {
  if (pending.value) return
  selectionMode.value = false
  selectedNotebook.value = null
  error.value = ''
}

function showError(e: unknown, fallback: string) {
  error.value = e instanceof ApiError ? e.message : fallback
}

async function promptCreateNotebook() {
  const name = await dialog.prompt({
    title: '新建笔记本'
  })
  if (!name) return
  pending.value = true
  error.value = ''
  try {
    await notebooks.create(name)
  } catch (e) {
    showError(e, '创建失败')
  } finally {
    pending.value = false
  }
}

async function renameSelectedNotebook() {
  const id = selectedNotebook.value
  const nb = notebooks.notebooks.find((item) => item.id === id)
  if (!nb || !isEditable(nb.id)) return
  const to = await dialog.prompt({
    title: '重命名笔记本',
    defaultValue: nb.name
  })
  if (!to || to === nb.name) return
  pending.value = true
  error.value = ''
  try {
    await notebooks.rename(nb.id, to)
    selectedNotebook.value = nb.id
    await notes.refresh()
  } catch (e) {
    showError(e, '重命名失败')
  } finally {
    pending.value = false
  }
}

async function removeSelectedNotebook() {
  const id = selectedNotebook.value
  const nb = notebooks.notebooks.find((item) => item.id === id)
  if (!nb || !isEditable(nb.id) || pending.value) return
  const ok = await dialog.confirm({
    title: '删除笔记本',
    message: `删除「${nb.name}」？其中笔记会移到默认笔记本。`,
    confirmText: '删除'
  })
  if (!ok) return
  let removed = false
  pending.value = true
  error.value = ''
  try {
    await notebooks.remove(nb.id)
    removed = true
    await notes.refresh()
  } catch (e) {
    showError(e, '删除失败')
  } finally {
    pending.value = false
    if (removed) exitSelection()
  }
}
</script>

<template>
  <aside class="notebook-rail" :class="{ selecting: selectionMode }" aria-label="笔记本列表">
    <div class="rail-top-overlay">
      <div class="rail-top">
        <button v-if="selectionMode" class="done-button" type="button" title="取消" aria-label="取消" :disabled="pending" @click="exitSelection">
          <X :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button
          v-if="!selectionMode"
          class="add-button"
          type="button"
          title="新建笔记本"
          aria-label="新建笔记本"
          :disabled="pending"
          @click="promptCreateNotebook"
        >
          <Plus :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
        <span class="rail-top-spacer"></span>
      </div>
    </div>

    <nav class="rail-list" aria-label="笔记本">
      <p v-if="error" class="rail-error">{{ error }}</p>
      <button
        v-for="entry in entries"
        :key="entry.id ?? '__all'"
        class="rail-item"
        type="button"
        :class="{ active: notebooks.current === entry.id, selected: selectionMode && selectedNotebook === entry.id, disabled: selectionMode && !isEditable(entry.id) }"
        :title="entry.name"
        :aria-label="entry.name"
        :aria-pressed="selectionMode ? selectedNotebook === entry.id : undefined"
        :disabled="pending"
        @contextmenu.stop.prevent="enterSelection(entry.id)"
        @click="selectNotebook(entry.id)"
      >
        <span class="rail-name">{{ entry.name }}</span>
        <span
          v-if="selectionMode && isEditable(entry.id)"
          class="rail-select-badge"
          :class="{ checked: selectedNotebook === entry.id }"
          :aria-label="selectedNotebook === entry.id ? '已选' : '选择'"
        >
          <CircleCheck v-if="selectedNotebook === entry.id" :size="16" :stroke-width="2" aria-hidden="true" />
          <Circle v-else :size="16" :stroke-width="2" aria-hidden="true" />
        </span>
      </button>
    </nav>

    <footer v-if="selectionMode" class="rail-toolbar">
      <div class="pill-toolbar" role="toolbar" aria-label="笔记本操作">
        <button type="button" title="编辑" aria-label="编辑" :disabled="pending || selectedNotebook === null" @click="renameSelectedNotebook">
          <Pencil :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button type="button" title="删除" aria-label="删除" :disabled="pending || selectedNotebook === null" @click="removeSelectedNotebook">
          <Trash2 :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.notebook-rail {
  --rail-width: 128px;
  --rail-header-height: 78px;
  width: var(--rail-width);
  min-width: var(--rail-width);
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0;
  background: transparent;
}

.rail-top-overlay {
  z-index: 4;
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: var(--rail-header-height);
  padding: var(--space-3) 2px 0;
  background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 16%, transparent 100%);
  pointer-events: none;
}

.rail-top-overlay > * {
  pointer-events: auto;
}

.rail-top {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 4px;
}

.notebook-rail.selecting .rail-top {
  justify-content: space-between;
}

.add-button,
.done-button,
.rail-top-spacer {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
}

.add-button,
.done-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  color: var(--text);
  cursor: default;
  box-shadow: var(--glass-highlight);
}

.add-button {
  margin-left: -3px;
}

.add-button:disabled,
.done-button:disabled,
.rail-toolbar button:disabled,
.rail-item:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.rail-error {
  margin: 0 4px 6px;
  color: #ffb199;
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.rail-list {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  padding: calc(var(--rail-header-height) + 2px) 2px 8px;
}

.rail-item {
  min-width: 0;
  height: 38px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  padding: 0 14px;
  color: var(--text-secondary);
  text-align: left;
  cursor: default;
  overflow: hidden;
}

.rail-item.active {
  background: var(--surface-selected);
  color: var(--text);
}

.rail-item.selected {
  background: var(--glass-bg-strong);
  color: var(--text);
}

.rail-item.disabled {
  opacity: 0.5;
}

.rail-select-badge {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: -10px;
  margin-top: -2px;
  padding: 0;
  border: var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg-soft);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.rail-select-badge.checked {
  border-color: var(--border-strong);
  background: var(--accent);
  color: var(--accent-contrast);
}

.rail-name {
  min-width: 0;
  height: 38px;
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-toolbar {
  position: absolute;
  z-index: 4;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: center;
  padding: 28px 4px 12px;
  background: linear-gradient(to bottom, transparent 0%, var(--bg) 28px, var(--bg) 100%);
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

.notebook-rail.selecting .rail-top-spacer {
  display: none;
}

.notebook-rail.selecting .rail-list {
  padding-bottom: 108px;
}

</style>
