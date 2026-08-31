import { computed, shallowRef } from 'vue'

const pendingRequests = shallowRef(0)
const isGlobalLoading = computed(() => pendingRequests.value > 0)

export function beginGlobalLoading() {
  pendingRequests.value += 1
}

export function endGlobalLoading() {
  pendingRequests.value = Math.max(0, pendingRequests.value - 1)
}

export function useGlobalLoading() {
  return { isGlobalLoading }
}
