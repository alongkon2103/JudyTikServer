import { HttpException } from '@nestjs/common'
export class ApiError extends HttpException {
  readonly code: string
  constructor(status: number, code: string, message: string = code) {
    super({ code, message }, status)
    this.code = code
    this.message = code
  }
}
