import {Body,Controller,Delete,Get,HttpCode,Inject,Param,Post,Put,Req,UseGuards} from '@nestjs/common';
import {SessionGuard,type SessionRequest} from '../auth/session.guard.js';
import {AppPresenceService} from './service.js';
@Controller('me/app-presence')
@UseGuards(SessionGuard)
export class AppPresenceController {
 constructor(@Inject(AppPresenceService) private readonly presence:AppPresenceService){}
 @Post() @HttpCode(200) start(@Req() r:SessionRequest,@Body() b:unknown){return this.presence.start(r.verifiedSession,b);}
 @Put(':connectionId') heartbeat(@Req() r:SessionRequest,@Param('connectionId') id:string,@Body() b:unknown){return this.presence.heartbeat(r.verifiedSession,id,b);}
 @Delete(':connectionId') @HttpCode(204) stop(@Req() r:SessionRequest,@Param('connectionId') id:string){return this.presence.stop(r.verifiedSession,id);}
}
@Controller('app-presence')
@UseGuards(SessionGuard)
export class AppPresenceCountController {
 constructor(@Inject(AppPresenceService) private readonly presence:AppPresenceService){}
 @Get('count') count(@Req() r:SessionRequest){return this.presence.count(r.verifiedSession);}
}
