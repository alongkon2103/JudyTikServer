import { readAuthConfig, type AuthConfig } from '../auth/config.js'
import { readLiveConfig, type LiveConfig } from '../live/config.js'
import { readApiOrigin } from './origin.js'
export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  trustProxy: false | 'loopback'
  databaseUrl: string
  adminApiKey: string
  apiOrigin?: string
  auth?: AuthConfig
  live?: LiveConfig
}
export const CONFIG = Symbol('ServerConfig')
const invalid = (name: string): never => {
  throw new Error(`Invalid ${name}; check server environment configuration`)
}
export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv))
    invalid('NODE_ENV')
  const raw = env.DATABASE_URL
  if (!raw || /YOUR_|\[.*PASSWORD.*\]/i.test(raw)) invalid('DATABASE_URL')
  let url: URL
  try {
    url = new URL(raw!)
  } catch {
    invalid('DATABASE_URL')
  }
  if (
    !['postgresql:', 'postgres:'].includes(url!.protocol) ||
    !url!.username ||
    !url!.password ||
    !url!.pathname.slice(1)
  )
    invalid('DATABASE_URL')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url!.hostname)
  if (!local && url!.searchParams.get('sslmode') !== 'verify-full')
    invalid('DATABASE_URL')
  if (
    nodeEnv === 'production' &&
    /^(postgres|supabase_admin)(\.|$)/.test(decodeURIComponent(url!.username))
  )
    invalid('DATABASE_URL')
  const port = Number(env.PORT ?? 4300)
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid('PORT')
  const adminApiKey = env.ADMIN_API_KEY ?? ''
  if (
    !/^[A-Za-z0-9_-]{32,128}$/.test(adminApiKey) ||
    adminApiKey.startsWith('YOUR_')
  )
    invalid('ADMIN_API_KEY')
  const proxy = env.TRUST_PROXY ?? 'false'
  if (!['false', 'loopback'].includes(proxy)) invalid('TRUST_PROXY')
  return {
    trustProxy: proxy === 'loopback' ? 'loopback' : false,
    nodeEnv: nodeEnv as ServerConfig['nodeEnv'],
    host: env.HOST ?? '127.0.0.1',
    port,
    databaseUrl: raw!,
    adminApiKey,
    apiOrigin: env.API_ORIGIN === undefined ? undefined : readApiOrigin(env),
    auth: readAuthConfig(env),
    live: readLiveConfig(env),
  }
}
