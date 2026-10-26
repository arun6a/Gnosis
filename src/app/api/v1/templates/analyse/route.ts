/**
 * POST /api/v1/templates/analyse
 *   Public version of /api/analyse — same logic, versioned path.
 *   Authorization: Bearer <api_key>
 *
 * Per BRD §6.1 — POST /api/v1/templates/analyse: "Analyse sample documents
 * and suggest fields."
 */

import { NextRequest, NextResponse } from 'next/server'
import { fileTypeFromBuffer } from 'file-type'
import { extractPdfText } from '@/lib/pdf/extract'
import { runOcrEngines } from '@/lib/ocr'
import { parseLlmJsonOrArray, detectDocType } from '@/lib/extraction/analyse-helpers'
import { getAuthContext } from '@/lib/auth-context'
import { logAudit } from '@/lib/audit'
import type { FieldDef } from '@/lib/templates/schema'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req)
  if (!ctx) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' } }, { status: 401 })
  }
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: { code: 'NO_FILE', message: 'No file uploaded.' } }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: { code: 'FILE_TOO_LARGE', message: 'Max 10 MB.' } }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const detected = await fileTypeFromBuffer(buffer)
    const mimeType = detected?.mime ?? file.type
    if (!ALLOWED.includes(mimeType)) {
      return NextResponse.json({ error: { code: 'FILE_TYPE_NOT_SUPPORTED', message: `Unsupported: ${mimeType}` } }, { status: 415 })
    }

    let text = ''
    if (mimeType === 'application/pdf') {
      const pdf = await extractPdfText(buffer)
      if (pdf.is_scanned) {
        const ocr = await runOcrEngines(buffer, mimeType, ['tesseract'])
        text = ocr[0]?.text ?? ''
      } else {
        text = pdf.text
      }
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.toLowerCase().endsWith('.docx')) {
      const r = await mammoth.extractRawText({ buffer })
      text = r.value
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.toLowerCase().endsWith('.xlsx')) {
      const wb = XLSX.read(buffer, { type: 'buffer' })
      text = wb.SheetNames.map(s => `# Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join('\n\n')
    } else {
      const ocr = await runOcrEngines(buffer, mimeType, ['tesseract'])
      text = ocr[0]?.text ?? ''
    }

    if (!text.trim()) {
      return NextResponse.json({
        suggested_fields: [],
        text_length: 0,
        message: 'No text could be extracted from the document.',
      })
    }

    // Use the same LLM adapter as the extraction worker (OpenRouter/OpenAI/Z.ai)
    const { getLlmAdapter } = await import('@/lib/extraction/extractor')
    const llm = getLlmAdapter()

    const systemPrompt = `You are a document analysis assistant. Inspect the document text and propose a list of fields. Return ONLY a JSON array of field objects — no prose, no markdown fences.`

    const extraction = await llm.extract(text, {
      id: 'analyse',
      name: 'Field Analysis',
      documentType: 'unknown',
      fields: [{
        name: 'fields',
        label: 'Suggested Fields',
        type: 'line_items',
        required: true,
        description: 'Array of suggested field definitions',
        subFields: [
          { name: 'name', label: 'Field Name', type: 'string', required: true, description: 'snake_case name' },
          { name: 'label', label: 'Label', type: 'string', required: true, description: 'Human-friendly label' },
          { name: 'type', label: 'Type', type: 'string', required: true, description: 'Field type' },
          { name: 'required', label: 'Required', type: 'string', required: false, description: 'true or false' },
          { name: 'description', label: 'Description', type: 'string', required: false, description: 'What to look for' },
          { name: 'sample', label: 'Sample', type: 'string', required: false, description: 'Example value' },
        ],
      }],
      instructions: systemPrompt,
    })

    const raw = extraction.rawResponse
    const parsed = parseLlmJsonOrArray(raw)
    const suggestedFields = Array.isArray(parsed) ? parsed as FieldDef[] : []

    await logAudit({
      ctx,
      action: 'template.analyse_api',
      metadata: { fileName: file.name, textLength: text.length, suggestedCount: suggestedFields.length },
    })

    return NextResponse.json({
      suggested_fields: suggestedFields,
      text_length: text.length,
      detected_doc_type: detectDocType(text),
    })
  } catch (e) {
    console.error('[v1/templates/analyse] error:', e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'Unknown' } }, { status: 500 })
  }
}
