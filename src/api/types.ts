import type { JSONContent } from '@tiptap/core'

export type LocalSaveStatus = 'pending' | 'saving' | 'failed'

export interface Notebook {
  id: string
  name: string
}

// 列表/搜索项（来自 key 解析；title≤40、summary≤100 预览、updatedAt 秒级）
export interface NoteListItem {
  key: string
  notebookId: string
  notebookName: string
  title: string
  summary: string
  updatedAt?: number
  deletedAt?: number
  localSaveStatus?: LocalSaveStatus
}

// 完整笔记 = key（身份，可变）+ 文档内容
export interface Note {
  key: string
  notebookId: string
  content: JSONContent // Tiptap 文档 JSON
  text: string // 纯文本投影（搜索/预览派生）
  createdAt: number
  updatedAt: number
}

export interface TrashNote {
  key: string
  notebookId: string
  content: JSONContent
  text: string
  createdAt: number
  deletedAt: number
  originalKey: string
  originalNotebookId: string
}

// 写入体（更新时带 key）
export interface NoteWrite {
  key?: string
  notebookId?: string
  content: JSONContent
  text: string
}
