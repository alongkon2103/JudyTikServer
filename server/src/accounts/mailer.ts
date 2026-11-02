import nodemailer from 'nodemailer'
import type { AuthConfig } from '../auth/config.js'
export class VerificationMailer {
  constructor(private readonly config: AuthConfig | undefined) {}
  configured() {
    return !!this.config?.smtp
  }
  async send(recipient: string, code: string, expiresAt: Date): Promise<void> {
    const smtp = this.config?.smtp
    if (!smtp) throw new Error('EMAIL_NOT_CONFIGURED')
    const url = new URL(smtp.url)
    const transport = nodemailer.createTransport({
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'smtps:' ? 465 : 587),
      secure: url.protocol === 'smtps:',
      requireTLS: true,
      auth: url.username
        ? {
            user: decodeURIComponent(url.username),
            pass: decodeURIComponent(url.password),
          }
        : undefined,
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    try {
      await transport.sendMail({
        from: smtp.from,
        to: recipient,
        subject: 'รหัสยืนยันอีเมล JudyTik',
        text: `รหัสยืนยันของคุณคือ ${code}\nรหัสหมดอายุ ${expiresAt.toISOString()}\nหากไม่ได้ขอรหัสนี้ ให้ข้ามอีเมลฉบับนี้ได้`,
      })
    } finally {
      transport.close()
    }
  }
}
