import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '@/api/client'
import type { Notebook } from '@/api/types'

export const DEFAULT_NOTEBOOK_ID = 'default'
export const DEFAULT_NOTEBOOK_NAME = '默认笔记本'
export const TRASH_NOTEBOOK_ID = '__trash__'
export const TRASH_NOTEBOOK_NAME = '最近删除'

function normalizeNotebooks(items: Notebook[]) {
  const customNotebooks = items
    .filter((nb) => nb.id !== DEFAULT_NOTEBOOK_ID)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  return [
    { id: DEFAULT_NOTEBOOK_ID, name: DEFAULT_NOTEBOOK_NAME },
    ...customNotebooks
  ]
}

export const useNotebooksStore = defineStore('notebooks', () => {
  const notebooks = ref<Notebook[]>(normalizeNotebooks([]))
  const current = ref<string | null>(null) // null = 全部笔记
  const loading = ref(false)
  const nameById = computed(() => new Map(notebooks.value.map((nb) => [nb.id, nb.name])))
  const isTrashView = computed(() => current.value === TRASH_NOTEBOOK_ID)

  async function load() {
    loading.value = true
    try {
      notebooks.value = normalizeNotebooks((await api.listNotebooks()).notebooks)
    } finally {
      loading.value = false
    }
  }

  async function create(name: string) {
    notebooks.value = normalizeNotebooks((await api.createNotebook(name)).notebooks)
  }

  async function rename(id: string, name: string) {
    notebooks.value = normalizeNotebooks((await api.renameNotebook(id, name)).notebooks)
  }

  async function remove(id: string) {
    notebooks.value = normalizeNotebooks((await api.deleteNotebook(id)).notebooks)
    if (current.value === id) current.value = null
  }

  function select(nb: string | null) {
    current.value = nb
  }

  function displayName(id: string) {
    if (id === TRASH_NOTEBOOK_ID) return TRASH_NOTEBOOK_NAME
    return nameById.value.get(id) || DEFAULT_NOTEBOOK_NAME
  }

  return { notebooks, current, loading, nameById, isTrashView, displayName, load, create, rename, remove, select }
})
