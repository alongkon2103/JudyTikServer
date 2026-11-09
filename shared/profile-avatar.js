const domains=['tiktokcdn.com','tiktokcdn-us.com','tiktokcdn-eu.com','byteoversea.com','ibytedtos.com','muscdn.com']
export function safeProfileAvatar(value){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f]/.test(value))return false
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&domains.some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain))}catch{return false}
}
export function profileAvatar(user){
 if(!user||typeof user!=='object')return
 for(const source of [user.avatarThumb,user.avatarMedium,user.avatarLarge,user.avatarLarger,user.profilePictureUrl,user.avatarUrl,user.profilePictureUrls]){
  const urls=typeof source==='string'?[source]:Array.isArray(source)?source:source?.urlList??source?.urls??(Array.isArray(source?.url)?source.url:[source?.url])
  if(Array.isArray(urls)){const url=urls.find(safeProfileAvatar);if(url)return url}
 }
}
