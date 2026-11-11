import {randomUUID} from 'node:crypto'
import type {PrismaService} from '../../src/database/prisma.service.js'
import {systemClock,type Clock} from '../../src/auth/clock.js'
import {EntitlementsAdminService} from '../../src/entitlements/admin.service.js'

// Explicit opt-in for integration tests whose subject is a PRO-only feature.
// Keep authHarness FREE by default to test authorization and downgrade behavior.
export async function grantTestPro(db:PrismaService,userId:string,clock:Clock=systemClock){
 await new EntitlementsAdminService(db,clock).mutate('adjust',{userId,days:30,source:'test',reason:'PRO feature integration fixture'},randomUUID(),randomUUID())
}
