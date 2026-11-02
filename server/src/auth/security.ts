import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { ApiError } from '../http/api-error.js'
import type { AuthConfig } from './config.js'
import type { Clock } from './clock.js'
export interface AccessIdentity {
  userId: string
  sessionId: string
  deviceId: string
}
export const randomSecret = () => randomBytes(32).toString('base64url')
export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest()
export const equal = (a: Uint8Array, b: Uint8Array) =>
  a.byteLength === b.byteLength && timingSafeEqual(a, b)
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
export class AuthSecurity {
  constructor(
    private readonly config: AuthConfig | undefined,
    private readonly clock: Clock,
  ) {}
  requireConfig() {
    if (!this.config) throw new ApiError(503, 'AUTH_NOT_CONFIGURED')
    return this.config
  }
  seal(value: unknown, scope: string) {
    const cfg = this.requireConfig(),
      iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', cfg.encryptionKey, iv)
    cipher.setAAD(Buffer.from(scope))
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ])
    return Buffer.concat([iv, cipher.getAuthTag(), data])
  }
  open(value: Uint8Array, scope: string): unknown {
    const cfg = this.requireConfig()
    try {
      const bytes = Buffer.from(value)
      if (bytes.length < 29) throw Error()
      const decipher = createDecipheriv(
        'aes-256-gcm',
        cfg.encryptionKey,
        bytes.subarray(0, 12),
      )
      decipher.setAAD(Buffer.from(scope))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString('utf8'),
      )
    } catch {
      throw new ApiError(400, 'OAUTH_STATE_INVALID')
    }
  }
  launchMac(attempt:{id:string;provider:string;codeChallenge:string;clientState:string;redirectUri:string;expiresAt:Date}) {
    return createHmac('sha256',this.requireConfig().browserSecret).update(JSON.stringify(['native-launch:v1',attempt.id,attempt.provider,attempt.codeChallenge,attempt.clientState,attempt.redirectUri,attempt.expiresAt.toISOString()])).digest('base64url')
  }
  newBrowserCookie(previous?: string) {
    const browser = this.readBrowserCookie(previous ?? '') ?? randomSecret()
    const value = browser + '.' + Math.floor(this.clock.now().getTime() / 1000)
    return value + '.' + this.browserMac(value)
  }
  readBrowserCookie(value: string) {
    const parts = value.split('.')
    if (
      parts.length !== 3 ||
      !/^[-_A-Za-z0-9]{43}$/.test(parts[0]) ||
      !/^\d{10,12}$/.test(parts[1])
    )
      return undefined
    const age = this.clock.now().getTime() / 1000 - Number(parts[1])
    if (
      age < 0 ||
      age > 600 ||
      !equal(
        Buffer.from(parts[2]),
        Buffer.from(this.browserMac(parts[0] + '.' + parts[1])),
      )
    )
      return undefined
    return parts[0]
  }
  private browserMac(value: string) {
    return createHmac('sha256', this.requireConfig().browserSecret)
      .update('cookie:v1:' + value)
      .digest('base64url')
  }
  csrf(browser: string, attempt: string) {
    return createHmac('sha256', this.requireConfig().browserSecret)
      .update('csrf:v1:' + browser + ':' + attempt)
      .digest('base64url')
  }
  checkCsrf(browser: string, attempt: string, token: string) {
    return equal(Buffer.from(token), Buffer.from(this.csrf(browser, attempt)))
  }
  emailMac(challenge: string, user: string, email: string, code: string) {
    return createHmac('sha256', this.requireConfig().emailPepper)
      .update(['email-code:v1', challenge, user, email, code].join('\0'))
      .digest()
  }
  ipMac(ip: string) {
    return createHmac('sha256', this.requireConfig().emailPepper)
      .update('email-ip:v1\0' + ip)
      .digest()
  }
  async issueAccess(identity: AccessIdentity) {
    const cfg = this.requireConfig(),
      now = Math.floor(this.clock.now().getTime() / 1000)
    return new SignJWT({ sid: identity.sessionId, did: identity.deviceId })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: cfg.keyId })
      .setIssuer(cfg.origin)
      .setAudience('judytik-desktop')
      .setSubject(identity.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(cfg.privateKey)
  }
  async verifyAccess(token: string): Promise<AccessIdentity> {
    const cfg = this.requireConfig()
    try {
      const { payload, protectedHeader } = await jwtVerify(
        token,
        createPublicKey(cfg.privateKey),
        {
          algorithms: ['EdDSA'],
          issuer: cfg.origin,
          audience: 'judytik-desktop',
          typ: 'JWT',
          currentDate: this.clock.now(),
          maxTokenAge: 900,
        },
      )
      if (
        protectedHeader.kid !== cfg.keyId ||
        !uuid(payload.sub) ||
        !uuid(payload.sid) ||
        !uuid(payload.did)
      )
        throw Error()
      return {
        userId: payload.sub,
        sessionId: payload.sid,
        deviceId: payload.did,
      }
    } catch {
      throw new ApiError(401, 'AUTH_UNAUTHORIZED')
    }
  }
}
