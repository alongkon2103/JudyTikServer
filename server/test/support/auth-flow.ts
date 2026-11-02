import { randomUUID } from 'node:crypto'
import type { PrismaService } from '../../src/database/prisma.service.js'
import { AuthSecurity, sha256, randomSecret } from '../../src/auth/security.js'
import { readAuthConfig } from '../../src/auth/config.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { authEnv, TestClock } from './auth-fixture.js'
import { FakeProviders } from './fake-auth.js'
import type { Provider } from '../../src/auth/contracts.js'
export function authHarness(db: PrismaService) {
  const clock = new TestClock(),
    config = readAuthConfig(authEnv())!,
    security = new AuthSecurity(config, clock),
    providers = new FakeProviders(),
    auth = new AuthService(db, security, providers, clock)
  async function signIn(
    options: {
      provider?: Provider
      subject?: string
      email?: string
      verified?: boolean
    avatarUrl?: string
    } = {},
  ) {
    const provider = options.provider ?? 'google',
      verifier = randomSecret()
    const attempt = await auth.startAttempt(
      {
        provider,
        codeChallenge: sha256(verifier).toString('base64url'),
        codeChallengeMethod: 'S256',
        clientState: randomSecret(),
        installationId: randomUUID(),
        deviceLabel: 'Creator PC',
        platform: 'windows',
        redirectUri: 'http://127.0.0.1:43817/oauth/callback',
      },
      randomUUID(),
    )
    const page = await auth.authorizationPage(attempt.id),
      url = new URL(
        await auth.confirmAuthorization(
          { attemptId: attempt.id, csrfToken: page.csrfToken },
          page.cookie,
          config.origin,
          randomUUID(),
        ),
      )
    const code = randomUUID()
    providers.profiles.set(code, {
      provider,
      subject: options.subject ?? randomUUID(),
      displayName: 'Creator',
      email: options.email,
      emailVerified: options.verified ?? false,
      avatarUrl: options.avatarUrl,
    })
    const redirect = new URL(
      await auth.completeProvider(
        provider,
        { state: url.searchParams.get('state'), code },
        page.cookie,
        randomUUID(),
      ),
    )
    const tokens = await auth.exchangeToken(
      {
        grant_type: 'authorization_code',
        code: redirect.searchParams.get('code'),
        code_verifier: verifier,
        redirect_uri: 'http://127.0.0.1:43817/oauth/callback',
      },
      randomUUID(),
    )
    return { tokens, session: await auth.authenticate(tokens.access_token) }
  }
  return { clock, config, security, providers, auth, signIn }
}
