import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Builds one Prisma client wired to Neon. DATABASE_URL is the *pooled*
// connection string — the right one for app queries. (Migrations use
// DATABASE_URL_UNPOOLED, which is configured separately in prisma.config.ts.)
function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });

  return new PrismaClient({ adapter });
}

// In development, Next.js hot-reloads by re-running this module every time you
// save a file. Without the cache below, each save would build a brand new
// PrismaClient and open a brand new pool of database connections, until Neon
// starts refusing them. `globalThis` is the one object that survives a reload,
// so we stash the client there and reuse it.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// In production the module is only evaluated once, so there is nothing to cache
// and we skip the global to avoid leaking state between serverless invocations.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
