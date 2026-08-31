import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const NOTEBOOKS_PANEL_QUERY = 'notebooks'

export const useAppStore = defineStore('app', () => {
  const homeInitialized = shallowRef(false)

  function markHomeInitialized() {
    homeInitialized.value = true
  }

  return { homeInitialized, markHomeInitialized }
})
