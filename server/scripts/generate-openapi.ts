import {addAppPresenceOpenApi} from '../src/app-presence/openapi.js'
import {addLivePresenceOpenApi} from '../src/live-presence/openapi.js'
import {addGamesOpenApi} from '../src/games/openapi.js'
import {addEntitlementsOpenApi} from '../src/entitlements/openapi.js'
import {addAccountMergeOpenApi} from '../src/accounts/merge.openapi.js'
import {addAdminUsersOpenApi} from '../src/accounts/admin.openapi.js'
import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import {
  querySchema,
  detailQuery,
  patchSchema,
  giftItemSchema,
  giftPageSchema,
  syncResultSchema,
} from '../src/gifts/contracts.js'
const original = JSON.parse(
  await readFile(
    new URL('../contracts/cloud-v1.openapi.json', import.meta.url),
    'utf8',
  ),
)
const schema = (value: z.ZodType) => {
  const { $schema, ...data } = z.toJSONSchema(value, {
    unrepresentable: 'throw',
  })
  return data
}
const ref = (name: string) => ({ $ref: '#/components/schemas/' + name })
const response = (name: string) => ({
  description: 'Success',
  content: { 'application/json': { schema: ref(name) } },
})
const errors = Object.fromEntries(
  [400, 401, 404, 409, 412, 413, 428, 429, 500, 503].map((code) => [
    code,
    {
      description: 'Error envelope; see README for operation codes',
      content: { 'application/json': { schema: ref('Error') } },
    },
  ]),
)
const parameters = (shape: Record<string, z.ZodType>) =>
  Object.entries(shape).map(([name, value]) => ({
    name,
    in: 'query',
    required: false,
    schema: schema(value),
  }))
const giftId = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[1-9][0-9]{0,19}$' },
}
const query = parameters(querySchema.shape)
const listDescription =
  'Default region TH; US is the English-region catalog. A page after page 1 requires revision from the first response. Changed catalog returns 409 GIFT_CATALOG_CHANGED. Upstream names currently use English in both regions.'
const admin = [{ adminServiceKey: [] }]
const doc = {
  openapi: '3.1.1',
  info: {
    title: 'JudyTik Backend — Accounts, Auth and Gifts',
    version: '0.2.0',
    description:
      'Implemented Backend routes only. OAuth registrations and SMTP are required for external sign-in/email delivery; Desktop integration and Cloud preset/settings endpoints are separate steps.',
  },
  servers: [{ url: 'http://127.0.0.1:4300/v1' }],
  security: [],
  paths: {
    ...Object.fromEntries(
      Object.entries(original.paths)
        .filter(
          ([path]) =>
            path.startsWith('/auth/') ||
            path.startsWith('/me') || path.startsWith('/presets'),
        )
        .map(([path, item]) => [
          path,
          Object.fromEntries(
            Object.entries(item as Record<string, unknown>).map(
              ([method, operation]) => [
                method,
                {
                  ...(operation as object),
                  security:
                    (operation as { security?: unknown }).security ??
                    original.security,
                },
              ],
            ),
          ),
        ]),
    ),
    '/health': {
      get: {
        operationId: 'getHealth',
        summary: 'Process liveness',
        responses: { '200': response('Health'), ...errors },
      },
    },
    '/health/ready': {
      get: {
        operationId: 'getReadiness',
        summary: 'Database readiness',
        responses: { '200': response('Health'), ...errors },
      },
    },
    '/gifts': {
      get: {
        operationId: 'listGifts',
        summary: 'List enabled gifts',
        description: listDescription,
        parameters: query,
        responses: { '200': response('GiftPage'), ...errors },
      },
    },
    '/gifts/{id}': {
      get: {
        operationId: 'getGift',
        summary: 'Read one enabled gift in a region',
        parameters: [giftId, ...parameters(detailQuery.shape)],
        responses: { '200': response('Gift'), ...errors },
      },
    },
    '/admin/gifts': {
      get: {
        operationId: 'adminListGifts',
        summary: 'List gifts including disabled rows',
        description: listDescription,
        security: admin,
        parameters: query,
        responses: { '200': response('GiftPage'), ...errors },
      },
    },
    '/admin/gifts/sync': {
      post: {
        operationId: 'syncGifts',
        summary: 'Atomically refresh TH and US from the public Euler endpoint',
        description:
          'No Euler API key. A failed region/download leaves the previous snapshot intact. This requires the admin service credential.',
        security: admin,
        responses: { '201': response('GiftSync'), ...errors },
      },
    },
    '/admin/gifts/{id}': {
      patch: {
        operationId: 'patchGift',
        summary:
          'Edit admin overrides without changing upstream ID or coin price',
        security: admin,
        parameters: [
          giftId,
          {
            name: 'If-Match',
            in: 'header',
            required: true,
            schema: { type: 'string', pattern: '^"[1-9][0-9]{0,18}"$' },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('GiftPatch') } },
        },
        responses: {
          '200': {
            ...response('Gift'),
            headers: { ETag: { schema: { type: 'string' } } },
          },
          ...errors,
        },
      },
    },
  },
  components: {
    parameters: original.components.parameters,
    responses: original.components.responses,
    securitySchemes: {
      desktopSession: original.components.securitySchemes.desktopSession,
      adminServiceKey: {
        type: 'http',
        scheme: 'bearer',
        description:
          'Server/CLI service credential; never sent to Desktop or browser code.',
      },
    },
    schemas: {
      ...original.components.schemas,
      Health: {
        type: 'object',
        properties: { status: { const: 'ok', type: 'string' } },
        required: ['status'],
        additionalProperties: false,
      },
      Gift: schema(giftItemSchema),
      GiftPage: schema(giftPageSchema),
      GiftPatch: schema(patchSchema),
      GiftSync: schema(syncResultSchema),
    },
  },
}
addAppPresenceOpenApi(doc)
addLivePresenceOpenApi(doc)
addGamesOpenApi(doc)
addEntitlementsOpenApi(doc)
addAccountMergeOpenApi(doc)
addAdminUsersOpenApi(doc)
await writeFile(
  new URL('../openapi.json', import.meta.url),
  JSON.stringify(doc, null, 2) + '\n',
)
console.log(
  'Generated implemented Accounts/Auth/Presets/Settings/Gifts OpenAPI from canonical contracts',
)
