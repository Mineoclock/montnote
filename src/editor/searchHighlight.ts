import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export const searchHighlightKey = new PluginKey('searchHighlight')

interface HLState {
  term: string
  deco: DecorationSet
}

function build(doc: PMNode, term: string): DecorationSet {
  if (!term) return DecorationSet.empty
  const decos: Decoration[] = []
  const needle = term.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const hay = node.text.toLowerCase()
    let i = hay.indexOf(needle)
    while (i !== -1) {
      decos.push(Decoration.inline(pos + i, pos + i + term.length, { class: 'search-hl' }))
      i = hay.indexOf(needle, i + needle.length)
    }
  })
  return DecorationSet.create(doc, decos)
}

// 搜索高亮：通过 meta 设置关键词，对正文匹配处加 inline decoration
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init(): HLState {
            return { term: '', deco: DecorationSet.empty }
          },
          apply(tr, prev: HLState): HLState {
            const meta = tr.getMeta(searchHighlightKey) as { term: string } | undefined
            if (meta) return { term: meta.term, deco: build(tr.doc, meta.term) }
            if (tr.docChanged && prev.term) return { term: prev.term, deco: build(tr.doc, prev.term) }
            return prev
          }
        },
        props: {
          decorations(state) {
            return (searchHighlightKey.getState(state) as HLState | undefined)?.deco
          }
        }
      })
    ]
  }
})
