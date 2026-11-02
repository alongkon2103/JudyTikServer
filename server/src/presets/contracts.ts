import {normalizeShortcut,shortcutIdentity,reservedShortcut} from '../../../shared/shortcuts.js'
import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { assertContract } from '../auth/contracts.js'
import { ApiError } from '../http/api-error.js'
import type { components } from '../contracts/cloud-v1.js'
const canonical = JSON.parse(
  readFileSync(
    new URL('../../contracts/cloud-v1.openapi.json', import.meta.url),
    'utf8',
  ),
)
const queryAjv = new Ajv2020({
  strict: false,
  coerceTypes: true,
  useDefaults: true,
})
addFormats.default(queryAjv)
const parameters = canonical.paths['/presets'].get.parameters
type ListQuery = { limit: number; after?: string; collectionRevision?: string }
const queryCheck = queryAjv.compile<ListQuery>({
  type: 'object',
  properties: Object.fromEntries(
    parameters.map((p: { name: string; schema: unknown }) => [
      p.name,
      p.schema,
    ]),
  ),
  additionalProperties: false,
})
export function parseList(input: unknown): {
  limit: number
  after?: string
  collectionRevision?: string
} {
  const value = structuredClone(input)
  if (!queryCheck(value) || (value.after && !value.collectionRevision))
    throw new ApiError(400, 'INVALID_REQUEST')
  return value
}
export type Precondition =
  | { kind: 'create' }
  | { kind: 'match'; revision: bigint }
export function precondition(
  match: unknown,
  none: unknown,
  allowCreate = true,
): Precondition {
  if (match === undefined && none === undefined)
    throw new ApiError(428, 'PRECONDITION_REQUIRED')
  if (match !== undefined && none !== undefined)
    throw new ApiError(400, 'INVALID_PRECONDITION')
  if (none !== undefined) {
    if (!allowCreate || none !== '*')
      throw new ApiError(400, 'INVALID_PRECONDITION')
    return { kind: 'create' }
  }
  if (typeof match !== 'string' || !/^"(0|[1-9][0-9]{0,18})"$/.test(match))
    throw new ApiError(400, 'INVALID_PRECONDITION')
  return { kind: 'match', revision: BigInt(match.slice(1, -1)) }
}
export function validatePreset(
  input: unknown,
): components['schemas']['PresetWrite'] {
  let size: number
  try {
    size = Buffer.byteLength(JSON.stringify(input))
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST')
  }
  if (size > 262144) throw new ApiError(413, 'REQUEST_TOO_LARGE')
  const body = assertContract('PresetWrite', input),
    ids = new Set<string>(),hotkeys=new Set<string>()
  if (!body.name.trim()) throw new ApiError(400, 'INVALID_PRESET')
  for (const rule of body.actions) {
    if (
      ids.has(rule.id) ||
      !rule.name.trim() ||
      (rule.trigger === 'hotkey' && !rule.hotkey.trim()) ||
      (rule.trigger !== 'gift' && rule.giftId !== '')
    )
      throw new ApiError(400, 'INVALID_PRESET')
    ids.add(rule.id)
    if (rule.trigger === 'gift' && rule.giftId!=='*' && !/^[1-9][0-9]{0,19}$/.test(rule.giftId))
      throw new ApiError(400, 'GIFT_NOT_FOUND')
    if(rule.trigger==='hotkey'){try{normalizeShortcut(rule.hotkey);if(reservedShortcut(rule.hotkey))throw Error();if(rule.enabled)for(const platform of ['win32','darwin']){const key=platform+shortcutIdentity(rule.hotkey,platform);if(hotkeys.has(key))throw Error();hotkeys.add(key)}}catch{throw new ApiError(400,'INVALID_HOTKEY')}}
    for (const effect of rule.effects)
      if (effect.kind === 'webhook') {
        let url: URL
        try {
          url = new URL(effect.url)
        } catch {
          throw new ApiError(400, 'INVALID_PRESET')
        }
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.hash ||
          (effect.method === 'GET' && effect.body !== undefined)
        )
          throw new ApiError(400, 'INVALID_PRESET')
      }
  }
  return {
    schemaVersion: 1,
    name: body.name.trim(),
    actions: body.actions.map((rule) => ({ ...rule, name: rule.name.trim() })),
  }
}
