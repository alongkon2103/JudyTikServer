import { generateKeyPairSync, randomBytes } from 'node:crypto'
export function authEnv(overrides: Record<string, string | undefined> = {}) {
  const { privateKey } = generateKeyPairSync('ed25519')
  return {
    API_ORIGIN: 'http://127.0.0.1:4300',
    AUTH_SIGNING_PRIVATE_KEY: privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64'),
    AUTH_SIGNING_KEY_ID: 'judytik-test-v1',
    AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
    AUTH_BROWSER_SECRET: randomBytes(32).toString('base64url'),
    EMAIL_CODE_PEPPER: randomBytes(32).toString('base64url'),
    ...overrides,
  }
}
export class TestClock {
  constructor(private value = new Date()) {}
  now() {
    return new Date(this.value)
  }
  advance(ms: number) {
    this.value = new Date(this.value.getTime() + ms)
  }
}
