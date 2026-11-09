import {Controller,Get,Inject,Query,UseGuards} from '@nestjs/common'
import {AdminGuard} from '../http/admin.guard.js'
import {AdminUsersService} from './admin.service.js'

@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController{
 constructor(@Inject(AdminUsersService) private readonly service:AdminUsersService){}
 @Get() list(@Query() query:unknown){return this.service.list(query)}
}
