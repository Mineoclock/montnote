import { ref } from 'vue'

// 共享单例：>=1024px 使用电脑三栏布局；否则使用单栏布局
const mq = window.matchMedia('(min-width: 1024px)')
const isWide = ref(mq.matches)
mq.addEventListener('change', (e) => {
  isWide.value = e.matches
})

export function useBreakpoint() {
  return { isWide }
}
