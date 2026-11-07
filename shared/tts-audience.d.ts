export type TtsAudience={everyone:boolean;followers:boolean;subscribers:boolean;moderators:boolean;teamMembers:boolean;minTeamLevel:number;gifters:boolean;minGifterLevel:number;topGifters:boolean;topCount:number}
export function defaultTtsAudience():TtsAudience
export function validTtsAudience(value:unknown):value is TtsAudience
export function ttsAudienceAllows(audience:TtsAudience|undefined,viewer?:{follower?:boolean;subscriber?:boolean;moderator?:boolean;teamLevel?:number;gifterLevel?:number;topRank?:number}):boolean
