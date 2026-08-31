<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, useTemplateRef } from 'vue'
import { ArrowLeft, Search } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNoteStore } from '@/stores/note'
import { useDialog } from '@/composables/useDialog'
import * as api from '@/api/client'
import type { NoteListItem } from '@/api/types'
import { formatNoteListTime } from '@/utils/noteList'
import NoteListCard from '@/components/NoteListCard.vue'

const router = useRouter()
const route = useRoute()
const { isWide } = useBreakpoint()
const note = useNoteStore()
const dialog = useDialog()

const input = shallowRef('')
const query = shallowRef('')
const items = shallowRef<NoteListItem[]>([])
const nextCursor = shallowRef<string | null>(null)
const loading = shallowRef(false)
const searched = shallowRef(false)
const error = shallowRef('')
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')

const hasMore = computed(() => nextCursor.value !== null)
const canSearch = computed(() => Boolean(input.value.trim()) && !loading.value)
const activeNoteKey = computed(() => note.key)
const searchSource = computed(() => route.query.source === 'trash' ? 'trash' : 'notes')
const isTrashSearch = computed(() => searchSource.value === 'trash')
const searchPlaceholder = computed(() => isTrashSearch.value ? '搜索最近删除' : '搜索全部笔记')

onMounted(() => {
  focusSearchInput()
})

function focusSearchInput() {
  nextTick(() => {
    searchInput.value?.focus({ preventScroll: true })
    window.setTimeout(() => {
      searchInput.value?.focus({ preventScroll: true })
    }, 80)
  })
}

function onInput(e: Event) {
  input.value = (e.target as HTMLInputElement).value
}

async function submitSearch() {
  if (loading.value) return
  const nextQuery = input.value.trim()
  if (!nextQuery) return

  input.value = nextQuery
  query.value = nextQuery
  items.value = []
  nextCursor.value = null
  searched.value = true
  error.value = ''
  loading.value = true

  try {
    const res = await api.searchNotes({ q: nextQuery, source: searchSource.value })
    items.value = res.items
    nextCursor.value = res.nextCursor
  } catch (e) {
    error.value = e instanceof api.ApiError ? e.message : '搜索失败'
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || !query.value || !nextCursor.value) return
  error.value = ''
  loading.value = true

  try {
    const res = await api.searchNotes({ q: query.value, cursor: nextCursor.value, source: searchSource.value })
    items.value = [...items.value, ...res.items]
    nextCursor.value = res.nextCursor
  } catch (e) {
    error.value = e instanceof api.ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function isCurrentNote(key: string) {
  return activeNoteKey.value === key
}

function closeSearch() {
  router.push('/')
}

async function openNote(key: string) {
  try {
    await note.waitForPendingSave()
    await note.open(key)
    router.push(isWide.value ? '/' : '/edit')
  } catch (e) {
    await dialog.alert({ title: e instanceof Error ? e.message : '加载失败' })
  }
}
</script>

<template>
  <section class="search-page" :class="{ wide: isWide }">
    <div class="search-top-overlay">
      <header class="search-header">
        <button class="nav-button icon-button" type="button" title="返回" aria-label="返回" @click="closeSearch">
          <ArrowLeft :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <form class="search-form" @submit.prevent="submitSearch">
          <input
            ref="searchInput"
            :value="input"
            class="search-input"
            type="search"
            :placeholder="searchPlaceholder"
            autofocus
            @input="onInput"
          />
          <button class="submit-button icon-button" type="submit" title="搜索" aria-label="搜索" :disabled="!canSearch">
            <Search :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
        </form>
      </header>
    </div>

    <div class="search-results">
      <p v-if="error" class="status error">{{ error }}</p>
      <p v-else-if="loading && items.length === 0" class="status">正在搜索...</p>
      <p v-else-if="searched && items.length === 0" class="status">没有找到相关笔记</p>

      <div v-if="!isWide" class="cards">
        <div class="card-columns">
          <NoteListCard
            v-for="it in items"
            :key="it.key"
            :item="it"
            :active="isCurrentNote(it.key)"
            :time-text="formatNoteListTime(it)"
            @click="openNote(it.key)"
          />
        </div>
      </div>

      <ul v-else class="list">
        <li
          v-for="it in items"
          :key="it.key"
          :class="{ active: isCurrentNote(it.key) }"
          @click="openNote(it.key)"
        >
          <div class="title">{{ it.title || '(无标题)' }}</div>
          <div class="summary">{{ it.summary }}</div>
          <div class="meta">{{ it.notebookName }}</div>
        </li>
      </ul>

      <button v-if="hasMore" class="more" type="button" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中' : '加载更多' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.search-page {
  --search-header-height: calc(var(--page-pad-y) + 58px);
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}
.search-page.wide {
  height: calc(100% - var(--space-4) * 2);
  max-width: 760px;
  margin: var(--space-4) auto;
  padding: var(--space-4);
  gap: var(--space-3);
}
.search-top-overlay {
  position: absolute;
  z-index: 4;
  top: 0;
  right: 0;
  left: 0;
  height: var(--search-header-height);
  padding: var(--page-pad-y) var(--page-pad-x) 28px;
  background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 20%, transparent 100%);
  pointer-events: none;
}
.search-top-overlay > * {
  pointer-events: auto;
}
.search-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.nav-button,
.submit-button,
.more {
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  color: var(--text);
  box-shadow: var(--glass-highlight);
  cursor: default;
}
.nav-button {
  width: 42px;
  min-width: 42px;
  height: 42px;
  padding: 0;
  font-weight: 700;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.search-form {
  min-width: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.search-input {
  width: 100%;
  min-height: 38px;
  padding: 7px 12px;
  border: var(--glass-border);
  border-radius: var(--radius-control);
  background: var(--glass-bg-soft);
  color: var(--text);
  box-shadow: var(--glass-highlight);
  outline: none;
  font-size: 14px;
}
.search-input:focus {
  border-color: var(--border-strong);
  background: var(--glass-bg);
}
.submit-button {
  width: 42px;
  min-width: 42px;
  height: 42px;
  padding: 0;
  font-weight: 700;
}

.submit-button:disabled,
.more:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.status {
  margin: var(--space-2) 0 var(--space-3);
  color: var(--text-secondary);
  text-align: center;
  font-size: 14px;
}
.status.error {
  color: #ffb199;
}
.search-results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--search-header-height) var(--page-pad-x) var(--page-pad-bottom);
  scrollbar-width: none;
}
.cards {
  width: 100%;
}
.card-columns {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-results::-webkit-scrollbar {
  display: none;
}
.list li.active {
  border-color: var(--border-strong);
  background: var(--glass-bg-strong);
}
.title {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.list .title {
  font-size: 15px;
}
.summary {
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.meta {
  color: var(--text-secondary);
  font-size: 12px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 2px;
}
.list li {
  padding: 11px 16px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  cursor: default;
  user-select: none;
}
.list li + li {
  margin-top: 6px;
}
.list .summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list .meta {
  margin-top: 4px;
}
.more {
  width: 100%;
  min-height: 38px;
  margin-top: var(--space-2);
  padding: 8px 14px;
  font-weight: 700;
}
@media (min-width: 1024px) {
  .search-page {
    border: var(--glass-border);
    border-radius: var(--radius-card);
    background: var(--glass-bg);
    box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
  }

  .search-top-overlay {
    position: static;
    z-index: auto;
    min-height: 0;
    padding: 0;
    background: transparent;
    pointer-events: auto;
  }

  .search-results {
    padding: 0 2px 0;
  }
}
</style>
