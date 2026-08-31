<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toastMessage } = useToast()
</script>

<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div v-if="toastMessage" class="toast" role="status" aria-live="polite">
        {{ toastMessage }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  z-index: 1300;
  top: 50%;
  left: 50%;
  max-width: min(82vw, 360px);
  transform: translate(-50%, -50%);
  padding: 12px 16px;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface-strong) 94%, transparent);
  color: var(--text);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  font-size: 14px;
  font-weight: 680;
  line-height: 1.45;
  text-align: center;
  overflow-wrap: anywhere;
  pointer-events: none;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 6px));
}
</style>
