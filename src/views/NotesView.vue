<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useAppStore } from '@/stores/app'
import { TRASH_NOTEBOOK_ID, useNotebooksStore } from '@/stores/notebooks'
import { useNotesStore } from '@/stores/notes'
import { useNoteStore } from '@/stores/note'
import { isUnsavedRecoveryKey } from '@/stores/unsavedRecovery'
import { useDialog } from '@/composables/useDialog'
import { useToast } from '@/composables/useToast'
import { ApiError } from '@/api/client'
import NotebookRail from '@/components/NotebookRail.vue'
import NoteListPane from '@/components/NoteListPane.vue'
import EditorPane from '@/components/EditorPane.vue'

const { isWide } = useBreakpoint()
const route = useRoute()
const router = useRouter()
const app = useAppStore()
const notebooks = useNotebooksStore()
const notes = useNotesStore()
const note = useNoteStore()
const dialog = useDialog()
const { showToast } = useToast()

const showListPane = computed(() => isWide.value || route.name !== 'edit')

function isMobileEditRoute() {
  return !isWide.value && route.name === 'edit'
}

function unsavedNotebookFromSelection(id: string | null) {
  return id && id !== TRASH_NOTEBOOK_ID ? id : undefined
}

async function initializeHome() {
  if (app.homeInitialized) return
  if (route.name !== 'notes') return
  await Promise.allSettled([
    notebooks.load(),
    notes.refresh()
  ])
  app.markHomeInitialized()
}

onMounted(() => {
  note.setListPreviewEnabled(isWide.value)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  void initializeHome()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

watch(isWide, (wide) => {
  note.setListPreviewEnabled(wide)
  if (wide && route.name === 'edit') router.replace('/')
})

async function openNote(key: string) {
  if (isWide.value) {
    if (!(await saveCurrent())) return
  } else {
    const reopeningPendingSave = isUnsavedRecoveryKey(key)
    await note.waitForPendingSave()
    if (reopeningPendingSave && note.listKey && !isUnsavedRecoveryKey(note.listKey)) {
      router.push('/edit')
      return
    }
    router.push('/edit')
  }
  note.open(key).catch((e) => handleOpenError(e))
}

function handleOpenError(e: unknown) {
  if (e instanceof ApiError && e.status === 404) {
    showToast('笔记已在别处修改')
    if (!isWide.value && route.name === 'edit') {
      router.replace('/').catch(() => {})
    }
    notes.refresh().catch(() => {})
    return
  }
  dialog.alert({ title: e instanceof Error ? e.message : '加载失败' })
}
async function newNote() {
  if (notebooks.isTrashView) return
  if (isWide.value) {
    if (!(await saveCurrent())) return
  } else {
    await note.waitForPendingSave()
  }
  note.openNew(notebooks.current ?? undefined)
  if (!isWide.value) router.push('/edit')
}
async function selectNotebook(id: string | null) {
  if (isWide.value && note.isLocalNew()) {
    note.setUnsavedNotebook(unsavedNotebookFromSelection(id))
  } else if (isWide.value && !(await saveCurrent())) {
    return
  }
  if (notes.loading && !notes.searching) return
  notebooks.select(id)
  notes.refresh().catch((e) => {
    dialog.alert({ title: e instanceof Error ? e.message : '加载失败' })
  })
}
function openSearch() {
  router.push({
    path: '/search',
    query: notebooks.isTrashView ? { source: 'trash' } : undefined
  })
}
async function refreshNotes() {
  if (isWide.value && !(await saveCurrent())) return
  notes.refresh().catch((e) => {
    dialog.alert({ title: e instanceof Error ? e.message : '加载失败' })
  })
}
function refreshNotesIfStale() {
  notes.refreshIfStale().catch((e) => {
    dialog.alert({ title: e instanceof Error ? e.message : '加载失败' })
  })
}
function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  if (isMobileEditRoute()) return
  refreshNotesIfStale()
}
function saveErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '保存失败，请重试'
}
async function saveCurrent() {
  if (!note.dirty && !note.saving) return true
  try {
    await note.flushAutoSave()
    return true
  } catch (error) {
    await dialog.alert({ title: saveErrorMessage(error) })
    return false
  }
}
function closeEditor() {
  if (isWide.value) return
  note.saveInBackground()
  if (window.history.state?.back) router.back()
  else router.replace('/')
}

onBeforeRouteLeave((_to, from) => {
  if (!isWide.value && from.name === 'edit') note.saveInBackground()
})

onBeforeRouteUpdate((to, from) => {
  if (!isWide.value && from.name === 'edit' && to.name !== 'edit') note.saveInBackground()
  if (!isWide.value && from.name === 'edit' && to.name === 'notes') refreshNotesIfStale()
})
</script>

<template>
  <div class="shell" :class="{ wide: isWide }">
    <NotebookRail v-if="isWide" class="notebook-rail-pane" @select="selectNotebook" />
    <div v-show="showListPane" class="note-list-pane-wrap" :class="{ wide: isWide }">
      <NoteListPane @open="openNote" @new="newNote" @search="openSearch" @refresh="refreshNotes" />
    </div>
    <EditorPane v-if="isWide || route.name === 'edit'" class="editor-pane" @close="closeEditor" />
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  height: 100%;
  min-width: 0;
  background: transparent;
}
.shell.wide {
  display: grid;
  grid-template-columns: auto clamp(228px, 26vw, 372px) minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-1) var(--space-3) var(--space-3);
  background: transparent;
}
.shell.wide .notebook-rail-pane {
  min-width: 0;
}
.note-list-pane-wrap {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.shell.wide .editor-pane {
  min-width: 0;
}
</style>
