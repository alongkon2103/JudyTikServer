import 'reflect-metadata'
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { readConfig } from './config/env.js'
import { configureApp } from './http/configure.js'
async function main() {
  const config = readConfig(process.env)
  const app = configureApp(
    await NestFactory.create<NestExpressApplication>(
      AppModule.register(config),
      { logger: ['log', 'warn', 'error'] },
    ),
    config.trustProxy,
  )
  app.enableShutdownHooks()
  await app.listen(config.port, config.host)
  console.log(
    `JudyTik API listening at http://${config.host}:${config.port}/v1`,
  )
}
main().catch((error) => {
  const message =
    error instanceof Error && /^Invalid [A-Z_]+;/.test(error.message)
      ? error.message
      : 'JudyTik API startup failed; check server configuration and database connectivity'
  console.error(message)
  process.exitCode = 1
})
