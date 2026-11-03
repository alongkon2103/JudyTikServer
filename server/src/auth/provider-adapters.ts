import * as oidc from 'openid-client'
import { z } from 'zod'
import { ApiError } from '../http/api-error.js'
import type { AuthConfig } from './config.js'
import type { Provider } from './contracts.js'
export interface ProviderExchange {
  state: string
  verifier: string
  nonce?: string
  redirectUri: string
}
export interface VerifiedProviderIdentity {
  provider: Provider
  subject: string
  displayName: string
  email?: string
  emailVerified: boolean
  avatarUrl?: string
}
const googleProfile = z.object({
  sub: z.string().min(1).max(255),
  name: z.string().max(512).optional(),
  email: z.email().max(254).optional(),
  email_verified: z.boolean().optional(),
  picture: z.string().max(2048).optional(),
})
const discordProfile = z.object({
  id: z.string().regex(/^[0-9]{1,255}$/),
  username: z.string().max(512),
  global_name: z.string().max(512).nullable().optional(),
  avatar: z.string().regex(/^(a_)?[a-f0-9]{32}$/).nullable().optional(),
  discriminator: z.string().regex(/^[0-9]{1,4}$/).optional(),
  email: z.email().max(254).nullable().optional(),
  verified: z.boolean().optional(),
})
const displayName = (value: string | undefined) =>
  Array.from(value?.trim() || 'JudyTik user')
    .slice(0, 80)
    .join('')
export class OAuthProviders {
  private readonly configurations = new Map<
    Provider,
    Promise<oidc.Configuration>
  >()
  constructor(
    private readonly config: AuthConfig | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  available(provider: Provider) {
    return !!this.config?.[provider]
  }
  private async configuration(provider: Provider) {
    const credentials = this.config?.[provider]
    if (!credentials) throw new ApiError(503, 'OAUTH_PROVIDER_NOT_CONFIGURED')
    let existing = this.configurations.get(provider)
    if (!existing) {
      existing = oidc
        .discovery(
          new URL(
            provider === 'google'
              ? 'https://accounts.google.com'
              : 'https://discord.com',
          ),
          credentials.clientId,
          {
            client_secret: credentials.clientSecret,
            ...(provider === 'google'
              ? { id_token_signed_response_alg: 'RS256' }
              : {}),
          },
          oidc.ClientSecretPost(credentials.clientSecret),
          {
            timeout: 10,
            [oidc.customFetch]: (input, options) =>
              this.request(provider, input, {
                ...options,
                body:
                  options.body instanceof Uint8Array
                    ? new Uint8Array(options.body)
                    : options.body,
              }),
          },
        )
        .then((configuration) => {
          if (provider === 'google')
            oidc.enableNonRepudiationChecks(configuration)
          return configuration
        })
        .catch(() => {
          this.configurations.delete(provider)
          throw new ApiError(503, 'OAUTH_PROVIDER_UNAVAILABLE')
        })
      this.configurations.set(provider, existing)
    }
    return existing
  }
  async authorizationUrl(provider: Provider, input: ProviderExchange) {
    const configuration = await this.configuration(provider)
    return oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: input.redirectUri,
      scope: provider === 'google' ? 'openid email profile' : 'identify email',
      state: input.state,
      code_challenge: await oidc.calculatePKCECodeChallenge(input.verifier),
      code_challenge_method: 'S256',
      ...(provider === 'google' ? { nonce: input.nonce! } : {}),
    })
  }
  async exchange(
    provider: Provider,
    url: URL,
    input: ProviderExchange,
  ): Promise<VerifiedProviderIdentity> {
    const configuration = await this.configuration(provider)
    try {
      if (url.origin + url.pathname !== input.redirectUri)
        throw Error('callback mismatch')
      const tokens = await oidc.authorizationCodeGrant(configuration, url, {
        expectedState: input.state,
        pkceCodeVerifier: input.verifier,
        ...(provider === 'google'
          ? { expectedNonce: input.nonce, idTokenExpected: true }
          : { idTokenExpected: false }),
      })
      if (provider === 'google') {
        const profile = googleProfile.parse(tokens.claims())
        return {
          provider,
          subject: profile.sub,
          displayName: displayName(profile.name),
          email: profile.email?.trim().toLowerCase(),
          emailVerified: profile.email_verified === true,
          avatarUrl: safeGoogleAvatarURL(profile.picture),
        }
      }
      const response = await this.request(
        provider,
        new URL('https://discord.com/api/v10/users/@me'),
        { headers: { authorization: 'Bearer ' + tokens.access_token } },
      )
      if (!response.ok) throw Error('profile unavailable')
      const profile = discordProfile.parse(await response.json())
      return {
        provider,
        subject: profile.id,
        displayName: displayName(profile.global_name ?? profile.username),
        email: profile.email?.trim().toLowerCase() ?? undefined,
        emailVerified: profile.verified === true,
        avatarUrl: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${profile.discriminator && profile.discriminator !== '0' ? Number(profile.discriminator) % 5 : Number((BigInt(profile.id) >> 22n) % 6n)}.png`,
      }
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(400, 'OAUTH_PROVIDER_INVALID')
    }
  }
  private async request(
    provider: Provider,
    input: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1],
  ): Promise<Response> {
    const url = new URL(String(input))
    const allowed =
      provider === 'google'
        ? [
            'accounts.google.com',
            'oauth2.googleapis.com',
            'www.googleapis.com',
            'openidconnect.googleapis.com',
          ]
        : ['discord.com']
    if (
      url.protocol !== 'https:' ||
      !allowed.includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new ApiError(503, 'OAUTH_PROVIDER_UNAVAILABLE')
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(10000),
        ...(options?.signal ? [options.signal] : []),
      ])
      const response = await this.fetcher(url, {
        ...options,
        signal,
        redirect: 'error',
      })
      if (response.status >= 500) {
        await response.body?.cancel()
        throw Error()
      }
      const reader = response.body?.getReader()
      if (!reader) throw Error()
      const chunks: Uint8Array[] = []
      let length = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          length += next.value.byteLength
          if (length > 1048576) {
            await reader.cancel()
            throw Error()
          }
          chunks.push(next.value)
        }
      } finally {
        reader.releaseLock()
      }
      return new Response(Buffer.concat(chunks), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch {
      throw new ApiError(503, 'OAUTH_PROVIDER_UNAVAILABLE')
    }
  }
}

function safeGoogleAvatarURL(value?:string){if(!value||value.length>512)return;try{const url=new URL(value);return url.href.length<=512&&url.protocol==='https:'&&/^lh[0-9]+\.googleusercontent\.com$/.test(url.hostname)&&!url.username&&!url.password&&!url.port&&/^\/(a|a-)\//.test(url.pathname)?url.href:undefined}catch{return}}
