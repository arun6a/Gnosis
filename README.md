# Gnosis

**AI Document Extraction Platform** — extract structured data from any document.

Upload a PDF, PNG, JPG, TIFF, DOCX, or XLSX → the platform parses (or OCRs) the text, calls an LLM with your template's schema, validates the result, and returns schema-valid JSON with optional CSV/XLSX exports.

> **Status**: Production-ready MVP. Deployed on Railway.
> **Forked from**: [Aavanam](https://github.com/arun6a/Aavanam) — same codebase, different branding.

---

## Live deployment

Deployed on Railway: `https://gnosis.up.railway.app` (set after first deploy)

**Login**: `admin@gnosis.local` / `gnosis123`

## Features

- **Multi-tenant SaaS**: Organizations, users, roles (admin/member/API)
- **Document extraction**: PDF, PNG, JPG, TIFF, DOCX, XLSX → structured JSON
- **OCR**: Tesseract 5 (system CLI, `--psm 4` for column-aware)
- **LLM extraction**: Z.ai GLM-4 (auto-splits large templates into 2 parallel calls); OpenAI gpt-4o-mini adapter ready to drop in
- **Template builder**: Full schema editor + AI field suggestion ("Analyse sample → suggest fields")
- **Multi-invoice detection**: Auto-detects bundled invoices in a single PDF, splits + extracts each
- **Public API v1**: REST API with API keys, async job queue, polling, webhooks with HMAC signing
- **Dashboard**: Usage stats, cost tracking, 30-day charts, recent activity
- **Audit logs**: Every state-changing action logged immutably
- **Exports**: JSON, CSV, XLSX (two sheets: Document Summary + Line Items)
- **Confidence scoring**: LLM returns per-field confidence (0.0–1.0)
- **Rate limiting**: 60 req/min per identity on public API
- **Auto-seed**: Self-healing — creates default org + admin if DB is empty

## Tech stack

- **Frontend**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 + shadcn/ui (58 components)
- **Backend**: Next.js API routes (29 routes: internal + public v1)
- **Database**: PostgreSQL (via Prisma ORM)
- **OCR**: System Tesseract 5 (Alpine package in Dockerfile)
- **LLM**: Z.ai GLM-4 (via z-ai-web-dev-sdk) — OpenAI adapter ready
- **Queue**: In-memory (swap to Redis/Cloud Tasks for production scale)
- **Storage**: Local filesystem (swap to GCS/S3 for production scale)

## Quick start (local dev)

```bash
bun install
bun run db:push
bun run dev
```

Default login: `admin@gnosis.local` / `gnosis123`

## Deploy to Railway

1. Sign up at [railway.app](https://railway.app) with GitHub
2. Click "New Project → Deploy from GitHub repo"
3. Select this repo
4. Add a PostgreSQL database service (one click)
5. Set environment variables:
   - `DATABASE_URL` — auto-provided by Railway PostgreSQL
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL` — your Railway URL (set after first deploy)
6. Railway builds the Dockerfile + deploys automatically
7. You get a live URL like `https://gnosis.up.railway.app`

See `docs/DEPLOYMENT.md` for detailed deployment instructions.

## Documentation

- [`docs/BRD.md`](./docs/BRD.md) — Original build plan
- [`docs/CURRENT-STAGE.md`](./docs/CURRENT-STAGE.md) — What's built
- [`docs/PLAN.md`](./docs/PLAN.md) — Roadmap
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Deployment guide

## Provider-neutral adapters

Per BRD §4 — all parsers and AI providers are replaceable:

```
src/lib/ocr/index.ts                — OcrAdapter (TesseractAdapter, PaddleAdapter stub)
src/lib/extraction/extractor.ts     — LlmAdapter (ZaiLlmAdapter, OpenAiLlmAdapter)
src/lib/pdf/extract.ts              — PDF parser adapter (unpdf)
src/lib/extraction/multi-invoice.ts — Invoice splitter adapter
src/lib/storage/index.ts            — StorageAdapter (Local, GCS stub)
```

Swap any engine without touching the rest of the app.

## License

Proprietary — built for the project owner. Not for redistribution.
