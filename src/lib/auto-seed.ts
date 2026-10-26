/**
 * Auto-seed helper — runs on first request if DB is empty.
 * Skips during build time (when DATABASE_URL is not available).
 */

import bcrypt from 'bcryptjs'

let seedRan = false

export async function ensureSeeded(): Promise<void> {
  if (seedRan) return
  seedRan = true

  // Skip during build time — DATABASE_URL is not available
  if (!process.env.DATABASE_URL) {
    console.log('[seed] Skipping — no DATABASE_URL (build time)')
    seedRan = false
    return
  }

  try {
    // Lazy import to avoid Prisma init during build
    const { db } = await import('@/lib/db')
    const { BUNDLED_TEMPLATES, serializeTemplateFields } = await import('@/lib/templates/schema')

    const userCount = await db.user.count()
    if (userCount > 0) {
      return  // already seeded
    }

    console.log('[seed] DB is empty — auto-seeding default org + user + templates...')

    const DEFAULT_EMAIL = 'admin@gnosis.local'
    const DEFAULT_PASSWORD = 'gnosis123'

    const org = await db.organization.create({
      data: { name: 'Gnosis (default)', status: 'active' },
    })

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
    const user = await db.user.create({
      data: { email: DEFAULT_EMAIL, passwordHash, name: 'Gnosis Admin', status: 'active' },
    })

    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'admin' },
    })

    for (const tpl of BUNDLED_TEMPLATES) {
      await db.template.create({
        data: {
          organizationId: org.id,
          name: tpl.name,
          documentType: tpl.documentType,
          fieldsJson: serializeTemplateFields(tpl.fields),
          instructions: tpl.instructions,
        },
      })
    }

    console.log('[seed] ✓ Complete. Login: admin@gnosis.local / gnosis123')
  } catch (e) {
    console.error('[seed] failed:', e instanceof Error ? e.message : 'unknown')
    seedRan = false  // allow retry
  }
}
