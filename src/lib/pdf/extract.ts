/**
 * PDF text extraction using pdf-parse v1 (lazy-loaded to avoid build-time test file issue).
 *
 * pdf-parse v1 has a known issue: it tries to read ./test/data/05-versions-space.pdf
 * during require(). By lazy-loading (only requiring when extractPdfText is called),
 * we avoid this during the Next.js build phase.
 */

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
    // Lazy-load pdf-parse only when actually called (not during build)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse')
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
    console.error('[pdf] extraction failed:', e instanceof Error ? e.message : 'unknown')
    return {
      text: '',
      page_count: 1,
      text_length: 0,
      time_ms: Date.now() - start,
      is_scanned: true,
    }
  }
}
