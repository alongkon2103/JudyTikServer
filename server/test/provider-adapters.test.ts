import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { SignJWT, exportJWK } from 'jose'
import {
  OAuthProviders,
  type ProviderExchange,
} from '../src/auth/provider-adapters.js'
import { readAuthConfig } from '../src/auth/config.js'
import { authEnv } from './support/auth-fixture.js'
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 }),
  other = generateKeyPairSync('rsa', { modulusLength: 2048 })
const input: ProviderExchange = {
  state: 's'.repeat(43),
  verifier: 'v'.repeat(43),
  nonce: 'n'.repeat(43),
  redirectUri: 'http://127.0.0.1:4300/v1/auth/oauth/google/callback',
}
async function fixture(mode = 'valid') {
  const config = readAuthConfig(
    authEnv({
      GOOGLE_CLIENT_ID: 'google-test-client',
      GOOGLE_CLIENT_SECRET: 'google-test-secret',
      DISCORD_CLIENT_ID: 'discord-test-client',
      DISCORD_CLIENT_SECRET: 'discord-test-secret',
    }),
  )!
  const jwk = await exportJWK(keys.publicKey)
  jwk.kid = 'fixture'
  jwk.use = 'sig'
  jwk.alg = 'RS256'
  const claims = {
    nonce: mode === 'nonce' ? 'wrong' : input.nonce,
    name: 'Creator',
    email: 'creator@example.invalid',
    email_verified: true,
    ...(mode==='google-avatar'?{picture:'https://lh3.googleusercontent.com/a/profile=s96-c'}:mode==='long-google-avatar'?{picture:'https://lh3.googleusercontent.com/a/'+'x'.repeat(512)}:mode==='bad-google-avatar'?{picture:'https://evil.invalid/photo.png'}:{}),
  }
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(
      mode === 'issuer'
        ? 'https://other.invalid'
        : 'https://accounts.google.com',
    )
    .setAudience(mode === 'audience' ? 'other-client' : 'google-test-client')
    .setSubject('google-user-1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(mode === 'signature' ? other.privateKey : keys.privateKey)
  const calls: URL[] = []
  const fetcher: typeof fetch = async (raw, options) => {
    const url = new URL(String(raw))
    calls.push(url)
    if (url.pathname.includes('.well-known'))
      return Response.json(
        url.hostname === 'discord.com'
          ? {
              issuer: 'https://discord.com',
              authorization_endpoint:
                'https://discord.com/api/oauth2/authorize',
              token_endpoint: 'https://discord.com/api/oauth2/token',
              userinfo_endpoint: 'https://discord.com/api/oauth2/userinfo',
              jwks_uri: 'https://discord.com/api/oauth2/keys',
              response_types_supported: ['code'],
              subject_types_supported: ['public'],
              id_token_signing_alg_values_supported: ['RS256'],
              code_challenge_methods_supported: ['S256'],
              authorization_response_iss_parameter_supported: true,
            }
          : {
              issuer: 'https://accounts.google.com',
              authorization_endpoint:
                'https://accounts.google.com/o/oauth2/v2/auth',
              token_endpoint: 'https://oauth2.googleapis.com/token',
              jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
              response_types_supported: ['code'],
              subject_types_supported: ['public'],
              id_token_signing_alg_values_supported: ['RS256'],
              code_challenge_methods_supported: ['S256'],
            },
      )
    if (url.pathname.endsWith('/certs') || url.pathname.endsWith('/keys'))
      return Response.json({ keys: [jwk] })
    if (url.hostname === 'oauth2.googleapis.com') {
      const body = new URLSearchParams(String(options?.body))
      assert.equal(body.get('code_verifier'), input.verifier)
      return Response.json({
        access_token: 'fixture-google-access',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: token,
      })
    }
    if (url.pathname === '/api/oauth2/token')
      return Response.json({
        access_token: 'fixture-discord-access',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'identify email',
      })
    if (url.pathname === '/api/v10/users/@me') {
      assert.equal(
        new Headers(options?.headers).get('authorization'),
        'Bearer fixture-discord-access',
      )
      return Response.json({
        id: '123456789',
        username: 'creator',
        global_name: 'Creator',
        email: 'creator@example.invalid',
        verified: true,
        discriminator: '0',
        ...(mode==='avatar'?{avatar:'a_'+'b'.repeat(32)}:{}),
      })
    }
    throw Error('Unexpected provider request')
  }
  return { client: new OAuthProviders(config, fetcher), calls }
}
test('provider adapter uses Google PKCE/OIDC verification and returns only verified identity', async () => {
  const { client } = await fixture()
  const url = await client.authorizationUrl('google', input)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('nonce'), input.nonce)
  const profile = await client.exchange(
    'google',
    new URL(input.redirectUri + '?code=provider-code&state=' + input.state),
    input,
  )
  assert.equal(profile.subject, 'google-user-1')
  assert.equal(profile.emailVerified, true)
  assert.equal(
    (profile as unknown as Record<string, unknown>).access_token,
    undefined,
  )
})
for (const mode of ['issuer', 'audience', 'nonce', 'signature'])
  test('provider adapter rejects Google ' + mode + ' mismatch', async () => {
    const { client } = await fixture(mode)
    await assert.rejects(
      () =>
        client.exchange(
          'google',
          new URL(
            input.redirectUri + '?code=provider-code&state=' + input.state,
          ),
          input,
        ),
      /OAUTH_PROVIDER_INVALID/,
    )
  })
test('provider adapter verifies Discord response issuer and obtains identity from authenticated profile', async () => {
  const { client } = await fixture()
  const info = {
    ...input,
    redirectUri: 'http://127.0.0.1:4300/v1/auth/oauth/discord/callback',
  }
  const url = await client.authorizationUrl('discord', info)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  const profile = await client.exchange(
    'discord',
    new URL(
      info.redirectUri +
        '?code=provider-code&state=' +
        input.state +
        '&iss=https%3A%2F%2Fdiscord.com',
    ),
    info,
  )
  assert.equal(profile.subject, '123456789')
  assert.equal(profile.provider, 'discord')
})
test('provider adapter fails closed without registrations', async () => {
  const client = new OAuthProviders(readAuthConfig(authEnv()))
  assert.equal(client.available('google'), false)
  await assert.rejects(
    () => client.authorizationUrl('google', input),
    /OAUTH_PROVIDER_NOT_CONFIGURED/,
  )
})

for (const mode of ['avatar','default-avatar']) test('Discord supplies a safe CDN '+mode,async()=>{const {client}=await fixture(mode),info={...input,redirectUri:'http://127.0.0.1:4300/v1/auth/oauth/discord/callback'};const profile=await client.exchange('discord',new URL(info.redirectUri+'?code=fixture&state='+input.state+'&iss=https%3A%2F%2Fdiscord.com'),info);assert.equal((profile as any).avatarUrl,mode==='avatar'?'https://cdn.discordapp.com/avatars/123456789/a_'+ 'b'.repeat(32)+'.png?size=128':'https://cdn.discordapp.com/embed/avatars/5.png')})

for(const mode of ['google-avatar','bad-google-avatar','long-google-avatar'])test('Google validated identity handles '+mode,async()=>{const {client}=await fixture(mode);const profile=await client.exchange('google',new URL(input.redirectUri+'?code=fixture&state='+input.state),input);assert.equal(profile.avatarUrl,mode==='google-avatar'?'https://lh3.googleusercontent.com/a/profile=s96-c':undefined)})
