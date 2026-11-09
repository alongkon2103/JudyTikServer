import {Inject,Injectable} from '@nestjs/common'
import {PrismaService} from '../database/prisma.service.js'
import type {Prisma} from '../generated/prisma/client.js'
import {CLOCK,type Clock} from '../auth/clock.js'
import {entitlementState} from '../entitlements/entitlements.service.js'
import {parseAdminUsersQuery} from './admin.contracts.js'

@Injectable()
export class AdminUsersService{
 constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(CLOCK) private readonly clock:Clock){}

 async list(input:unknown){
  const query=parseAdminUsersQuery(input),now=this.clock.now()
  const active:Prisma.EntitlementGrantWhereInput={plan:'PRO',revokedAt:null,startsAt:{lte:now},endsAt:{gt:now}}
  const where:Prisma.UserWhereInput={mergedIntoId:null}
  if(query.email)where.email={is:{emailKey:{contains:query.email.replace(/[\\%_]/g,'\\$&'),mode:'insensitive'}}}
  if(query.plan)where.entitlements=query.plan==='PRO'?{some:active}:{none:active}

  return this.db.client.$transaction(async tx=>{
   const total=await tx.user.count({where})
   const rows=await tx.user.findMany({
    where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(query.page-1)*query.pageSize,take:query.pageSize,
    select:{
     id:true,displayName:true,avatarUrl:true,createdAt:true,disabledAt:true,
     email:{select:{emailKey:true}},identities:{select:{provider:true}},
     entitlements:{where:{plan:'PRO',revokedAt:null,startsAt:{lte:now}},orderBy:{endsAt:'desc'},take:1,select:{endsAt:true}},
    },
   })
   return{
    items:rows.map(row=>({
     userId:row.id,displayName:row.displayName,avatarUrl:row.avatarUrl,email:row.email?.emailKey??null,
     providers:[...new Set(row.identities.map(identity=>identity.provider))],
     createdAt:row.createdAt.toISOString(),disabledAt:row.disabledAt?.toISOString()??null,
     entitlement:entitlementState(row.entitlements[0]?.endsAt??null,now),
    })),
    page:query.page,pageSize:query.pageSize,total,totalPages:Math.ceil(total/query.pageSize),serverTime:now.toISOString(),
   }
  },{isolationLevel:'RepeatableRead'})
 }
}
