/**
 * POST /api/analyse
 *   multipart/form-data:
 *     file: PDF/PNG/JPG/TIFF/DOCX/XLSX (sample document)
 *   Returns: AI-suggested field definitions to seed the template builder.
 *
 * Per BRD §3 US-03 — "System proposes fields with types and sample values;
 * user can edit all suggestions."
 *
 * Org-scoped: requires authentication (session OR API key).
 */

import { NextRequest, NextResponse } from 'next/server'
import { fileTypeFromBuffer } from 'file-type'
import { extractPdfText } from '@/lib/pdf/extract'
import { runOcrEngines } from '@/lib/ocr'
import { parseLlmJsonOrArray, detectDocType } from '@/lib/extraction/analyse-helpers'
import { getAuthContext } from '@/lib/auth-context'
import type { FieldDef } from '@/lib/templates/schema'

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
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in or pass an API key.' } }, { status: 401 })
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
      const mammoth = (await import('mammoth')).default
      const r = await mammoth.extractRawText({ buffer })
      text = r.value
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.toLowerCase().endsWith('.xlsx')) {
      const XLSX = (await import('xlsx')).default
      const wb = XLSX.read(buffer, { type: 'buffer' })
      text = wb.SheetNames.map(s => `# Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join('\n\n')
    } else if (mimeType.startsWith('image/')) {
      // For images: use VLM (Vision Language Model) to both read AND analyze in one step
      // VLM sees the actual document layout — much more accurate than OCR + text LLM
      try {
        const base64Image = `data:${mimeType};base64,${buffer.toString('base64')}`
        const ZAI = (await import('z-ai-web-dev-sdk')).default
        const zai = await ZAI.create()
        
        const vlmResponse = await zai.chat.completions.createVision({
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a document analysis assistant. Look at this document image and identify what type of document it is (invoice, receipt, purchase order, etc.). Then suggest fields that should be extracted from documents like this.

Return ONLY a JSON array of field objects — no prose, no markdown fences:
[
  {
    "name": "snake_case_name",
    "label": "Human-friendly label",
    "type": "string|number|date|currency|email|phone|line_items",
    "required": true_or_false,
    "description": "What to look for in the document",
    "sample": "Example value visible in THIS document if visible, else empty string"
  }
]

If the document has line items, include a field of type "line_items" with "subFields" listing the per-line columns.`
              },
              { type: 'image_url', image_url: { url: base64Image } }
            ]
          }],
          thinking: { type: 'disabled' },
        })
        
        const vlmText = vlmResponse.choices[0]?.message?.content ?? ''
        // The VLM response IS the field suggestions — set as text so the LLM adapter parses it
        // But actually, we can skip the LLM step and parse the VLM output directly
        const { parseLlmJsonOrArray } = await import('@/lib/extraction/analyse-helpers')
        const parsed = parseLlmJsonOrArray(vlmText)
        const suggestedFields = Array.isArray(parsed) ? parsed as FieldDef[] : []
        
        await logAudit({
          ctx,
          action: 'template.analyse_vlm',
          metadata: { fileName: file.name, mimeType, vlmUsed: true, suggestedCount: suggestedFields.length },
        })
        
        return NextResponse.json({
          suggested_fields: suggestedFields,
          text_length: 0,
          detected_doc_type: 'image_vlm',
          vlm_used: true,
        })
      } catch (vlmError) {
        // VLM failed — fall back to OCR + text LLM
        console.log('[analyse] VLM failed, falling back to OCR:', vlmError instanceof Error ? vlmError.message : 'unknown')
        const ocr = await runOcrEngines(buffer, mimeType, ['tesseract'])
        text = ocr[0]?.text ?? ''
      }
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

    const systemPrompt = `You are a document analysis assistant. The user has uploaded a sample ${mimeType === 'application/pdf' ? 'PDF' : mimeType.includes('image') ? 'image' : 'document'} and wants to know what fields they should extract from documents like this.

Inspect the document text below and propose a list of fields. Return a JSON object with a "fields" key containing an array of field objects:
{
  "fields": [
    {
      "name": "snake_case_name",
      "label": "Human-friendly label",
      "type": "string" | "number" | "date" | "currency" | "email" | "phone" | "line_items",
      "required": true | false,
      "description": "What to look for in the document",
      "sample": "Example value from THIS document if visible, else empty string"
    }
  ]
}

If the document contains line items (e.g. an invoice), include a field of type "line_items"
with a "subFields" array listing the per-line columns (e.g. description, quantity, unit_price, line_total).

Return ONLY valid JSON — no prose, no markdown fences.`

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

    return NextResponse.json({
      suggested_fields: suggestedFields,
      text_length: text.length,
      detected_doc_type: detectDocType(text),
    })
  } catch (e) {
    console.error('[analyse] error:', e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'Unknown' } }, { status: 500 })
  }
}
