import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'
function migrationUrl() {
  try {
    const url = new URL(env('DIRECT_URL'))
    url.searchParams.set('schema', 'judytik')
    return url.toString()
  } catch {
    throw new Error('Invalid or missing DIRECT_URL')
  }
}
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: migrationUrl(),
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
})
