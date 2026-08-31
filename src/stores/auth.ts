import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { setCredentials as applyCredentials } from '@/api/client'
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  type OssCredentials
} from '@/api/credentials'

export const useAuthStore = defineStore('auth', () => {
  const credentials = shallowRef<OssCredentials | null>(null)
  const ready = shallowRef(false)
  const isAuthed = computed(() => credentials.value !== null)
  const username = computed(() => credentials.value?.username || '')

  async function restore() {
    credentials.value = await loadCredentials()
    applyCredentials(credentials.value)
    ready.value = true
  }

  async function setOssCredentials(next: OssCredentials) {
    credentials.value = await saveCredentials(next)
    applyCredentials(credentials.value)
  }

  function clear() {
    credentials.value = null
    applyCredentials(null)
    clearCredentials()
  }

  return { credentials, ready, isAuthed, username, restore, setOssCredentials, clear }
})
