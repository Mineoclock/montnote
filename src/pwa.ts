import { registerSW } from 'virtual:pwa-register'

const themeColors = {
  dark: '#000000',
  light: '#eceef2'
} as const

function ensureThemeColorMeta() {
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  document.head.append(meta)
  return meta
}

function syncThemeColor(darkScheme: MediaQueryList) {
  const color = darkScheme.matches ? themeColors.dark : themeColors.light
  const metas = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
  for (const meta of metas.length > 0 ? metas : [ensureThemeColorMeta()]) {
    if (!meta.media) meta.content = color
  }
}

if (typeof window !== 'undefined' && 'matchMedia' in window) {
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)')
  syncThemeColor(darkScheme)
  darkScheme.addEventListener('change', () => syncThemeColor(darkScheme))
}

registerSW({ immediate: true })
