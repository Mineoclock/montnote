import { shallowRef } from 'vue'

const TOAST_DURATION_MS = 2200

const toastMessage = shallowRef('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

export function useToast() {
  function showToast(message: string) {
    toastMessage.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastMessage.value = ''
      toastTimer = null
    }, TOAST_DURATION_MS)
  }

  function clearToast() {
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = null
    toastMessage.value = ''
  }

  return { toastMessage, showToast, clearToast }
}
