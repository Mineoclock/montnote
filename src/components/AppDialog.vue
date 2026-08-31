<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useDialog } from '@/composables/useDialog'

const { dialogState, resolveDialog } = useDialog()
const inputValue = shallowRef('')
const inputRef = shallowRef<HTMLInputElement | null>(null)
const dialogViewportStyle = shallowRef<CSSProperties>({
  '--dialog-viewport-top': '0px',
  '--dialog-viewport-height': '100dvh'
})
let viewportUpdateFrame: number | null = null

const isPrompt = computed(() => dialogState.value.kind === 'prompt')
const isConfirm = computed(() => dialogState.value.kind === 'confirm')

function updateDialogViewport() {
  if (viewportUpdateFrame !== null) cancelAnimationFrame(viewportUpdateFrame)
  viewportUpdateFrame = requestAnimationFrame(() => {
    viewportUpdateFrame = null
    const viewport = window.visualViewport
    dialogViewportStyle.value = {
      '--dialog-viewport-top': `${Math.max(0, Math.round(viewport?.offsetTop ?? 0))}px`,
      '--dialog-viewport-height': `${Math.round(viewport?.height ?? window.innerHeight)}px`
    }
  })
}

watch(
  () => dialogState.value.open,
  async (open) => {
    if (!open) return
    inputValue.value = dialogState.value.defaultValue
    updateDialogViewport()
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
)

onMounted(() => {
  window.addEventListener('resize', updateDialogViewport)
  window.visualViewport?.addEventListener('resize', updateDialogViewport)
  window.visualViewport?.addEventListener('scroll', updateDialogViewport)
  updateDialogViewport()
})
onUnmounted(() => {
  window.removeEventListener('resize', updateDialogViewport)
  window.visualViewport?.removeEventListener('resize', updateDialogViewport)
  window.visualViewport?.removeEventListener('scroll', updateDialogViewport)
  if (viewportUpdateFrame !== null) cancelAnimationFrame(viewportUpdateFrame)
})

function cancel() {
  resolveDialog(null)
}

function confirm() {
  if (isPrompt.value) {
    resolveDialog(inputValue.value.trim())
    return
  }
  resolveDialog(true)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="dialogState.open" class="dialog-backdrop" :style="dialogViewportStyle" @click.self="cancel">
        <form class="dialog" role="dialog" aria-modal="true" @submit.prevent="confirm">
          <header class="dialog-header">
            <h2 class="dialog-title">{{ dialogState.title }}</h2>
          </header>
          <p v-if="dialogState.message" class="dialog-message">{{ dialogState.message }}</p>
          <input
            v-if="isPrompt"
            ref="inputRef"
            v-model="inputValue"
            class="dialog-input"
            type="text"
            :placeholder="dialogState.placeholder"
          />
          <footer class="dialog-actions">
            <button v-if="isConfirm || isPrompt" class="dialog-button secondary" type="button" @click="cancel">
              {{ dialogState.cancelText }}
            </button>
            <button class="dialog-button primary" type="submit">{{ dialogState.confirmText }}</button>
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  top: var(--dialog-viewport-top, 0px);
  left: 0;
  right: 0;
  height: var(--dialog-viewport-height, 100dvh);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: var(--page-pad-y) var(--page-pad-x) var(--page-pad-bottom);
  background: rgba(5, 5, 8, 0.58);
}

.dialog {
  width: min(100%, 420px);
  max-height: calc(var(--dialog-viewport-height, 100dvh) - var(--page-pad-y) - var(--page-pad-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
  padding: 18px 18px 16px;
  border: var(--glass-dialog-border);
  border-radius: var(--radius-card);
  background: var(--dialog-bg);
  box-shadow: var(--glass-shadow);
}

.dialog-title {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 680;
  line-height: 1.3;
}

.dialog-message {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.dialog-input {
  width: 100%;
  min-height: 38px;
  font-size: 14px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--surface-selected) 90%, transparent);
  color: var(--text);
  outline: none;
}

.dialog-input:focus {
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.dialog-button {
  min-width: 72px;
  min-height: 38px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  padding: 0 14px;
  font-size: 13px;
  cursor: default;
}

.dialog-button.secondary {
  border-color: color-mix(in srgb, var(--border) 82%, transparent);
  background: color-mix(in srgb, var(--surface-selected) 88%, transparent);
  color: var(--text);
}

.dialog-button.primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-contrast);
}

.dialog-button:active {
  transform: translateY(0);
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.18s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
