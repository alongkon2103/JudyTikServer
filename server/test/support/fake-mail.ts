import { VerificationMailer } from '../../src/accounts/mailer.js'
export class FakeMailer extends VerificationMailer {
  sent: { recipient: string; code: string; expiresAt: Date }[] = []
  fail = false
  constructor() {
    super(undefined)
  }
  override configured() {
    return true
  }
  override async send(recipient: string, code: string, expiresAt: Date) {
    if (this.fail) throw Error('SMTP unavailable')
    this.sent.push({ recipient, code, expiresAt })
  }
}
