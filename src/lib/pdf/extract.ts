/**
 * PDF text extraction — tries pdf-parse first, falls back to empty (triggers OCR).
 *
 * If pdf-parse fails (common in Docker/Alpine environments), returns empty text
 * which triggers the Tesseract OCR fallback path in the worker.
 */

export type PdfExtractResult = {
  text: string
  page_count: number
  text_length: number
  time_ms: number
  is_scanned: boolean
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const start = Date.now()
  try {
    // Try pdf-parse with a workaround for the test file issue
    // pdf-parse v1 checks for ./test/data/05-versions-space.pdf on require
    // We create a minimal mock to bypass this
    const fs = require('fs')
    const path = require('path')
    
    // Create the test directory if it doesn't exist (pdf-parse looks for it)
    const testDir = path.join(process.cwd(), 'test', 'data')
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }
    const testFile = path.join(testDir, '05-versions-space.pdf')
    if (!fs.existsSync(testFile)) {
      // Create a minimal valid PDF file
      fs.writeFileSync(testFile, Buffer.from('JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9Db3VudCAwPj4KZW5kb2JqCnN0YXJ0eHJlZgowCiUlRU9G', 'base64'))
    }

    // Now require pdf-parse (it will find the test file)
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
    console.error('[pdf] extraction failed, will use OCR fallback:', e instanceof Error ? e.message : 'unknown')
    return {
      text: '',
      page_count: 1,
      text_length: 0,
      time_ms: Date.now() - start,
      is_scanned: true, // trigger OCR fallback
    }
  }
}
