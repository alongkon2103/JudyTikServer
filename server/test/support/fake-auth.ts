import {
  OAuthProviders,
  type ProviderExchange,
  type VerifiedProviderIdentity,
} from '../../src/auth/provider-adapters.js'
import type { Provider } from '../../src/auth/contracts.js'
import { ApiError } from '../../src/http/api-error.js'
export class FakeProviders extends OAuthProviders {
  profiles = new Map<string, VerifiedProviderIdentity>()
  exchanges = 0
  beforeExchange?: () => Promise<void>
  constructor() {
    super(undefined)
  }
  override available(_provider: Provider) {
    return true
  }
  override async authorizationUrl(provider: Provider, input: ProviderExchange) {
    const url = new URL(
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://discord.com/api/oauth2/authorize',
    )
    url.search = new URLSearchParams({
      state: input.state,
      nonce: input.nonce ?? '',
      code_challenge_method: 'S256',
    }).toString()
    return url
  }
  override async exchange(
    provider: Provider,
    url: URL,
    _input: ProviderExchange,
  ) {
    this.exchanges++
    await this.beforeExchange?.()
    const profile = this.profiles.get(url.searchParams.get('code') ?? '')
    if (!profile || profile.provider !== provider)
      throw new ApiError(400, 'OAUTH_PROVIDER_INVALID')
    return profile
  }
}
