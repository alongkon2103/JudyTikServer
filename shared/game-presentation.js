const platforms={roblox:'Roblox',unity:'Unity',pc:'PC'}
export function normalizeGamePlatform(value){const text=typeof value==='string'?value.trim():'';return platforms[text.toLowerCase()]??text}
export function platformCategoryId(categories,platform){const key=normalizeGamePlatform(platform).toLowerCase();return categories.find(category=>category.slug.toLowerCase()===key||category.name.trim().toLowerCase()===key)?.id??null}
export function shopGameUrl(slug){return typeof slug==='string'&&slug.length<=80&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)?'https://judygamestudio.com/products/'+slug:null}
export function isShopGameUrl(value){try{const url=new URL(value);return url.origin==='https://judygamestudio.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&value===shopGameUrl(url.pathname.slice('/products/'.length))}catch{return false}}
