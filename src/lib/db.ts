import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Auto-seed on first DB use — but only at runtime (not build time)
if (process.env.DATABASE_URL) {
  import('@/lib/auto-seed').then(({ ensureSeeded }) => ensureSeeded()).catch(() => {})
}
