export const FREE_ACTION_LIMIT=10
export const PRO_WIDGETS=Object.freeze(['slider','big-gift','video','timer','gift-jar'])
export function hasProAccess(entitlement,now=Date.now()){
 if(!entitlement||entitlement.plan!=='PRO'||!['active','expiring'].includes(entitlement.state)||typeof entitlement.expiresAt!=='string')return false
 const until=Date.parse(entitlement.expiresAt),server=Date.parse(entitlement.serverTime)
 return Number.isFinite(until)&&Number.isFinite(server)&&until>Math.max(now,server)
}
export function widgetNeedsPro(kind){return PRO_WIDGETS.includes(kind)}
