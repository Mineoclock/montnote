import { createRouter, createWebHistory } from 'vue-router'
import { NOTEBOOKS_PANEL_QUERY, useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/', name: 'notes', component: () => import('@/views/NotesView.vue') },
    { path: '/edit', name: 'edit', component: () => import('@/views/NotesView.vue') },
    { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue') },
    { path: '/:rest(.*)', redirect: '/' }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.isAuthed && to.name !== 'login') return { name: 'login' }
  if (auth.isAuthed && to.name === 'login') return { name: 'notes' }

  const app = useAppStore()
  const needsHomeInitialized = to.name === 'edit' ||
    to.name === 'search' ||
    (to.name === 'notes' && to.query.panel === NOTEBOOKS_PANEL_QUERY)
  if (!app.homeInitialized && needsHomeInitialized) return { name: 'notes', replace: true }
})

export default router
