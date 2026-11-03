import { z } from 'zod'
import { giftItemSchema, giftPageSchema } from '../src/gifts/contracts.js'
import { liveAuthorizationRequestSchema, liveAuthorizationSchema } from '../src/live/contracts.js'
import openapiTS, { astToString } from 'openapi-typescript'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
// Allow targeted LIVE regeneration without rewriting the existing cloud/gift artifacts.
if (!process.argv.includes('--live-only')) {
  const source = new URL(
    '../contracts/cloud-v1.openapi.json',
    import.meta.url,
  )
  const schema = await readFile(source, 'utf8')
  const ast = await openapiTS(source, { defaultNonNullable: false })
  await mkdir(new URL('../contracts/', import.meta.url), { recursive: true })
  await writeFile(
    new URL('../contracts/cloud-v1.openapi.json', import.meta.url),
    schema,
  )
  await writeFile(
    new URL('../src/contracts/cloud-v1.d.ts', import.meta.url),
    astToString(ast),
  )
  await mkdir(new URL('../../shared/', import.meta.url), { recursive: true })
  await writeFile(
    new URL('../../shared/cloud-v1.openapi.json', import.meta.url),
    schema,
  )
  await writeFile(
    new URL('../../shared/cloud-v1.d.ts', import.meta.url),
    astToString(ast),
  )
  await writeFile(new URL('../../shared/keyboard-keys.json',import.meta.url),JSON.stringify(JSON.parse(schema).components.schemas.KeyName.enum,null,2)+'\n')
  console.log(
    'Generated canonical Backend and Desktop runtime contracts and TypeScript declarations',
  )

  if(process.argv.includes('--cloud-only'))process.exit(0)
  const giftContract = {
    openapi: '3.1.1',
    info: { title: 'JudyTik public gift metadata', version: '1.0.0' },
    paths: {},
    components: {
      schemas: {
        Gift: z.toJSONSchema(giftItemSchema),
        GiftPage: z.toJSONSchema(giftPageSchema),
      },
    },
  }
  const giftTarget = new URL('../../shared/gifts.openapi.json', import.meta.url)
  await writeFile(giftTarget, JSON.stringify(giftContract, null, 2) + '\n')
  await writeFile(
    new URL('../../shared/gifts.d.ts', import.meta.url),
    astToString(await openapiTS(giftTarget)),
  )
  console.log('Generated Desktop gift schemas/types from Backend Zod contracts')
}

const liveContract = {
  openapi: '3.1.1',
  info: { title: 'JudyTik Desktop live signing authorization', version: '1.0.0' },
  paths: {},
  components: {
    schemas: {
      LiveAuthorizationRequest: z.toJSONSchema(liveAuthorizationRequestSchema),
      LiveAuthorization: z.toJSONSchema(liveAuthorizationSchema),
    },
  },
}
await mkdir(new URL('../../shared/', import.meta.url), { recursive: true })
const liveTarget = new URL('../../shared/live-signing.openapi.json', import.meta.url)
await writeFile(liveTarget, JSON.stringify(liveContract, null, 2) + '\n')
await writeFile(
  new URL('../../shared/live-signing.d.ts', import.meta.url),
  astToString(await openapiTS(liveTarget)),
)
console.log('Generated Desktop live signing schemas/types from Backend Zod contracts')
