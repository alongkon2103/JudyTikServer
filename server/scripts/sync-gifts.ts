import 'dotenv/config'
const port = process.env.PORT ?? '4300',
  key = process.env.ADMIN_API_KEY
if (!key) throw new Error('Missing ADMIN_API_KEY')
try {
  const result = await fetch(`http://127.0.0.1:${port}/v1/admin/gifts/sync`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90000),
  })
  console.log(JSON.stringify(await result.json(), null, 2))
  if (!result.ok) process.exitCode = 1
} catch {
  console.error('Gift sync failed; check the running local API and database')
  process.exitCode = 1
}
