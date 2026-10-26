/**
 * PDF text extraction using pdf-parse v1 — pure-JS, no worker, no Iterator issue.
 *
 * Per BRD §5.2: "Inspect PDF text quality; use native parsing when text is
 * usable and OCR when pages are scanned."
 *
 * For MVP, "text is usable" = total extracted text length > 50 chars.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

export type PdfExtractResult = {
  text: string
  page_count: number
  text_length: number
  time_ms: number
  /** True if PDF has essentially no native text → needs OCR. */
  is_scanned: boolean
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const start = Date.now()
  try {
    const result = await pdfParse(buffer, { max: 0 })
    const text = (result?.text ?? '').trim()
    const text_length = text.length
    const is_scanned = text_length < 50
    const page_count = result?.numpages ?? 1
    return {
      text,
      page_count,
      text_length,
      time_ms: Date.now() - start,
      is_scanned,
    }
  } catch (e) {
    // If pdf-parse fails, return empty (will trigger OCR fallback)
    console.error('[pdf] extraction failed:', e instanceof Error ? e.message : 'unknown')
    return {
      text: '',
      page_count: 1,
      text_length: 0,
      time_ms: Date.now() - start,
      is_scanned: true, // trigger OCR fallback
    }
  }
}
