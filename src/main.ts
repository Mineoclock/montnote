import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from '@/router'
import App from '@/App.vue'
import { setUnauthorizedHandler } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import '@/styles/tokens.css'
import '@/pwa'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

const auth = useAuthStore()
await auth.restore()

setUnauthorizedHandler(() => {
  auth.clear()
  if (router.currentRoute.value.name !== 'login') {
    router.replace({ name: 'login' }).catch(() => {})
  }
})

app.use(router).mount('#app')
