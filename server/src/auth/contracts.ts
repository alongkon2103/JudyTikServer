import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { ApiError } from '../http/api-error.js'
import type { components } from '../contracts/cloud-v1.js'
export type Provider = components['schemas']['Provider']
export type AttemptRequest = components['schemas']['AuthAttemptRequest']
const original = JSON.parse(
  readFileSync(
    new URL('../../contracts/cloud-v1.openapi.json', import.meta.url),
    'utf8',
  ),
)
const ajv = new Ajv2020({ strict: false, allErrors: false })
addFormats.default(ajv)
ajv.addSchema({
  $id: 'urn:judytik:cloud-v1',
  components: original.components,
  consent:
    original.paths['/auth/desktop/authorize'].post.requestBody.content[
      'application/x-www-form-urlencoded'
    ].schema,
})
export function assertContract<K extends keyof components['schemas']>(
  name: K,
  input: unknown,
): components['schemas'][K] {
  const validate = ajv.getSchema(
    'urn:judytik:cloud-v1#/components/schemas/' + name,
  )
  if (!validate || !validate(input)) throw new ApiError(400, 'INVALID_REQUEST')
  return input as components['schemas'][K]
}
export function parseAttemptRequest(input: unknown): AttemptRequest {
  const body = assertContract('AuthAttemptRequest', input)
  let url: URL
  try {
    url = new URL(body.redirectUri)
  } catch {
    throw new ApiError(400, 'INVALID_REDIRECT_URI')
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    Number(url.port) < 1024 ||
    Number(url.port) > 65535 ||
    url.pathname !== '/oauth/callback' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.toString() !== body.redirectUri
  )
    throw new ApiError(400, 'INVALID_REDIRECT_URI')
  if (!body.deviceLabel.trim()) throw new ApiError(400, 'INVALID_REQUEST')
  return { ...body, deviceLabel: body.deviceLabel.trim() }
}

export function parseConsent(input: unknown): {
  attemptId: string
  csrfToken: string
} {
  const validate = ajv.getSchema('urn:judytik:cloud-v1#/consent')
  if (!validate || !validate(input)) throw new ApiError(400, 'INVALID_REQUEST')
  return input as { attemptId: string; csrfToken: string }
}
