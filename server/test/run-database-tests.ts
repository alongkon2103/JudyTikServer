import {
  mkdtemp,
  mkdir,
  copyFile,
  symlink,
  rm,
  access,
  readdir,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Client } from 'pg'
const run = (file: string, args: string[], env = process.env) => {
  const r = spawnSync(file, args, { env, encoding: 'utf8' })
  if (r.status !== 0)
    throw new Error(
      `${file.split('/').at(-1)} failed: ${r.stderr?.slice(-2000)} ${r.stdout?.slice(-2000)}`,
    )
  return r.stdout
}
let cleanup: () => Promise<void> = async () => {}
let owner: Client | undefined
try {
  let admin = process.env.TEST_DATABASE_URL
  if (admin) {
    const u = new URL(admin)
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
      !u.pathname.slice(1).endsWith('_test')
    )
      throw new Error(
        'TEST_DATABASE_URL must be a disposable localhost database ending in _test',
      )
  } else {
    let bin = process.env.PG_BIN
    if (!bin) {
      const pgConfig = spawnSync('pg_config', ['--bindir'], {
        encoding: 'utf8',
      })
      if (pgConfig.status === 0) bin = pgConfig.stdout.trim()
    }
    if (!bin)
      for (const root of [
        '/usr/local/Cellar/postgresql@18',
        '/opt/homebrew/Cellar/postgresql@18',
      ]) {
        try {
          const versions = await readdir(root)
          bin = join(root, versions.sort().at(-1)!, 'bin')
          break
        } catch {}
      }
    if (!bin)
      throw new Error(
        'Set PG_BIN to PostgreSQL binaries or TEST_DATABASE_URL to a disposable local database',
      )
    const source = dirname(bin),
      base = await mkdtemp(join(tmpdir(), 'judytik-server-db-')),
      socket = join(base, 'socket')
    await mkdir(socket, { mode: 0o700 })
    let testBin = bin
    let share: string
    let lib: string
    if (source.includes('/Cellar/')) {
      const relative = source.slice(source.indexOf('/Cellar/') + 1)
      testBin = join(base, 'runtime', relative, 'bin')
      await mkdir(testBin, { recursive: true })
      for (const name of ['initdb', 'postgres', 'pg_ctl'])
        await copyFile(join(bin, name), join(testBin, name))
      share = join(source, 'share/postgresql')
      lib = join(source, 'lib/postgresql')
      for (const kind of ['share', 'lib']) {
        await mkdir(join(base, 'runtime', kind))
        await symlink(
          join(source, kind, 'postgresql'),
          join(base, 'runtime', kind, source.split('/').at(-2)!),
        )
      }
    } else {
      share = run(join(bin, 'pg_config'), ['--sharedir']).trim()
      lib = run(join(bin, 'pg_config'), ['--pkglibdir']).trim()
    }
    await access(join(share, 'postgres.bki'))
    let started = false
    cleanup = async () => {
      if (started)
        run(join(testBin, 'pg_ctl'), [
          '-D',
          join(base, 'data'),
          '-m',
          'immediate',
          '-w',
          'stop',
        ])
      await rm(base, { recursive: true, force: true })
    }
    run(join(testBin, 'initdb'), [
      '-L',
      share,
      '-D',
      join(base, 'data'),
      '-A',
      'trust',
      '-U',
      'postgres',
      '--no-locale',
      '-E',
      'UTF8',
      '-c',
      'timezone=GMT',
      '-c',
      'log_timezone=GMT',
      '-c',
      `dynamic_library_path=${lib}`,
    ])
    run(join(testBin, 'pg_ctl'), [
      '-D',
      join(base, 'data'),
      '-l',
      join(base, 'server.log'),
      '-o',
      `-k ${socket} -c listen_addresses='' -c dynamic_library_path=${lib} -p 55493`,
      '-w',
      'start',
    ])
    started = true
    admin = `postgresql://postgres:unused@localhost:55493/postgres?host=${encodeURIComponent(socket)}`
  }
  owner = new Client({ connectionString: admin })
  await owner.connect()
  try {
    await owner.query(
      `CREATE ROLE judytik_test_runtime LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'unused_test_only'`,
    )
  } catch (error) {
    if ((error as { code?: string }).code !== '42710') throw error
  }
  const runtime = new URL(admin)
  runtime.username = 'judytik_test_runtime'
  runtime.password = 'unused_test_only'
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DIRECT_URL: admin,
    DATABASE_URL: runtime.toString(),
    TEST_ADMIN_DATABASE_URL: admin,
    ADMIN_API_KEY: 'test_admin_key_'.repeat(4),
  }
  run(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    env,
  )
  const second = run(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    env,
  )
  if (!second.includes('No pending migrations'))
    throw new Error('Second migration deploy was not a no-op')
  const grants = (await import('node:fs/promises')).readFile
  const sql = (await grants('prisma/runtime-grants.sql', 'utf8')).replaceAll(
    ':"runtime_role"',
    '"judytik_test_runtime"',
  )
  await owner.query(sql)
  await owner.end()
  console.log(
    'Disposable database ready; migrations applied, second deploy is a no-op; restricted runtime role granted.',
  )
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=1',
      ...[
      'test/database.integration.ts',
      'test/gifts.integration.ts',
      'test/games.integration.ts',
      'test/game-files.integration.ts',
      'test/auth.integration.ts',
      'test/accounts.integration.ts',
      'test/account-linking.integration.ts',
      'test/entitlements-admin.integration.ts',
      'test/admin-users.integration.ts',
      'test/direct-launch.integration.ts',
      'test/presets.integration.ts',
      'test/presets-http.integration.ts',
      'test/win.integration.ts',
      'test/soundpad.integration.ts',
      'test/tts.integration.ts',
      'test/overlays.integration.ts',
      'test/auth-http.integration.ts',
      'test/history.integration.ts',
      'test/deployment.integration.ts',
      ],
    ],
    { env, stdio: 'inherit' },
  )
  process.exitCode = result.status ?? 1
} finally {
  await owner?.end().catch(() => {})
  await cleanup()
}
