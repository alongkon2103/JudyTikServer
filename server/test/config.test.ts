import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig } from '../src/config/env.js'
const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://runtime:dev_only@127.0.0.1:5432/test',
  ADMIN_API_KEY: 'a'.repeat(43),
}
test('config accepts dev DB without Euler key or migration credentials', () => {
  const config = readConfig(base)
  assert.equal(config.port, 4300)
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.adminApiKey, base.ADMIN_API_KEY)
})
for (const [label, overrides, key] of [
  ['missing DB', { DATABASE_URL: '' }, 'DATABASE_URL'],
  [
    'placeholder DB',
    { DATABASE_URL: 'postgresql://runtime:YOUR_PASSWORD@localhost/db' },
    'DATABASE_URL',
  ],
  [
    'wrong URL protocol',
    { DATABASE_URL: 'https://runtime:password@example.invalid/db' },
    'DATABASE_URL',
  ],
  [
    'remote DB without verified TLS',
    { DATABASE_URL: 'postgresql://runtime:password@example.invalid/db' },
    'DATABASE_URL',
  ],
  [
    'production owner role',
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:password@localhost/db',
    },
    'DATABASE_URL',
  ],
  ['invalid port', { PORT: '0' }, 'PORT'],
  ['fractional port', { PORT: '4300.2' }, 'PORT'],
  ['unknown NODE_ENV', { NODE_ENV: 'prod' }, 'NODE_ENV'],
  [
    'placeholder admin key',
    { ADMIN_API_KEY: 'YOUR_RANDOM_ADMIN_SERVICE_KEY' },
    'ADMIN_API_KEY',
  ],
] as const)
  test(`config rejects ${label} and names only the variable`, () => {
    const env = { ...base, ...overrides }
    assert.throws(
      () => readConfig(env),
      (error) => {
        assert(error instanceof Error)
        assert.match(error.message, new RegExp(key))
        if (env.DATABASE_URL) assert(!error.message.includes(env.DATABASE_URL))
        return true
      },
    )
  })

test('proxy configuration is explicit and restricted to local reverse proxies',()=>{
 assert.equal(readConfig(base).trustProxy,false)
 assert.equal(readConfig({...base,TRUST_PROXY:'false'}).trustProxy,false)
 assert.equal(readConfig({...base,TRUST_PROXY:'loopback'}).trustProxy,'loopback')
 for(const TRUST_PROXY of ['true','1','uniquelocal','0.0.0.0/0','loopback, 10.0.0.0/8'])assert.throws(()=>readConfig({...base,TRUST_PROXY}),/Invalid TRUST_PROXY/)
})
