import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { assertContract, parseAttemptRequest } from '../src/auth/contracts.js'
const good = {
  provider: 'google',
  codeChallenge: 'c'.repeat(43),
  codeChallengeMethod: 'S256',
  clientState: 's'.repeat(43),
  installationId: randomUUID(),
  deviceLabel: ' Creator PC ',
  platform: 'windows',
  redirectUri: 'http://127.0.0.1:43817/oauth/callback',
}
test('auth contract validates canonical native attempt and normalizes its label', () => {
  const result = parseAttemptRequest(good)
  assert.equal(result.deviceLabel, 'Creator PC')
  assert.equal(result.redirectUri, good.redirectUri)
})
for (const redirectUri of [
  'https://evil.invalid/oauth/callback',
  'http://localhost:43817/oauth/callback',
  'http://127.0.0.1:1000/oauth/callback',
  'http://127.0.0.1:99999/oauth/callback',
  'http://127.0.0.1:43817/oauth/callback?x=1',
  'http://127.0.0.1:43817/oauth/callback#x',
  'http://user@127.0.0.1:43817/oauth/callback',
])
  test('auth contract rejects unsafe redirect ' + redirectUri, () =>
    assert.throws(
      () => parseAttemptRequest({ ...good, redirectUri }),
      /INVALID_REQUEST|INVALID_REDIRECT_URI/,
    ),
  )
test('auth contract rejects injected owner/plan flags and mixed token grants', () => {
  for (const field of ['userId', 'plan', 'isPro'])
    assert.throws(
      () => parseAttemptRequest({ ...good, [field]: 'forged' }),
      /INVALID_REQUEST/,
    )
  assert.throws(
    () =>
      assertContract('TokenRequest', {
        grant_type: 'refresh_token',
        refresh_token: 'r'.repeat(43),
        code: 'c'.repeat(43),
      }),
    /INVALID_REQUEST/,
  )
  assert.throws(
    () => parseAttemptRequest({ ...good, deviceLabel: '   ' }),
    /INVALID_REQUEST/,
  )
})
