export interface LiveConfig {
  apiKey: string
  accountId: number
}
const invalid = (name: string): never => {
  throw new Error(`Invalid ${name}; check server live configuration`)
}
export function readLiveConfig(env: NodeJS.ProcessEnv): LiveConfig | undefined {
  const apiKey = env.EULER_API_KEY?.trim() ?? ''
  const account = env.EULER_ACCOUNT_ID?.trim() ?? ''
  if (!apiKey && !account) return undefined
  if (!/^[A-Za-z0-9_-]{20,512}$/.test(apiKey) || apiKey.startsWith('YOUR_'))
    invalid('EULER_API_KEY')
  const accountId = Number(account)
  if (!/^[1-9]\d{0,15}$/.test(account) || !Number.isSafeInteger(accountId))
    invalid('EULER_ACCOUNT_ID')
  return { apiKey, accountId }
}
