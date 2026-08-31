<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { ArrowRight, LoaderCircle } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { assertConfigured } from '@/api/client'

const auth = useAuthStore()
const router = useRouter()
const username = shallowRef('')
const accessKeyId = shallowRef('')
const accessKeySecret = shallowRef('')
const submitting = shallowRef(false)
const error = shallowRef('')

const canSubmit = computed(() =>
  username.value.trim() &&
  accessKeyId.value.trim() &&
  accessKeySecret.value.trim() &&
  !submitting.value
)

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  try {
    assertConfigured()
    await auth.setOssCredentials({
      username: username.value,
      accessKeyId: accessKeyId.value,
      accessKeySecret: accessKeySecret.value
    })
    await router.replace('/')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login">
    <section class="login-content" aria-labelledby="login-title">
      <h1 id="login-title" class="login-title">Montnote</h1>
      <form class="login-form" @submit.prevent="submit">
        <input v-model="username" class="login-input" type="text" autocomplete="username" placeholder="用户名" :disabled="submitting" />
        <input v-model="accessKeyId" class="login-input" type="text" autocomplete="off" placeholder="AccessKey ID" :disabled="submitting" />
        <input v-model="accessKeySecret" class="login-input" type="password" autocomplete="current-password" placeholder="AccessKey Secret" :disabled="submitting" />
        <p v-if="error" class="login-error">{{ error }}</p>
        <button class="login-submit" type="submit" :title="submitting ? '正在登录' : '登录'" :aria-label="submitting ? '正在登录' : '登录'" :disabled="!canSubmit">
          <LoaderCircle v-if="submitting" class="login-spinner" :size="18" :stroke-width="2" aria-hidden="true" />
          <ArrowRight v-else :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--page-pad-y) var(--page-pad-x) var(--page-pad-bottom);
  overflow: hidden;
}
.login-content {
  width: min(100%, 420px);
  padding-bottom: 40px;
}
.login-title {
  margin: 0 0 var(--space-3);
  padding-left: 16px;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
}
.login-form {
  display: grid;
  grid-template-columns: 1fr 42px;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.login-input {
  grid-column: 1 / -1;
  min-width: 0;
  height: 42px;
  padding: 8px 16px;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
  outline: none;
  font-size: 14px;
}
.login-input::placeholder {
  color: var(--text-secondary);
}
.login-input:focus {
  border-color: var(--border-strong);
  background: var(--glass-bg);
}
.login-input:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.login-error {
  grid-column: 1;
  min-width: 0;
  margin: 0;
  padding-left: 16px;
  color: #ffb199;
  font-size: 12px;
  line-height: 1.4;
}
.login-submit {
  grid-column: 2;
  width: 42px;
  min-width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--accent-contrast);
  padding: 0;
  cursor: default;
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
}
.login-submit:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.login-submit:not(:disabled):active {
  transform: scale(0.98);
}
.login-spinner {
  animation: login-spin 0.9s linear infinite;
}

@keyframes login-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
