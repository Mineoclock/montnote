<script setup lang="ts">
import { Circle, CircleCheck } from '@lucide/vue'
import type { LocalSaveStatus, NoteListItem } from '@/api/types'

interface Props {
  item: NoteListItem
  active?: boolean
  selected?: boolean
  selecting?: boolean
  pressed?: boolean
  unsaved?: boolean
  localSaveStatus?: LocalSaveStatus | null
  timeText?: string
  showMeta?: boolean
}

withDefaults(defineProps<Props>(), {
  active: false,
  selected: false,
  selecting: false,
  pressed: false,
  unsaved: false,
  localSaveStatus: null,
  timeText: '',
  showMeta: true
})
</script>

<template>
  <article
    class="note-list-card"
    :class="{ active, selecting, selected, pressed, unsaved }"
  >
    <span
      v-if="selecting"
      class="note-select-badge"
      :class="{ checked: selected }"
      :aria-label="selected ? '已选' : '选择'"
    >
      <CircleCheck v-if="selected" :size="16" :stroke-width="2" aria-hidden="true" />
      <Circle v-else :size="16" :stroke-width="2" aria-hidden="true" />
    </span>
    <div v-if="localSaveStatus" class="local-save-badges card-save-badges">
      <span v-if="localSaveStatus === 'saving'" class="save-status-badge saving-badge">保存中</span>
      <template v-else-if="localSaveStatus === 'failed'">
        <span class="save-status-badge failed-badge">保存失败</span>
        <span class="unsaved-badge">草稿</span>
      </template>
      <span v-else class="unsaved-badge">草稿</span>
    </div>
    <div class="note-card-title">{{ item.title || '(无标题)' }}</div>
    <div class="note-card-summary">{{ item.summary }}</div>
    <div v-if="showMeta" class="card-meta">
      <span class="card-notebook">{{ item.notebookName }}</span>
      <span v-if="timeText" class="card-time">{{ timeText }}</span>
    </div>
  </article>
</template>

<style scoped>
.note-list-card {
  position: relative;
  width: 100%;
  display: block;
  background: var(--glass-bg);
  border-radius: var(--radius-card);
  padding: var(--space-2) var(--space-3);
  margin-bottom: 0;
  border: var(--glass-border);
  touch-action: manipulation;
  user-select: none;
  cursor: default;
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
}
.note-list-card.selected,
.note-list-card.active {
  border-color: var(--border-strong);
  background: var(--glass-bg-strong);
}
.note-list-card.pressed,
.note-list-card:active {
  border-color: var(--border-strong);
  background: var(--glass-bg-strong);
  transform: scale(0.985);
}
@media (prefers-color-scheme: light) {
  .note-list-card {
    border: 0;
    padding-block: calc(var(--space-2) + 1px);
  }
}
.note-select-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg-soft);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.note-select-badge.checked,
.selected .note-select-badge {
  border-color: var(--border-strong);
  background: var(--accent);
  color: var(--accent-contrast);
}
.note-card-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.note-list-card.unsaved {
  padding-top: 42px;
}
@media (prefers-color-scheme: light) {
  .note-list-card.unsaved {
    padding-top: 43px;
  }
}
.local-save-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}
.card-save-badges {
  position: absolute;
  top: 10px;
  right: 10px;
}
.note-list-card.selecting .card-save-badges {
  right: 44px;
}
.save-status-badge,
.unsaved-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
.saving-badge {
  background: var(--glass-bg-soft);
  color: var(--text-secondary);
}
.failed-badge {
  background: rgba(239, 68, 68, 0.16);
  color: #ef4444;
}
.unsaved-badge {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
}
.note-card-summary {
  margin-top: 8px;
  display: block;
  color: var(--text-secondary);
  font-size: 13px;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-meta {
  margin-top: 8px;
  margin-bottom: -4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.35;
  opacity: 0.7;
}
.card-notebook,
.card-time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-notebook {
  min-width: 0;
}
.card-time {
  flex: 0 0 auto;
  max-width: 46%;
}
</style>
