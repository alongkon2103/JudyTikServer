import { z } from 'zod';
import { parseKeyboardKeys } from '../../../shared/keyboard.js';
import { ApiError } from '../http/api-error.js';
import { validatePreset } from '../presets/contracts.js';
import type { components } from '../contracts/cloud-v1.js';
const integer = (max: number, min = 0) => z.number().int().min(min).max(max);
const trigger = z.discriminatedUnion('type', [
    z.object({ type: z.literal('gift'), giftId: integer(Number.MAX_SAFE_INTEGER, 1).optional(), giftName: z.string().max(160), minDiamonds: integer(1000000), repeatCombo: z.literal(true) }).strict(),
    z.object({ type: z.literal('like'), likeMode: z.enum(['total', 'perUser']), likeThreshold: integer(1000000, 1) }).strict(),
    z.object({ type: z.literal('follow') }).strict(),
]);
const response = z.discriminatedUnion('type', [
    z.object({ type: z.literal('keypress'), key: z.string().min(1).max(40), modifiers: z.array(z.enum(['ctrl', 'alt', 'shift', 'meta'])).max(3), holdMs: z.literal(0) }).strict(),
    // An empty source wheel has no result or side effect; never invent a replacement command.
    z.object({ type: z.literal('randomWheel'), branches: z.array(z.object({ prize: z.literal(''), responses: z.array(z.never()).length(0) }).strict()).min(1).max(100) }).strict(),
]);
const sourceAction = z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(80), enabled: z.boolean(), cooldownSec: integer(3600), trigger, responses: z.array(response).min(1).max(20) }).strict();
const source = z.object({ schemaVersion: z.literal(1), sourceFormat: z.literal('tikkies-actions-v1'), actions: z.array(sourceAction).max(100) });
const incompatible = () => new ApiError(422, 'GAME_PRESET_INCOMPATIBLE');
export type GiftIdentity = { id: string; nameOverride: string | null; aliases: string[]; regions: { providerName: string }[] };
const giftName = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function convertGamePreset(format: string, payload: unknown, name: string, gifts?: GiftIdentity[]) {
    if (format === 'action-preset-v1') return { payload: validatePreset({ ...validatePreset(payload), name }), warnings: [] as string[], skippedActions: 0 };
    if (format !== 'game-event-v1') throw incompatible();
    const parsed = source.safeParse(payload);
    if (!parsed.success) throw incompatible();
    const ids = new Set<string>(), warnings: string[] = [], actions: components['schemas']['ActionRule'][] = [];
    let skippedActions = 0;
    for (const rule of parsed.data.actions) {
        if (ids.has(rule.id)) throw incompatible();
        ids.add(rule.id);
        const effects: components['schemas']['Effect'][] = [], reasons: string[] = [];
        let emptyWheel = false, unavailableGift = false;
        for (const item of rule.responses) {
            if (item.type === 'randomWheel') {
                emptyWheel = true;
                continue;
            }
            try {
                const modifiers = item.modifiers.map(key => ({ ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta' })[key]);
                effects.push({ kind: 'keyboard', keys: parseKeyboardKeys([...modifiers, item.key].join(' + ')) as components['schemas']['KeyName'][] });
            } catch { throw incompatible(); }
        }
        if (emptyWheel) reasons.push('ข้ามวงล้อว่างเพราะต้นฉบับไม่มีคำสั่งผลลัพธ์');
        const t = rule.trigger;
        let giftId = '';
        if (t.type === 'gift' && (effects.length || t.giftId !== undefined)) {
            if (t.giftId !== undefined) {
                giftId = String(t.giftId);
                if (gifts && !gifts.some(gift => gift.id === giftId)) {
                    reasons.push(`ข้าม ${t.giftName} (ID ${giftId}) เพราะไม่มีรหัสนี้ในรายการของขวัญปัจจุบัน กรุณาตั้งค่าใหม่`);
                    unavailableGift = true;
                }
            } else {
                const matches = gifts?.filter(gift => [gift.nameOverride, ...gift.aliases, ...gift.regions.map(region => region.providerName)].some(name => name !== null && giftName(name) === giftName(t.giftName))) ?? [];
                if (matches.length !== 1) throw new ApiError(422, matches.length ? 'GAME_GIFT_AMBIGUOUS' : 'GAME_GIFT_NOT_FOUND');
                giftId = matches[0].id;
            }
        }
        if (reasons.length) warnings.push(`รายการ ${rule.name} (${rule.id}): ${reasons.join(' · ')}`);
        if (!effects.length || unavailableGift) { skippedActions++; continue; }
        actions.push({ id: rule.id, name: rule.name, enabled: rule.enabled, trigger: t.type,
            giftId, threshold: t.type === 'like' ? t.likeThreshold : 1,
            minCoins: t.type === 'gift' ? t.minDiamonds : 0, cooldownSeconds: rule.cooldownSec,
            comboMode: 'each-event', commentMatch: '', hotkey: '', effects,
            ...(t.type === 'like' ? { likeScope: t.likeMode === 'total' ? 'room' as const : 'user' as const } : {}) });
    }
    try { return { payload: validatePreset({ schemaVersion: 1, name, actions }), warnings, skippedActions }; }
    catch { throw incompatible(); }
}
