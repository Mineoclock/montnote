const TITLE_PREVIEW_LIMIT = 24
const SUMMARY_PREVIEW_LIMIT = 48

function normalizePreviewText(t: string) {
  return (t || '').replace(/\s+/g, ' ').trim()
}

export function derivePreview(text: string) {
  const lines = String(text || '').split('\n')
  const lineIndex = lines.findIndex((line) => line.trim())
  if (lineIndex === -1) return { title: '', summary: '' }

  const titleLine = lines[lineIndex].trim()
  const summarySource = [titleLine.slice(TITLE_PREVIEW_LIMIT), ...lines.slice(lineIndex + 1)].join('\n')
  return {
    title: titleLine.slice(0, TITLE_PREVIEW_LIMIT),
    summary: normalizePreviewText(summarySource).slice(0, SUMMARY_PREVIEW_LIMIT)
  }
}
