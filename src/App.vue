<script setup lang="ts">
import { useGlobalLoading } from '@/composables/useGlobalLoading'
import AppDialog from '@/components/AppDialog.vue'
import AppToast from '@/components/AppToast.vue'

const { isGlobalLoading } = useGlobalLoading()
</script>

<template>
  <Transition name="global-loading-fade">
    <div v-if="isGlobalLoading" class="global-loading" aria-label="正在加载">
      <span class="global-loading-bar"></span>
    </div>
  </Transition>
  <router-view />
  <AppToast />
  <AppDialog />
</template>

<style scoped>
.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  height: 3px;
  overflow: hidden;
  pointer-events: none;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.global-loading-bar {
  display: block;
  width: 42%;
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 78%, transparent);
  animation: global-loading-slide 1s ease-in-out infinite;
}

.global-loading-fade-enter-active,
.global-loading-fade-leave-active {
  transition: opacity 0.18s ease;
}

.global-loading-fade-enter-from,
.global-loading-fade-leave-to {
  opacity: 0;
}

@keyframes global-loading-slide {
  0% {
    transform: translateX(-110%);
  }
  55% {
    transform: translateX(80vw);
  }
  100% {
    transform: translateX(110vw);
  }
}
</style>
