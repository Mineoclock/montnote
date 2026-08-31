import { readonly, shallowRef } from 'vue'

type DialogKind = 'alert' | 'confirm' | 'prompt'

interface DialogState {
  open: boolean
  kind: DialogKind
  title: string
  message: string
  defaultValue: string
  placeholder: string
  confirmText: string
  cancelText: string
}

interface DialogOptions {
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}

const initialState: DialogState = {
  open: false,
  kind: 'alert',
  title: '',
  message: '',
  defaultValue: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消'
}

const state = shallowRef<DialogState>({ ...initialState })
let resolver: ((value: string | boolean | null) => void) | null = null

function show(kind: DialogKind, options: DialogOptions) {
  resolver?.(null)
  state.value = {
    open: true,
    kind,
    title: options.title,
    message: options.message ?? '',
    defaultValue: options.defaultValue ?? '',
    placeholder: options.placeholder ?? '',
    confirmText: options.confirmText ?? '确定',
    cancelText: options.cancelText ?? '取消'
  }

  return new Promise<string | boolean | null>((resolve) => {
    resolver = resolve
  })
}

function settle(value: string | boolean | null) {
  const resolve = resolver
  resolver = null
  state.value = { ...initialState }
  resolve?.(value)
}

export function useDialog() {
  return {
    dialogState: readonly(state),
    alert: (options: DialogOptions) => show('alert', options).then(() => undefined),
    confirm: (options: DialogOptions) => show('confirm', options).then(Boolean),
    prompt: (options: DialogOptions) => show('prompt', options).then((value) => typeof value === 'string' ? value : null),
    resolveDialog: (value: string | boolean | null) => settle(value)
  }
}