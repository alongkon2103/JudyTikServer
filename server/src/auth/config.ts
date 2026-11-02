import { createPrivateKey, type KeyObject } from 'node:crypto'
export interface AuthConfig {
  origin: string
  privateKey: KeyObject
  keyId: string
  encryptionKey: Buffer
  browserSecret: Buffer
  emailPepper: Buffer
  google?: { clientId: string; clientSecret: string }
  discord?: { clientId: string; clientSecret: string }
  smtp?: { url: string; from: string }
}
function invalid(name: string): never {
  throw new Error(`Invalid ${name}; check server authentication configuration`)
}
function key(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]
  if (!value || !/^[-_A-Za-z0-9]{43}$/.test(value)) invalid(name)
  const bytes = Buffer.from(value!, 'base64url')
  if (bytes.length !== 32 || bytes.toString('base64url') !== value)
    invalid(name)
  return bytes
}
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig | undefined {
  const names = [
    'AUTH_SIGNING_PRIVATE_KEY',
    'AUTH_ENCRYPTION_KEY',
    'AUTH_BROWSER_SECRET',
    'EMAIL_CODE_PEPPER',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'SMTP_URL',
    'SMTP_FROM',
  ]
  if (!names.some((name) => !!env[name])) return undefined
  let privateKey: KeyObject
  try {
    privateKey = createPrivateKey({
      key: Buffer.from(env.AUTH_SIGNING_PRIVATE_KEY ?? '', 'base64'),
      format: 'der',
      type: 'pkcs8',
    })
    if (privateKey.asymmetricKeyType !== 'ed25519')
      invalid('AUTH_SIGNING_PRIVATE_KEY')
  } catch {
    invalid('AUTH_SIGNING_PRIVATE_KEY')
  }
  const originValue =
    env.API_ORIGIN ?? 'http://127.0.0.1:' + (env.PORT ?? '4300')
  let origin: URL
  try {
    origin = new URL(originValue)
  } catch {
    invalid('API_ORIGIN')
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(origin!.hostname)
  if (
    origin!.username ||
    origin!.password ||
    origin!.pathname !== '/' ||
    origin!.search ||
    origin!.hash ||
    !['https:', 'http:'].includes(origin!.protocol) ||
    (origin!.protocol === 'http:' && (!local || env.NODE_ENV === 'production'))
  )
    invalid('API_ORIGIN')
  const keyId = env.AUTH_SIGNING_KEY_ID ?? 'judytik-auth-v1'
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(keyId)) invalid('AUTH_SIGNING_KEY_ID')
  const provider = (prefix: string) => {
    const clientId = env[prefix + '_CLIENT_ID']?.trim(),
      clientSecret = env[prefix + '_CLIENT_SECRET']?.trim()
    if (!clientId && !clientSecret) return undefined
    if (!clientId || clientId.length > 512) invalid(prefix + '_CLIENT_ID')
    if (!clientSecret || clientSecret.length > 4096)
      invalid(prefix + '_CLIENT_SECRET')
    return { clientId: clientId!, clientSecret: clientSecret! }
  }
  let smtp: AuthConfig['smtp']
  if (env.SMTP_URL || env.SMTP_FROM) {
    let url: URL
    try {
      url = new URL(env.SMTP_URL!)
    } catch {
      invalid('SMTP_URL')
    }
    if (!['smtp:', 'smtps:'].includes(url!.protocol)) invalid('SMTP_URL')
    if (
      !env.SMTP_FROM ||
      /[\r\n]/.test(env.SMTP_FROM) ||
      env.SMTP_FROM.length > 254
    )
      invalid('SMTP_FROM')
    smtp = { url: env.SMTP_URL!, from: env.SMTP_FROM }
  }
  return {
    origin: origin!.origin,
    privateKey: privateKey!,
    keyId,
    encryptionKey: key(env, 'AUTH_ENCRYPTION_KEY'),
    browserSecret: key(env, 'AUTH_BROWSER_SECRET'),
    emailPepper: key(env, 'EMAIL_CODE_PEPPER'),
    google: provider('GOOGLE'),
    discord: provider('DISCORD'),
    smtp,
  }
}
