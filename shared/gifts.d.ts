export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Gift: {
            id: string;
            /** @enum {string} */
            region: "TH" | "US";
            regions: ("TH" | "US")[];
            name: string;
            providerName: string;
            coins: number;
            /** Format: uri */
            imageUrl: string;
            combo: boolean;
            aliases: string[];
            enabled: boolean;
            revision: string;
            /** Format: date-time */
            sourceObservedAt: string;
        };
        GiftPage: {
            items: {
                id: string;
                /** @enum {string} */
                region: "TH" | "US";
                regions: ("TH" | "US")[];
                name: string;
                providerName: string;
                coins: number;
                /** Format: uri */
                imageUrl: string;
                combo: boolean;
                aliases: string[];
                enabled: boolean;
                revision: string;
                /** Format: date-time */
                sourceObservedAt: string;
            }[];
            total: number;
            page: number;
            pageSize: number;
            totalPages: number;
            catalogRevision: string;
            lastSyncedAt: string | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
