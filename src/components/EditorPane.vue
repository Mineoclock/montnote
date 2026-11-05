<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import type { CSSProperties } from 'vue'
import {
  ArrowLeft,
  Bold,
  Code,
  CodeXml,
  Heading,
  Highlighter,
  Italic,
  ListOrdered,
  ListTodo,
  Palette,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  RotateCcw,
  Save,
  SeparatorHorizontal,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  Waves
} from '@lucide/vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Extension, Mark, markInputRule, mergeAttributes, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Code as TiptapCode } from '@tiptap/extension-code'
import { TextStyle, BackgroundColor, FontSize } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { useNoteStore } from '@/stores/note'
import { useNotesStore } from '@/stores/notes'
import { useNotebooksStore } from '@/stores/notebooks'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useDialog } from '@/composables/useDialog'
import { SearchHighlight, searchHighlightKey } from '@/editor/searchHighlight'

type TextColorOption = {
  label: string
  value: string
}

type SemanticHighlightKey = 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'orange' | 'red'

type HighlightColorOption = {
  key: SemanticHighlightKey
  label: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    semanticHighlight: {
      setSemanticHighlight: (key: SemanticHighlightKey) => ReturnType
      unsetSemanticHighlight: () => ReturnType
    }
  }
}

const TEXT_COLORS: TextColorOption[] = [
  { label: '红色', value: '#E03131' },
  { label: '橙色', value: '#F76707' },
  { label: '黄色', value: '#E6A700' },
  { label: '绿色', value: '#2B8A3E' },
  { label: '青色', value: '#0CA678' },
  { label: '蓝色', value: '#1971C2' },
  { label: '紫色', value: '#9C36B5' },
  { label: '灰色', value: '#868E96' }
]

const HIGHLIGHT_COLORS: HighlightColorOption[] = [
  { key: 'yellow', label: '黄色' },
  { key: 'green', label: '绿色' },
  { key: 'blue', label: '蓝色' },
  { key: 'purple', label: '紫色' },
  { key: 'pink', label: '粉色' },
  { key: 'orange', label: '橙色' },
  { key: 'red', label: '红色' }
]

const HIGHLIGHT_COLOR_VARS: Record<SemanticHighlightKey, string> = {
  yellow: '--semantic-highlight-yellow',
  green: '--semantic-highlight-green',
  blue: '--semantic-highlight-blue',
  purple: '--semantic-highlight-purple',
  pink: '--semantic-highlight-pink',
  orange: '--semantic-highlight-orange',
  red: '--semantic-highlight-red'
}

const note = useNoteStore()
const notes = useNotesStore()
const notebooks = useNotebooksStore()
const { isWide } = useBreakpoint()
const emit = defineEmits<{ close: [] }>()
const dialog = useDialog()

const FONT_SIZES = ['12px', '14px', '15px', '18px', '22px', '28px']
const toolPanel = shallowRef<'block' | 'text' | 'textColor' | 'highlightColor' | null>(null)
const notebookMenuOpen = shallowRef(false)
const mobileVisualViewportHeight = shallowRef(0)
const mobileVisualViewportOffsetTop = shallowRef(0)
const mobileVisualViewportInsetBottom = shallowRef(0)
const createdTime = computed(() => formatTime(note.createdAt))
const deletedTime = computed(() => formatTime(note.deletedAt))
const currentNotebookName = computed(() => notebooks.displayName(note.notebookId))
const canUndo = computed(() => editor.value?.can().undo() ?? false)
const canRedo = computed(() => editor.value?.can().redo() ?? false)
const editingDisabled = computed(() => note.isTrash || note.opening)
const currentTextColor = computed(() => {
  const color = editor.value?.getAttributes('textStyle').color
  return typeof color === 'string' && color ? color : null
})
const currentHighlightKey = computed<SemanticHighlightKey | null>(() => {
  const key = editor.value?.getAttributes('textStyle').highlightKey
  return isHighlightColorKey(key) ? key : null
})
const mobileEditorTailSpace = computed(() => {
  const visualHeight = mobileVisualViewportHeight.value
  if (visualHeight <= 0) return '42vh'
  return `${Math.min(Math.max(Math.round(visualHeight * 0.38), 144), 320)}px`
})
const editorViewportStyle = computed<CSSProperties | undefined>(() => {
  if (isWide.value) return undefined
  return {
    '--editor-visual-height': mobileVisualViewportHeight.value > 0 ? `${mobileVisualViewportHeight.value}px` : '100%',
    '--editor-visual-offset-top': `${mobileVisualViewportOffsetTop.value}px`,
    '--editor-visual-inset-bottom': `${mobileVisualViewportInsetBottom.value}px`,
    '--editor-tail-space': mobileEditorTailSpace.value
  } as CSSProperties
})
let applyingExternal = false
let viewportUpdateFrame: number | null = null
let editorMouseDown: { x: number, y: number, startedInProse: boolean } | null = null

function formatTime(ts: number | null) {
  if (!ts) return '未保存'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(ts)
}

function plainTextToParagraphs(text: string): JSONContent[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    if (!line) return { type: 'paragraph' }
    return {
      type: 'paragraph',
      content: [{ type: 'text', text: line }]
    }
  })
}

function isHighlightColorKey(value: unknown): value is SemanticHighlightKey {
  return typeof value === 'string' && value in HIGHLIGHT_COLOR_VARS
}

function highlightColorVar(key: SemanticHighlightKey) {
  return `var(${HIGHLIGHT_COLOR_VARS[key]})`
}

const UnderlineStyle = Mark.create({
  name: 'underlineStyle',
  parseHTML() {
    return [
      { tag: 'u' },
      {
        style: 'text-decoration-line',
        getAttrs: (value) => String(value).includes('underline') && null
      },
      {
        style: 'text-decoration',
        getAttrs: (value) => String(value).includes('underline') && null
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { style: 'text-decoration-line: underline;' }), 0]
  }
})

const WavyUnderline = Mark.create({
  name: 'wavyUnderline',
  parseHTML() {
    return [
      {
        style: 'text-decoration-style',
        getAttrs: (value) => String(value).includes('wavy') && null
      },
      {
        style: 'text-decoration',
        getAttrs: (value) => String(value).includes('wavy') && null
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        style: 'text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 1px; text-underline-offset: 3px;'
      }),
      0
    ]
  }
})

// Tiptap v3 行内 code 的输入规则正则为 /(^|[^`])`([^`]+)`(?!`)$/，前导守卫是捕获组，
// markInputRule 会把守卫字符连同开头反引号一起删掉，导致反引号前的字符“消失”。
// 改用 lookbehind 守卫，守卫不进入匹配字符串，字符得以保留。
const InlineCode = TiptapCode.extend({
  addInputRules() {
    return [markInputRule({ find: /(?<=^|[^`])`([^`]+)`(?!`)$/, type: this.type })]
  }
})

const SemanticHighlight = Extension.create({
  name: 'semanticHighlight',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          highlightKey: {
            default: null,
            parseHTML: (element) => {
              const key = element.getAttribute('data-highlight-key')
              return isHighlightColorKey(key) ? key : null
            },
            renderHTML: (attributes) => {
              if (!isHighlightColorKey(attributes.highlightKey)) return {}
              return {
                'data-highlight-key': attributes.highlightKey,
                style: `background-color: ${highlightColorVar(attributes.highlightKey)}`
              }
            }
          }
        }
      }
    ]
  },
  addCommands() {
    return {
      setSemanticHighlight:
        (key) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { highlightKey: key }).run()
        },
      unsetSemanticHighlight:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { highlightKey: null }).removeEmptyTextStyle().run()
        }
    }
  }
})

const editor = useEditor({
  content: note.content,
  coreExtensionOptions: {
    clipboardTextSerializer: {
      blockSeparator: '\n'
    }
  },
  extensions: [
    StarterKit.configure({ link: false, code: false }),
    InlineCode,
    TextStyle,
    FontSize,
    Color,
    BackgroundColor,
    SemanticHighlight,
    UnderlineStyle,
    WavyUnderline,
    TaskList,
    TaskItem.configure({ nested: true }),
    SearchHighlight
  ],
  editorProps: {
    attributes: {
      class: 'mn-prose',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off'
    },
    handlePaste(view, event) {
      const text = event.clipboardData?.getData('text/plain') || ''
      if (!text) return false
      const v = editor.value
      if (!v) return false
      event.preventDefault()
      const normalizedText = text.replace(/\r\n?/g, '\n')
      // 代码块内按纯文本插入（换行作为文本保留在块内）；
      // 否则多行文本会被转成段落块节点，而 codeBlock 只允许文本，块节点会被挤到代码块外面
      if (v.isActive('codeBlock') || !normalizedText.includes('\n')) {
        view.dispatch(view.state.tr.insertText(normalizedText))
        return true
      }
      v.commands.insertContent(plainTextToParagraphs(normalizedText))
      return true
    }
  },
  onCreate: () => {
    // 切换只读状态不是正文修改，避免触发 onUpdate 和自动保存。
    editor.value?.setEditable(!note.isTrash, false)
    applyHighlight()
    requestAnimationFrame(() => {
      if (note.isLocalNew()) {
        editor.value?.commands.focus('end')
      }
    })
  },
  onUpdate: ({ editor }) => {
    if (applyingExternal || note.opening) return
    note.setBody(editor.getJSON(), editor.getText())
  }
})

function applyHighlight() {
  const v = editor.value
  if (v) v.view.dispatch(v.state.tr.setMeta(searchHighlightKey, { term: notes.query }))
}

// 外部载入新笔记 → 同步编辑器内容（不触发 onUpdate / dirty）
watch(
  () => note.loadSeq,
  () => {
    const v = editor.value
    if (!v) return
    toolPanel.value = null
    applyingExternal = true
    v
      .chain()
      .setContent(note.content, { emitUpdate: false })
      .command(({ tr }) => {
        tr.setMeta('addToHistory', false)
        return true
      })
      .run()
    requestAnimationFrame(() => {
      applyingExternal = false
      if (note.isLocalNew()) {
        v.commands.focus('end')
      }
    })
    applyHighlight()
  }
)
watch(() => notes.query, applyHighlight)
watch(() => note.isTrash, (isTrash) => {
  editor.value?.setEditable(!isTrash, false)
  if (isTrash) {
    toolPanel.value = null
    notebookMenuOpen.value = false
  }
})
watch(() => note.autoSaveError, async (message) => {
  if (!message) return
  note.autoSaveError = ''
  await dialog.alert({ title: message })
})

function onKeydown(e: KeyboardEvent) {
  if (note.isTrash) return
  if (!isWide.value || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
  e.preventDefault()
  save()
}

function updateEditorViewport() {
  if (viewportUpdateFrame !== null) cancelAnimationFrame(viewportUpdateFrame)
  viewportUpdateFrame = requestAnimationFrame(() => {
    viewportUpdateFrame = null
    const viewport = window.visualViewport
    mobileVisualViewportHeight.value = Math.round(viewport?.height ?? window.innerHeight)
    mobileVisualViewportOffsetTop.value = Math.max(0, Math.round(viewport?.offsetTop ?? 0))
    const viewportBottom = Math.round((viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight))
    mobileVisualViewportInsetBottom.value = Math.max(0, window.innerHeight - viewportBottom)
  })
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateEditorViewport)
  window.visualViewport?.addEventListener('resize', updateEditorViewport)
  window.visualViewport?.addEventListener('scroll', updateEditorViewport)
  updateEditorViewport()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateEditorViewport)
  window.visualViewport?.removeEventListener('resize', updateEditorViewport)
  window.visualViewport?.removeEventListener('scroll', updateEditorViewport)
  if (viewportUpdateFrame !== null) cancelAnimationFrame(viewportUpdateFrame)
})
watch(isWide, updateEditorViewport)

function toggleBold() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleBold().run()
}
function toggleItalic() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleItalic().run()
}
function toggleUnderline() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleMark('underlineStyle').run()
}
function toggleWavyUnderline() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleMark('wavyUnderline').run()
}
function toggleStrike() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleStrike().run()
}
function toggleInlineCode() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleCode().run()
}
function setTextColor(color: string) {
  if (note.isTrash) return
  editor.value?.chain().focus().setColor(color).run()
  toolPanel.value = null
}
function unsetTextColor() {
  if (note.isTrash) return
  editor.value?.chain().focus().unsetColor().run()
  toolPanel.value = null
}
function setHighlightColor(key: SemanticHighlightKey) {
  if (note.isTrash) return
  editor.value?.chain().focus().setSemanticHighlight(key).run()
  toolPanel.value = null
}
function unsetHighlightColor() {
  if (note.isTrash) return
  editor.value?.chain().focus().unsetSemanticHighlight().run()
  toolPanel.value = null
}
function clearFormatting() {
  if (note.isTrash) return
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run()
  toolPanel.value = null
}
function toggleOrdered() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleOrderedList().run()
  toolPanel.value = null
}
function toggleTodo() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleTaskList().run()
  toolPanel.value = null
}
function replaceMultiBlockSelectionWithCodeBlock() {
  const v = editor.value
  if (!v) return false
  const { state } = v
  const { selection } = state
  if (selection.empty || selection.$from.sameParent(selection.$to) || v.isActive('codeBlock')) return false

  const codeBlock = state.schema.nodes.codeBlock
  if (!codeBlock) return false
  const selectedText = state.doc.textBetween(selection.from, selection.to, '\n', '\n')
  const textNode = selectedText ? state.schema.text(selectedText) : null
  const node = codeBlock.create(null, textNode ? [textNode] : null)
  v.view.dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView())
  v.commands.focus()
  return true
}
function toggleCodeBlock() {
  if (note.isTrash) return
  if (replaceMultiBlockSelectionWithCodeBlock()) {
    toolPanel.value = null
    return
  }
  editor.value?.chain().focus().toggleCodeBlock().run()
  toolPanel.value = null
}
function toggleBlockquote() {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleBlockquote().run()
  toolPanel.value = null
}
function setParagraph() {
  if (note.isTrash) return
  editor.value?.chain().focus().setParagraph().run()
  toolPanel.value = null
}
function toggleHeading(level: 1 | 2 | 3) {
  if (note.isTrash) return
  editor.value?.chain().focus().toggleHeading({ level }).run()
  toolPanel.value = null
}
function setFontSize(size: string) {
  if (note.isTrash) return
  const chain = editor.value?.chain().focus()
  if (!chain) return
  if (size === '15px') chain.unsetFontSize().run()
  else chain.setFontSize(size).run()
}
function insertHorizontalRule() {
  if (note.isTrash) return
  editor.value?.chain().focus().setHorizontalRule().run()
  toolPanel.value = null
}
function undo() {
  if (!canUndo.value) return
  editor.value?.chain().focus().undo().run()
  toolPanel.value = null
}
function redo() {
  if (!canRedo.value) return
  editor.value?.chain().focus().redo().run()
  toolPanel.value = null
}
function toggleToolPanel(type: 'block' | 'text' | 'textColor' | 'highlightColor') {
  if (note.isTrash) return
  toolPanel.value = toolPanel.value === type ? null : type
  notebookMenuOpen.value = false
}
function isFontSizeActive(size: string) {
  if (size === '15px') return !editor.value?.getAttributes('textStyle').fontSize
  return editor.value?.isActive('textStyle', { fontSize: size }) ?? false
}

function saveErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '保存失败，请重试'
}

async function save() {
  try {
    toolPanel.value = null
    await note.flushAutoSave()
    if (!isWide.value) emit('close') // 手机端保存成功后回到列表，大屏列表常驻
  } catch (error) {
    await dialog.alert({ title: saveErrorMessage(error) })
  }
}

async function restoreTrashNote() {
  try {
    toolPanel.value = null
    notebookMenuOpen.value = false
    await note.restoreFromTrash()
  } catch (e) {
    await dialog.alert({ title: e instanceof Error ? e.message : '恢复失败' })
  }
}

async function deleteTrashNote() {
  const ok = await dialog.confirm({
    title: '永久删除笔记',
    message: '永久删除这条笔记？删除后不可恢复。',
    confirmText: '删除'
  })
  if (!ok) return
  try {
    toolPanel.value = null
    notebookMenuOpen.value = false
    await note.purgeFromTrash()
    if (!isWide.value) emit('close')
  } catch (e) {
    await dialog.alert({ title: e instanceof Error ? e.message : '删除失败' })
  }
}

function toggleNotebookMenu() {
  if (note.isTrash) return
  if (note.saving || note.opening) return
  toolPanel.value = null
  notebookMenuOpen.value = !notebookMenuOpen.value
}

async function changeNotebook(notebookId: string) {
  if (!notebookId || notebookId === note.notebookId) return
  try {
    notebookMenuOpen.value = false
    if (note.isLocalNew()) {
      note.setUnsavedNotebook(notebookId)
      return
    }
    note.setNotebook(notebookId)
    await note.flushAutoSave()
    await notes.refresh()
  } catch {
    await dialog.alert({ title: '保存失败，请重试' })
  }
}

function rememberEditorMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const target = e.target
  editorMouseDown = {
    x: e.clientX,
    y: e.clientY,
    startedInProse: target instanceof Element && Boolean(target.closest('.mn-prose'))
  }
}

function wasEditorTextDrag(e: MouseEvent) {
  const start = editorMouseDown
  editorMouseDown = null
  if (!start?.startedInProse) return false
  return Math.abs(e.clientX - start.x) > 3 || Math.abs(e.clientY - start.y) > 3
}

function focusEditorArea(e: MouseEvent) {
  const isTextDrag = wasEditorTextDrag(e)
  toolPanel.value = null
  notebookMenuOpen.value = false
  if (note.isTrash) return
  const target = e.target
  if (target instanceof Element && target.closest('.mn-prose')) return
  if (isTextDrag) return
  editor.value?.chain().focus('end').run()
}
</script>

<template>
  <section class="editor" :class="{ wide: isWide }" :style="editorViewportStyle">
    <div class="editor-top-overlay">
      <header v-if="!isWide" class="mobile-top-bar">
        <button class="link icon-button" type="button" title="返回" aria-label="返回" @click="emit('close')">
          <ArrowLeft :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <div class="mobile-note-meta" aria-label="笔记状态">
          <span class="status-item mobile-status-item">{{ note.isTrash ? `创建于 ${createdTime}` : `创建时间 ${createdTime}` }}</span>
          <span v-if="note.isTrash" class="status-item mobile-status-item trash-status">已删除 {{ deletedTime }}</span>
          <span v-else class="status-item notebook-status mobile-status-item">
            保存到
            <span class="notebook-menu-wrap">
              <button
                class="notebook-select-button"
                type="button"
                :disabled="note.saving || note.opening"
                :aria-expanded="notebookMenuOpen"
                @click="toggleNotebookMenu"
              >
                {{ currentNotebookName }}
              </button>
              <div v-if="notebookMenuOpen" class="notebook-menu" role="listbox">
                <button
                  v-for="nb in notebooks.notebooks"
                  :key="nb.id"
                  class="notebook-menu-item"
                  type="button"
                  :class="{ active: nb.id === note.notebookId }"
                  role="option"
                  :aria-selected="nb.id === note.notebookId"
                  @click="changeNotebook(nb.id)"
                >
                  {{ nb.name }}
                </button>
              </div>
            </span>
          </span>
        </div>
      </header>
    </div>
    <div class="toolbar-overlay" :class="{ mobile: !isWide, trash: note.isTrash }">
      <template v-if="!isWide && note.isTrash">
        <div class="trash-actions mobile-trash-actions">
          <button class="link icon-button" type="button" title="恢复" aria-label="恢复" :disabled="note.opening" @click="restoreTrashNote">
            <RotateCcw :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
          <button class="link icon-button" type="button" title="永久删除" aria-label="永久删除" :disabled="note.opening" @click="deleteTrashNote">
            <Trash2 :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </template>
      <template v-else>
        <div class="tools-shell">
          <div class="tools">
            <button title="清除格式" aria-label="清除格式" :disabled="editingDisabled" @mousedown.prevent @click="clearFormatting">
              <RemoveFormatting :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <span class="tool-divider" aria-hidden="true"></span>
            <button
              title="标题与段落"
              aria-label="标题与段落"
              :aria-expanded="toolPanel === 'block'"
              :class="{ on: editor?.isActive('heading') || editor?.isActive('codeBlock') || editor?.isActive('blockquote') }"
              :disabled="editingDisabled"
              @mousedown.prevent
              @click="toggleToolPanel('block')"
            >
              <Heading :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <button
              title="字体样式"
              aria-label="字体样式"
              :aria-expanded="toolPanel === 'text'"
              :class="{ on: toolPanel === 'text' || editor?.isActive('bold') || editor?.isActive('italic') || editor?.isActive('underlineStyle') || editor?.isActive('wavyUnderline') || editor?.isActive('strike') || editor?.isActive('code') || Boolean(editor?.getAttributes('textStyle').fontSize) }"
              :disabled="editingDisabled"
              @mousedown.prevent
              @click="toggleToolPanel('text')"
            >
              <Type :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <button
              title="文字颜色"
              aria-label="文字颜色"
              :aria-expanded="toolPanel === 'textColor'"
              :class="{ on: toolPanel === 'textColor' || Boolean(currentTextColor) }"
              :disabled="editingDisabled"
              @mousedown.prevent
              @click="toggleToolPanel('textColor')"
            >
              <Palette :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <button
              title="高亮色"
              aria-label="高亮色"
              :aria-expanded="toolPanel === 'highlightColor'"
              :class="{ on: toolPanel === 'highlightColor' || Boolean(currentHighlightKey) }"
              :disabled="editingDisabled"
              @mousedown.prevent
              @click="toggleToolPanel('highlightColor')"
            >
              <Highlighter :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <button title="插入分割线" aria-label="插入分割线" :disabled="editingDisabled" @mousedown.prevent @click="insertHorizontalRule">
              <SeparatorHorizontal :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <button title="编号列表" aria-label="编号列表" :class="{ on: editor?.isActive('orderedList') }" :disabled="editingDisabled" @mousedown.prevent @click="toggleOrdered">
              <ListOrdered :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <button title="待办列表" aria-label="待办列表" :class="{ on: editor?.isActive('taskList') }" :disabled="editingDisabled" @mousedown.prevent @click="toggleTodo">
              <ListTodo :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <span class="tool-divider" aria-hidden="true"></span>
            <button title="撤销" aria-label="撤销" :disabled="!canUndo" @mousedown.prevent @click="undo">
              <Undo2 :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <button title="重做" aria-label="重做" :disabled="!canRedo" @mousedown.prevent @click="redo">
              <Redo2 :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div v-if="isWide && note.isTrash" class="trash-actions">
          <button class="link icon-button" type="button" title="恢复" aria-label="恢复" :disabled="note.opening" @click="restoreTrashNote">
            <RotateCcw :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
          <button class="link icon-button" type="button" title="永久删除" aria-label="永久删除" :disabled="note.opening" @click="deleteTrashNote">
            <Trash2 :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
        <button v-else-if="isWide" class="link save icon-button" type="button" title="保存" aria-label="保存" :disabled="note.saving || !note.dirty" @click="save">
          <Save :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </template>
    </div>
    <div v-if="toolPanel === 'block'" class="tool-popover block-popover" role="menu" aria-label="标题与段落">
      <button type="button" title="普通段落" aria-label="普通段落" :class="{ on: editor?.isActive('paragraph') }" @mousedown.prevent @click="setParagraph">
        <Pilcrow :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button type="button" :class="{ on: editor?.isActive('heading', { level: 1 }) }" @mousedown.prevent @click="toggleHeading(1)">H1</button>
      <button type="button" :class="{ on: editor?.isActive('heading', { level: 2 }) }" @mousedown.prevent @click="toggleHeading(2)">H2</button>
      <button type="button" :class="{ on: editor?.isActive('heading', { level: 3 }) }" @mousedown.prevent @click="toggleHeading(3)">H3</button>
      <button type="button" title="代码块" aria-label="代码块" :class="{ on: editor?.isActive('codeBlock') }" @mousedown.prevent @click="toggleCodeBlock">
        <CodeXml :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button type="button" title="引用" aria-label="引用" :class="{ on: editor?.isActive('blockquote') }" @mousedown.prevent @click="toggleBlockquote">
        <Quote :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>
    <div v-else-if="toolPanel === 'text'" class="tool-popover text-popover" role="menu" aria-label="字体样式">
      <div class="font-size-group" aria-label="字体大小">
        <button
          v-for="size in FONT_SIZES"
          :key="size"
          type="button"
          :class="{ on: isFontSizeActive(size) }"
          @mousedown.prevent
          @click="setFontSize(size)"
        >
          {{ size.replace('px', '') }}
        </button>
      </div>
      <span class="popover-divider" aria-hidden="true"></span>
      <div class="font-mark-group">
        <button type="button" title="加粗" aria-label="加粗" :class="{ on: editor?.isActive('bold') }" @mousedown.prevent @click="toggleBold">
          <Bold :size="17" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <button type="button" title="斜体" aria-label="斜体" :class="{ on: editor?.isActive('italic') }" @mousedown.prevent @click="toggleItalic">
          <Italic :size="17" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <button type="button" title="下划线" aria-label="下划线" :class="{ on: editor?.isActive('underlineStyle') }" @mousedown.prevent @click="toggleUnderline">
          <Underline :size="17" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <button type="button" title="波浪线" aria-label="波浪线" :class="{ on: editor?.isActive('wavyUnderline') }" @mousedown.prevent @click="toggleWavyUnderline">
          <Waves :size="17" :stroke-width="2" aria-hidden="true" />
        </button>
        <button type="button" title="中划线" aria-label="中划线" :class="{ on: editor?.isActive('strike') }" @mousedown.prevent @click="toggleStrike">
          <Strikethrough :size="17" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <button type="button" title="行内代码" aria-label="行内代码" :class="{ on: editor?.isActive('code') }" @mousedown.prevent @click="toggleInlineCode">
          <Code :size="17" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div v-else-if="toolPanel === 'textColor'" class="tool-popover color-popover" role="menu" aria-label="文字颜色">
      <button type="button" :class="{ on: !currentTextColor }" @mousedown.prevent @click="unsetTextColor">默认</button>
      <button
        v-for="option in TEXT_COLORS"
        :key="option.value"
        type="button"
        :title="option.label"
        :aria-label="option.label"
        :class="{ on: currentTextColor === option.value }"
        @mousedown.prevent
        @click="setTextColor(option.value)"
      >
        <span class="color-chip" :style="{ backgroundColor: option.value }" aria-hidden="true"></span>
      </button>
    </div>
    <div v-else-if="toolPanel === 'highlightColor'" class="tool-popover color-popover" role="menu" aria-label="高亮色">
      <button type="button" :class="{ on: !currentHighlightKey }" @mousedown.prevent @click="unsetHighlightColor">无</button>
      <button
        v-for="option in HIGHLIGHT_COLORS"
        :key="option.key"
        type="button"
        :title="option.label"
        :aria-label="option.label"
        :class="{ on: currentHighlightKey === option.key }"
        @mousedown.prevent
        @click="setHighlightColor(option.key)"
      >
        <span class="color-chip semantic" :style="{ backgroundColor: highlightColorVar(option.key) }" aria-hidden="true"></span>
      </button>
    </div>
    <div class="content-wrap" @mousedown="rememberEditorMouseDown" @click="focusEditorArea">
      <EditorContent class="content" :class="{ loading: note.opening }" :editor="editor" />
      <div v-if="note.opening" class="loading-mask">加载中...</div>
    </div>
    <div v-if="isWide" class="editor-bottom-overlay">
      <footer class="status-bar" aria-label="笔记状态">
        <span class="status-item">{{ `创建时间 ${createdTime}` }}</span>
        <span v-if="note.isTrash" class="status-item trash-status">已删除 {{ deletedTime }}</span>
        <span v-else class="status-item notebook-status">
          保存到
          <span class="notebook-menu-wrap">
            <button
              class="notebook-select-button"
              type="button"
              :disabled="note.saving || note.opening"
              :aria-expanded="notebookMenuOpen"
              @click="toggleNotebookMenu"
            >
              {{ currentNotebookName }}
            </button>
            <div v-if="notebookMenuOpen" class="notebook-menu" role="listbox">
              <button
                v-for="nb in notebooks.notebooks"
                :key="nb.id"
                class="notebook-menu-item"
                type="button"
                :class="{ active: nb.id === note.notebookId }"
                role="option"
                :aria-selected="nb.id === note.notebookId"
                @click="changeNotebook(nb.id)"
              >
                {{ nb.name }}
              </button>
            </div>
          </span>
        </span>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.editor {
  --editor-top-overlay-height: calc(var(--page-pad-y) + 56px);
  --editor-bottom-overlay-height: calc(52px + 18px + env(safe-area-inset-bottom, 0px));
  --editor-tail-space: 60vh;
  --editor-visual-height: 100%;
  --editor-visual-offset-top: 0px;
  --editor-visual-inset-bottom: 0px;
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 0;
  overflow: hidden;
  background: transparent;
}
.editor-top-overlay,
.editor-bottom-overlay,
.toolbar-overlay {
  position: absolute;
  z-index: 5;
  right: 0;
  left: 0;
  pointer-events: none;
}
.editor-top-overlay {
  top: 0;
  height: var(--editor-top-overlay-height);
  padding: var(--page-pad-y) var(--page-pad-x) 0;
  background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 20%, transparent 100%);
}
.editor-bottom-overlay {
  bottom: 0;
  height: var(--editor-bottom-overlay-height);
  display: flex;
  align-items: flex-end;
  padding: 0 var(--page-pad-x) calc(10px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to bottom, transparent 0%, var(--bg) 80%, var(--bg) 100%);
}
.toolbar-overlay {
  top: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--page-pad-y) var(--page-pad-x) 0;
  background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 20%, transparent 100%);
}
.editor-top-overlay > *,
.editor-bottom-overlay > *,
.toolbar-overlay > * {
  pointer-events: auto;
}
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
  min-height: 42px;
  flex-wrap: nowrap;
  overflow: visible;
}
.mobile-top-bar {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
.mobile-note-meta {
  min-width: 0;
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-top: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}
.mobile-status-item {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  max-width: 100%;
}
.tools-shell {
  position: relative;
  flex: 1;
  min-width: 0;
}

.tools-shell::before,
.tools-shell::after {
  content: "";
  position: absolute;
  top: 1px;
  bottom: 1px;
  z-index: 2;
  width: 22px;
  pointer-events: none;
}

.tools-shell::before {
  left: 1px;
  border-radius: var(--radius-pill) 0 0 var(--radius-pill);
  background: linear-gradient(90deg, var(--tool-fade-bg), transparent);
}

.tools-shell::after {
  right: 1px;
  border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
  background: linear-gradient(270deg, var(--tool-fade-bg), transparent);
}

.tools {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
  min-width: 0;
  min-height: 42px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 5px 18px;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
  scrollbar-width: none;
}
.tools::-webkit-scrollbar {
  display: none;
}
.tools button {
  flex: 0 0 auto;
  min-width: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: var(--radius-control-sm);
  background: transparent;
  padding: 0 8px;
  font-size: 12px;
  white-space: nowrap;
  cursor: default;
}
.tools button.on {
  border-color: var(--border-strong);
  background: var(--glass-bg-strong);
  box-shadow: var(--glass-highlight);
}
.tools button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.toolbar-overlay.mobile .tools-shell {
  width: 100%;
}
.tool-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 6px;
  flex: 0 0 auto;
}
.toolbar-overlay.mobile .tools {
  width: 100%;
  border: var(--glass-fab-border);
  background: var(--glass-fab);
}
.editor.wide .tools {
  width: max-content;
  max-width: 100%;
  border: var(--glass-border);
  background: var(--glass-bg-soft);
}

.editor.wide .tools-shell {
  flex: 0 1 auto;
}
.editor.wide .save {
  margin-left: auto;
  min-width: 42px;
  width: 42px;
  min-height: 42px;
  height: 42px;
  border-radius: var(--radius-pill);
  padding: 0;
  font-size: 12px;
  white-space: nowrap;
}
.link {
  flex: 0 0 auto;
  height: 42px;
  min-height: 42px;
  border: var(--glass-border);
  border-radius: var(--radius-pill);
  background: var(--glass-bg-soft);
  color: var(--text);
  cursor: default;
  font-size: 15px;
  padding: 6px 14px;
  box-shadow: var(--glass-highlight);
}
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.link.icon-button {
  width: 42px;
  padding: 0;
}

.save {
  height: 42px;
  padding: 0 18px;
}
.trash-actions {
  display: inline-flex;
  gap: var(--space-2);
  margin-left: auto;
}
.mobile-trash-actions {
  width: 100%;
  justify-content: flex-end;
}
.link:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.tool-popover {
  position: absolute;
  top: calc(var(--page-pad-y) + 48px);
  left: 80px;
  width: max-content;
  max-width: calc(100% - 96px);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 8px;
  border: var(--glass-fab-border);
  border-radius: var(--radius-card);
  background: var(--glass-fab);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  scrollbar-width: none;
}
.tool-popover::-webkit-scrollbar {
  display: none;
}
.tool-popover button {
  flex: 0 0 auto;
  min-width: 32px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-control-sm);
  background: transparent;
  color: var(--text);
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  cursor: default;
}
.tool-popover button.on {
  border-color: var(--border-strong);
  background: var(--glass-bg-strong);
  box-shadow: var(--glass-highlight);
}
.block-popover {
  gap: 4px;
}
.block-popover button {
  padding-inline: 7px;
}
.text-popover {
  flex-direction: column;
  align-items: stretch;
}
.font-size-group,
.font-mark-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
.font-size-group button {
  min-width: 34px;
  padding-inline: 7px;
}
.font-mark-group button {
  width: 32px;
  padding: 0;
}
.color-popover {
  gap: 6px;
}
.color-popover button {
  min-width: 36px;
  padding-inline: 8px;
}
.tool-swatch,
.color-chip {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
}
.color-chip.semantic {
  border-radius: 3px;
}
.popover-divider {
  width: 1px;
  height: 22px;
  flex: 0 0 auto;
  margin: 0 2px;
  background: var(--border);
}
.text-popover .popover-divider {
  width: 100%;
  height: 1px;
  margin: 0;
}
.content {
  flex: 1;
  height: 100%;
  overflow: auto;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: var(--editor-top-overlay-height) var(--space-3) calc(var(--editor-bottom-overlay-height) + var(--space-1));
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.content-wrap {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 0;
}
.status-bar {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: 0;
  overflow: visible;
  background: transparent;
  color: var(--text-secondary);
  padding: 0 8px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  scrollbar-width: none;
}
.status-bar::-webkit-scrollbar {
  display: none;
}
.status-item {
  position: relative;
  min-width: 0;
  max-width: none;
  white-space: nowrap;
}
.notebook-status {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 1 auto;
  gap: 4px;
  white-space: nowrap;
}
.trash-status {
  margin-left: auto;
}

.notebook-menu-wrap {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

.notebook-select-button {
  max-width: min(220px, 48vw);
  min-height: 26px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  padding: 2px 0;
  font-size: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  box-shadow: none;
}

.notebook-select-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.notebook-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 5;
  width: max-content;
  min-width: 160px;
  max-width: min(260px, calc(100vw - var(--page-pad-x) * 2));
  max-height: 240px;
  overflow: auto;
  padding: 6px;
  border: var(--glass-fab-border);
  border-radius: var(--radius-card);
  background: var(--glass-fab);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
}

.notebook-menu-item {
  width: 100%;
  min-height: 34px;
  display: block;
  border: 1px solid transparent;
  border-radius: var(--radius-control-sm);
  background: transparent;
  color: var(--text);
  padding: 6px 10px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

.notebook-menu-item.active {
  border-color: var(--border-strong);
  background: var(--glass-bg-strong);
}
.content.loading {
  opacity: 0.35;
  pointer-events: none;
}
.loading-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-card);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: transparent;
}
.content :deep(.mn-prose) {
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1.6;
  outline: none;
  min-height: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding-bottom: var(--editor-tail-space);
}
.content :deep(.mn-prose p) {
  margin: 0;
}
.content :deep(.mn-prose h1),
.content :deep(.mn-prose h2),
.content :deep(.mn-prose h3) {
  margin: 0;
}
.content :deep(.mn-prose h1) {
  font-size: 20px;
  line-height: 36px;
}
.content :deep(.mn-prose h2) {
  font-size: 18px;
  line-height: 34px;
}
.content :deep(.mn-prose h3) {
  font-size: 16px;
  line-height: 32px;
}
.content :deep(.mn-prose hr) {
  margin: 1.2em 0;
  border: 0;
  border-top: 1px solid var(--border-strong);
}
.content :deep(.mn-prose blockquote) {
  margin: 0.7em 0;
  padding: 0.15em 0 0.15em 0.9em;
  border-left: 4px solid rgba(255, 255, 255, 0.55);
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}
.content :deep(.mn-prose blockquote p) {
  margin-bottom: 0;
}
.content :deep(.mn-prose pre) {
  margin: 0.6em 0;
  padding: 12px 14px;
  overflow-x: auto;
  border: var(--glass-border);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
  color: var(--text);
}
.content :deep(.mn-prose pre code) {
  display: block;
  padding: 0;
  background: transparent;
  color: inherit;
}
.content :deep(.mn-prose code) {
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}
.content :deep(.mn-prose span[data-highlight-key]) {
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.content :deep(.search-hl) {
  background: var(--highlight);
  border-radius: 3px;
}
.content :deep(ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0;
  margin-block-start: .4em;
  margin-block-end: .4em;
}
.content :deep(ul[data-type='taskList'] li) {
  display: flex;
  gap: 8px;
}
.content :deep(ul[data-type='taskList'] li > label) {
  flex: 0 0 auto;
}
.content :deep(ul[data-type='taskList'] li > div) {
  flex: 1 1 auto;
  min-width: 0;
}
.content :deep(ul[data-type='taskList'] li[data-checked='true'] > div > p) {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  text-decoration-color: currentColor;
}
.content :deep(ul[data-type='taskList'] li > div > p:only-child:empty::before) {
  content: '\00a0';
}

@media (max-width: 1023px) {
  .editor {
    --editor-top-overlay-height: calc(var(--page-pad-y) + 64px);
    height: var(--editor-visual-height);
    min-height: var(--editor-visual-height);
  }

  .editor-top-overlay {
    position: fixed;
    top: var(--editor-visual-offset-top);
  }

  .toolbar-overlay {
    position: fixed;
    top: auto;
    bottom: calc(var(--editor-visual-inset-bottom) + env(safe-area-inset-bottom, 0px) + 15px);
    align-items: flex-end;
    padding: 0 var(--page-pad-x);
    background: none;
  }

  .tool-popover {
    position: fixed;
    top: auto;
    left: var(--page-pad-x);
    right: var(--page-pad-x);
    bottom: calc(var(--editor-visual-inset-bottom) + env(safe-area-inset-bottom, 0px) + 60px);
    width: auto;
    max-width: none;
  }

  .mobile-top-bar {
    min-height: 42px;
  }

  .mobile-note-meta {
    max-width: calc(100% - 120px);
  }

  .mobile-status-item .notebook-menu-wrap {
    justify-content: flex-end;
  }

  .mobile-status-item.notebook-status {
    flex-wrap: wrap;
  }

  .notebook-menu {
    top: calc(100% + 8px);
    bottom: auto;
  }

  .notebook-select-button {
    max-width: min(200px, 46vw);
  }

  .trash-actions {
    margin-left: 0;
  }

  .mobile-trash-actions .link.icon-button {
    width: 42px;
  }

  .tool-popover {
    max-width: calc(100vw - var(--page-pad-x) * 2);
  }
}

@media (min-width: 1024px) {
  .editor {
    --editor-top-overlay-height: 84px;
    --editor-bottom-overlay-height: calc(56px);
    padding: 0;
    border: var(--glass-border);
    border-radius: calc(var(--radius-card) + 2px);
    background: var(--glass-bg-soft);
    box-shadow: var(--glass-shadow-soft), var(--glass-highlight);
  }

  .editor-top-overlay {
    display: none;
  }

  .editor-bottom-overlay {
    padding: 0 var(--space-4) 10px;
    background: linear-gradient(to bottom, transparent 0%, var(--bg-soft) 80%, var(--bg-soft) 100%);
  }

  .toolbar-overlay {
    padding: var(--space-3) var(--space-4) 0;
    background: linear-gradient(to bottom, var(--bg-soft) 0%, var(--bg-soft) 20%, transparent 100%);
  }

  .tool-popover {
    top: calc(var(--space-4) + 48px);
    left: 74px;
    max-width: calc(100% - 90px);
  }

  .content {
    border: none;
    padding: var(--editor-top-overlay-height) var(--space-5) var(--editor-bottom-overlay-height);
  }

  .content :deep(.mn-prose) {
    max-width: none;
    margin: 0;
  }
}
</style>
