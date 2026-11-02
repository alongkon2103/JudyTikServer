export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        LiveAuthorizationRequest: {
            username: string;
        };
        LiveAuthorization: {
            /** @constant */
            mode: "community";
            username: string;
        } | {
            /** @constant */
            mode: "jwt";
            username: string;
            token: string;
            /** Format: date-time */
            expiresAt: string;
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
