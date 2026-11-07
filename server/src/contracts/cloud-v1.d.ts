export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness only
         * @description Does not return database addresses, versions, environment or secrets.
         */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/desktop/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a PKCE-bound Desktop sign-in attempt
         * @description Limit 10/min/IP. Redirect URI must be exactly 127.0.0.1, port 1024–65535 and /oauth/callback, with no credentials/query/fragment. No network call to the supplied URI.
         */
        post: operations["startDesktopAuth"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/desktop/authorize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Show browser confirmation for a Desktop sign-in attempt
         * @description This is an authentication broker page, not the sales website. Does not automatically authorize an unconfirmed attempt.
         */
        get: operations["showDesktopAuthorization"];
        put?: never;
        /**
         * Confirm browser intent and redirect to the selected provider
         * @description Require matching browser CSRF token/cookie and an unexpired attempt. Redact form/token values from logs.
         */
        post: operations["confirmDesktopAuthorization"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/oauth/{provider}/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consume provider callback and issue one-time Desktop code
         * @description Validate/consume OAuth state atomically, browser binding and provider identity proof. Exactly one of code/error is allowed. Never merge identities solely by matching email. Ignore documented provider-specific auxiliary query fields; reject duplicate state/code/error and enforce exactly one of code/error before any exchange.
         */
        get: operations["completeProviderAuth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/desktop/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel a sign-in attempt with proof of its PKCE verifier
         * @description Cancel and grant exchange lock the same attempt row. Verify PKCE proof first. If cancellation wins, mark cancelled atomically and invalidate any issued but unconsumed grant; token exchange and later callbacks must reject it. If exchange already consumed the grant, return 409 AUTH_ATTEMPT_ALREADY_CONSUMED rather than claiming cancellation; cancelling an attempt is not session logout.
         */
        post: operations["cancelDesktopAuth"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exchange a one-use code or rotate a refresh token
         * @description Consume code/refresh in an atomic transaction. Authorization-code exchange locks the attempt row, checks cancelledAt is null, attempt and grant expiry, PKCE, redirect URI and unused grant before creating a session and consuming the grant atomically. Cancel and exchange serialize on this row; cancelled grants return 401. Refresh reuse revokes that session family. Do not blindly retry an exchange after an ambiguous network failure.
         */
        post: operations["exchangeToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke current session and its refresh family */
        post: operations["logoutCurrentSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the authenticated account */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/entitlements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read server-computed effective plan and expiry */
        get: operations["getEntitlements"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List sessions belonging to this account */
        get: operations["listOwnSessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/sessions/{sessionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoke one of the current account sessions */
        delete: operations["revokeOwnSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/email/challenges": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Request a one-use email verification challenge
         * @description Production code is random, 6 digits, TTL 10 min, HMAC stored, max 5 guesses. At least 60 sec between sends; 3/15 min/account and 10/hour/IP. One active challenge per user. No fixed mockup code accepted.
         */
        post: operations["requestEmailVerification"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/email/challenges/{challengeId}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Consume a valid email code and update verified email
         * @description Challenge must belong to authenticated user, be active/unexpired and have attempts remaining. Never reassign an email already verified by another account.
         */
        post: operations["verifyEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Cloud theme/language with ETag */
        get: operations["getSettings"];
        /** Replace settings using a strong revision precondition */
        put: operations["replaceSettings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/presets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read a stable paginated Cloud preset snapshot
         * @description With after, collectionRevision is required. Read revision+rows in a RepeatableRead transaction. Changed revision returns 409 PRESET_COLLECTION_CHANGED; restart from page one. Never replace cache with a partial snapshot.
         */
        get: operations["listPresets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/presets/{presetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read an own preset and its ETag */
        get: operations["getPreset"];
        /**
         * Create or replace one Cloud preset
         * @description Exactly one precondition: If-None-Match:* for creation; strong If-Match for replacement. Missing=428, both=400, stale/existing=412. Owner comes from session. Lock own users row then mutate preset, revision, collection revision and audit atomically. Never execute a stored effect. On ambiguous save outcome, read/compare before deciding whether to retry.
         */
        put: operations["savePreset"];
        post?: never;
        /** Soft-delete one own preset with a strong revision precondition */
        delete: operations["deletePreset"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/desktop/launch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Open the selected provider directly with a one-use native launch capability
         * @description The HMAC capability is bound to the attempt, PKCE challenge, state, exact loopback and expiry. Browser cookie and provider state remain separate. No account tokens in this URL. Legacy consent flow remains available separately.
         */
        get: operations["launchDesktopAuthorization"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/soundpad": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getSoundpad"];
        put: operations["saveSoundpad"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/tts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getTts"];
        put: operations["saveTts"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/overlays": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Load account Overlay settings */
        get: operations["getOverlays"];
        /** Save account Overlay settings with optimistic concurrency */
        put: operations["saveOverlays"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        Provider: "google" | "discord";
        /** Format: uuid */
        UUID: string;
        Revision: string;
        Error: {
            error: {
                code: string;
                message: string;
                /** Format: uuid */
                requestId: string;
                details?: {
                    path: string;
                    message: string;
                }[];
                currentRevision?: string;
            };
        };
        AuthAttemptRequest: {
            provider: components["schemas"]["Provider"];
            codeChallenge: string;
            /** @constant */
            codeChallengeMethod: "S256";
            clientState: string;
            redirectUri: string;
            /** Format: uuid */
            installationId: string;
            deviceLabel: string;
            /** @enum {string} */
            platform: "windows" | "macos" | "linux";
        };
        AuthAttempt: {
            /** Format: uuid */
            id: string;
            /**
             * Format: uri
             * @description HTTPS URL on the configured Backend origin. Main validates the origin/path before opening the system browser.
             */
            authorizationUrl: string;
            /** Format: date-time */
            expiresAt: string;
        };
        CancelAttempt: {
            /** Format: uuid */
            attemptId: string;
            codeVerifier: string;
        };
        AuthorizationCodeGrant: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            grant_type: "authorization_code";
            code: string;
            code_verifier: string;
            redirect_uri: string;
        };
        RefreshGrant: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            grant_type: "refresh_token";
            refresh_token: string;
        };
        TokenRequest: components["schemas"]["AuthorizationCodeGrant"] | components["schemas"]["RefreshGrant"];
        /** @description Main process only. Never return these fields through renderer IPC or URLs. */
        Tokens: {
            /** @constant */
            token_type: "Bearer";
            access_token: string;
            /** @constant */
            expires_in: 900;
            refresh_token: string;
            /** Format: uuid */
            sessionId: string;
            /** Format: uuid */
            deviceId: string;
            /** Format: date-time */
            sessionExpiresAt: string;
        };
        VerifiedEmail: {
            /** Format: email */
            address: string;
            /** Format: date-time */
            verifiedAt: string;
        };
        Me: {
            /** Format: uuid */
            id: string;
            displayName: string;
            email: components["schemas"]["VerifiedEmail"] | null;
            providers: components["schemas"]["Provider"][];
            avatarUrl: string | null;
        };
        /** @description Effective plan is computed by Backend from unrevoked time-bounded grants. Clients cannot write this resource. */
        Entitlements: {
            /** @enum {string} */
            plan: "FREE" | "PRO";
            /** @enum {string} */
            state: "free" | "active" | "expiring" | "expired";
            expiresAt: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        Session: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            deviceId: string;
            deviceLabel: string;
            isCurrent: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            expiresAt: string;
            revokedAt: string | null;
        };
        EmailChallengeRequest: {
            /** Format: email */
            email: string;
        };
        EmailChallenge: {
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            expiresAt: string;
            resendAfterSeconds: number;
        };
        EmailCode: {
            code: string;
        };
        /**
         * @example {
         *       "theme": "dark",
         *       "language": "th"
         *     }
         */
        SettingsWrite: {
            /** @enum {string} */
            theme: "dark" | "light";
            /** @enum {string} */
            language: "th" | "en" | "es";
        };
        Settings: {
            /** @enum {string} */
            theme: "dark" | "light";
            /** @enum {string} */
            language: "th" | "en" | "es";
            revision: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description Device-local binding reference. No absolute path is sent to Cloud. A different device must resolve or remap it before execution. */
        MediaBinding: {
            /** Format: uuid */
            bindingId: string;
            displayName: string;
        };
        OverlayEffect: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "overlay";
            template: string;
        };
        TtsEffect: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "tts";
            template: string;
            voiceId?: string;
        };
        SoundEffect: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "sound";
            media: components["schemas"]["MediaBinding"];
        };
        VideoEffect: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "video";
            media: components["schemas"]["MediaBinding"];
        };
        KeyboardEffect: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "keyboard";
            keys: components["schemas"]["KeyName"][];
        };
        WebhookEffect: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "webhook";
            /** @enum {string} */
            method: "GET" | "POST";
            url: string;
            /** @description JSON object, not executable code. Backend stores but never fetches a URL when a preset is saved. */
            body?: Record<string, never>;
        };
        /** @enum {string} */
        KeyName: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z" | "Digit0" | "Digit1" | "Digit2" | "Digit3" | "Digit4" | "Digit5" | "Digit6" | "Digit7" | "Digit8" | "Digit9" | "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9" | "F10" | "F11" | "F12" | "F13" | "F14" | "F15" | "F16" | "F17" | "F18" | "F19" | "F20" | "F21" | "F22" | "F23" | "F24" | "Control" | "Alt" | "Shift" | "Meta" | "Space" | "Enter" | "Escape" | "Tab" | "Backspace" | "Delete" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End" | "PageUp" | "PageDown" | "Numpad0" | "Numpad1" | "Numpad2" | "Numpad3" | "Numpad4" | "Numpad5" | "Numpad6" | "Numpad7" | "Numpad8" | "Numpad9" | "NumpadAdd" | "NumpadSubtract" | "NumpadMultiply" | "NumpadDivide" | "NumpadDecimal" | "NumpadEnter" | "NumLock" | "NumpadEqual";
        Effect: components["schemas"]["OverlayEffect"] | components["schemas"]["TtsEffect"] | components["schemas"]["SoundEffect"] | components["schemas"]["VideoEffect"] | components["schemas"]["KeyboardEffect"] | components["schemas"]["WebhookEffect"];
        ActionRule: {
            id: string;
            name: string;
            /** @enum {string} */
            trigger: "gift" | "like" | "follow" | "comment" | "share" | "subscribe" | "fanclub" | "hotkey";
            enabled: boolean;
            /** @description Canonical catalog ID (Rose is 5655), or '*' for all gifts. Empty for non-gift triggers. */
            giftId: string;
            /** @description Gift/like event count; for fanclub, minimum TikTok fan-club level (inclusive), evaluated per event without accumulation. */
            threshold: number;
            minCoins: number;
            cooldownSeconds: number;
            /**
             * @description Like threshold scope; omitted values count separately per viewer.
             * @default user
             * @enum {string}
             */
            likeScope?: "user" | "room";
            /** @enum {string} */
            comboMode: "each-event" | "streak-end";
            commentMatch: string;
            hotkey: string;
            effects: components["schemas"]["Effect"][];
        } & (unknown & unknown);
        /**
         * @description Maximum HTTP request body 256 KiB. Validate unique action IDs and semantic effect constraints in addition to this JSON Schema. No owner/plan/revision fields are writable.
         * @example {
         *       "schemaVersion": 1,
         *       "name": "คุยกับคนดู",
         *       "actions": [
         *         {
         *           "id": "rose-welcome",
         *           "name": "ขอบคุณ Rose",
         *           "trigger": "gift",
         *           "enabled": true,
         *           "giftId": "5655",
         *           "threshold": 1,
         *           "minCoins": 0,
         *           "cooldownSeconds": 0,
         *           "comboMode": "streak-end",
         *           "commentMatch": "",
         *           "hotkey": "",
         *           "effects": [
         *             {
         *               "kind": "overlay",
         *               "template": "ขอบคุณ {username} สำหรับ Rose × {count}"
         *             }
         *           ]
         *         }
         *       ]
         *     }
         */
        PresetWrite: {
            /** @constant */
            schemaVersion: 1;
            name: string;
            actions: components["schemas"]["ActionRule"][];
        };
        Preset: {
            /** Format: uuid */
            id: string;
            /** @constant */
            schemaVersion: 1;
            name: string;
            actions: components["schemas"]["ActionRule"][];
            revision: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        PresetPage: {
            items: components["schemas"]["Preset"][];
            collectionRevision: string;
            nextCursor: {
                /** Format: uuid */
                after: string;
                collectionRevision: string;
            } | null;
        };
        SoundSource: {
            /** @constant */
            provider: "myinstants";
            slug: string;
            name: string;
            /** Format: uri */
            sound: string;
        };
        SoundPad: {
            id: components["schemas"]["UUID"];
            name: string;
            /** @enum {string} */
            category: "reaction" | "transition" | "effect";
            bindingId: components["schemas"]["UUID"];
            displayName: string;
            hotkey: string;
            source?: components["schemas"]["SoundSource"];
        };
        SoundpadData: {
            /** @constant */
            version: 1;
            volume: number;
            pads: components["schemas"]["SoundPad"][];
            /** @description When omitted, Soundpad is enabled for existing saved documents. */
            enabled?: boolean;
        };
        SoundpadDocument: {
            revision: string;
            data: components["schemas"]["SoundpadData"];
        };
        TtsData: {
            /** @constant */
            version: 1;
            voiceId: string;
            speed: number;
            volume: number;
            read: {
                comment: boolean;
                gift: boolean;
                follow: boolean;
            };
            templates: {
                comment: string;
                gift: string;
                follow: string;
            };
            filter?: {
                enabled: boolean;
                blockedWords: string[];
                excludedBasicWords?: ("fuck" | "fucking" | "fucked" | "fucker" | "motherfucker" | "motherfucking" | "shit" | "shitty" | "bullshit" | "bitch" | "bitches" | "asshole" | "arsehole" | "cunt" | "dick" | "dickhead" | "bastard" | "pussy" | "cock" | "เหี้ย" | "ไอ้เหี้ย" | "อีเหี้ย" | "สัส" | "สัด" | "ไอ้สัส" | "อีสัส" | "สัตว์นรก" | "ควย" | "ไอ้ควย" | "หี" | "เย็ด" | "เย็ดแม่" | "แม่ง" | "แม่เย็ด" | "หน้าหี" | "ส้นตีน")[];
            };
            audience?: components["schemas"]["TtsAudience"];
        };
        TtsDocument: {
            revision: string;
            data: components["schemas"]["TtsData"];
        };
        OverlayWidget: {
            /** @enum {string} */
            font: "Judy" | "Komika Axis" | "Georgia" | "Arial Black" | "Tahoma" | "monospace";
            /** @enum {string} */
            theme: "plain-white" | "plain-black" | "crystal-reverie" | "mochi-pals" | "orbital-bloom" | "enchanted-grove" | "pearl-tide" | "cloud-palace" | "sakura-moon" | "midnight-grimoire" | "sugar-garden" | "aurora-prism";
            title: string;
            viewer: string;
            accent: string;
            background: string;
            opacity: number;
            fontSize: number;
            value: number;
            goal: number;
            seconds: number;
            options: string[];
            enabled: boolean;
            events: ("gift" | "like" | "follow" | "comment" | "share" | "subscribe")[];
            duration: number;
            minCoins: number;
            /** @enum {string} */
            metric: "coins" | "gifts" | "likes" | "follows";
            /** @enum {string} */
            trigger: "gift" | "like" | "follow" | "comment" | "share" | "subscribe";
            giftId: string;
            threshold: number;
            showRanking?: boolean;
            showTotal?: boolean;
            showRecentGift?: boolean;
            secondsPerEvent: number;
            sliderItems?: components["schemas"]["SliderItem"][];
            sliderSpeed?: number;
            sliderSize?: number;
            sliderGap?: number;
            sliderWidth?: number;
            /** @enum {string} */
            sliderDirection?: "left" | "right";
            sliderTextColor?: string;
            bigGiftLimit?: number;
        };
        OverlayData: {
            /** @constant */
            version: 1;
            widgets: {
                alert: components["schemas"]["OverlayWidget"];
                "big-gift": components["schemas"]["OverlayWidget"];
                "top-likers": components["schemas"]["OverlayWidget"];
                goal: components["schemas"]["OverlayWidget"];
                leaderboard: components["schemas"]["OverlayWidget"];
                timer: components["schemas"]["OverlayWidget"];
                "gift-jar": components["schemas"]["OverlayWidget"] & {
                    /** @enum {string} */
                    theme?: "plain-white" | "plain-black" | "crystal-reverie" | "mochi-pals" | "enchanted-grove" | "midnight-grimoire";
                };
                spin: components["schemas"]["OverlayWidget"];
                video?: components["schemas"]["OverlayWidget"];
                slider?: components["schemas"]["OverlayWidget"];
            };
        };
        OverlayDocument: {
            revision: string;
            data: components["schemas"]["OverlayData"];
        };
        /** @description Slider caption plus optional HTTPS gift image or local image binding. Local paths are never stored. */
        SliderItem: {
            id: string;
            label: string;
            /** Format: uri */
            imageUrl?: string;
            /** Format: uuid */
            imageBindingId?: string;
            imageDisplayName?: string;
        } & (unknown & unknown);
        TtsAudience: {
            everyone: boolean;
            followers: boolean;
            subscribers: boolean;
            moderators: boolean;
            teamMembers: boolean;
            minTeamLevel: number;
            gifters: boolean;
            minGifterLevel: number;
            topGifters: boolean;
            topCount: number;
        };
    };
    responses: {
        /** @description Malformed or semantically invalid input; unknown properties are rejected. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Missing, invalid, expired or revoked access session. OAuth token errors use the same safe envelope. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Authenticated account cannot perform this capability. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Missing/deleted resource or a resource belonging to another account; no ownership disclosure. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Collection changed, deleted preset UUID reused or an identity/email ownership conflict. */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Preset/settings revision conflict. Draft must be preserved; no automatic overwrite. */
        PreconditionFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description A strong write precondition is required. */
        PreconditionRequired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Request exceeds 256 KiB. */
        TooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Rate limit exceeded. */
        RateLimited: {
            headers: {
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Dependency unavailable or provider not configured. No internal error/secret is returned. */
        Unavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        PresetId: string;
        SessionId: string;
        ChallengeId: string;
        Provider: components["schemas"]["Provider"];
        /** @description Strong ETag from the last read. Required for updates/deletes/settings. Missing precondition returns 428; stale returns 412. */
        IfMatch: string;
        /** @description Required when creating a preset with a client-generated UUID. */
        IfNoneMatch: "*";
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Process is running. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        status: "ok";
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    startDesktopAuth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthAttemptRequest"];
            };
        };
        responses: {
            /** @description Attempt created. */
            201: {
                headers: {
                    "Cache-Control"?: "no-store";
                    Pragma?: "no-cache";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthAttempt"];
                };
            };
            400: components["responses"]["BadRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    showDesktopAuthorization: {
        parameters: {
            query: {
                attemptId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Minimal server-rendered confirmation; HTML-escaped device label, session-bound CSRF token and secure HttpOnly SameSite=Lax browser cookie. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    confirmDesktopAuthorization: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": {
                    /** Format: uuid */
                    attemptId: string;
                    csrfToken: string;
                };
            };
        };
        responses: {
            /** @description Server-generated Google/Discord authorize URL; state bound to attempt and browser session. */
            302: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    completeProviderAuth: {
        parameters: {
            query: {
                state: string;
                code?: string;
                error?: string;
            };
            header?: never;
            path: {
                provider: components["parameters"]["Provider"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect to the exact stored loopback URI, with code/client state or a safe error/client state. No session tokens in URL. */
            302: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    cancelDesktopAuth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelAttempt"];
            };
        };
        responses: {
            /** @description Attempt cancelled or already cancelled; any unconsumed grant is invalid. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            /** @description AUTH_ATTEMPT_ALREADY_CONSUMED: exchange won. Main must log out if credentials were received and the user still wants to cancel; an ambiguous exchange is not proof that a session was revoked. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    exchangeToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TokenRequest"];
            };
        };
        responses: {
            /** @description Desktop session credentials for main process only. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    Pragma?: "no-cache";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tokens"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    logoutCurrentSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Revoked. Main must also clear local credentials. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current account. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getEntitlements: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Effective plan, not a client-writable capability. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Entitlements"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    listOwnSessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Own sessions only. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["Session"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    revokeOwnSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: components["parameters"]["SessionId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session revoked. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    requestEmailVerification: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailChallengeRequest"];
            };
        };
        responses: {
            /** @description Generic acceptance; does not disclose whether email belongs to another account. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmailChallenge"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    verifyEmail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                challengeId: components["parameters"]["ChallengeId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailCode"];
            };
        };
        responses: {
            /** @description Verified account email. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerifiedEmail"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Settings initialized with account creation. */
            200: {
                headers: {
                    /** @description Strong revision ETag, e.g. "1". */
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Settings"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    replaceSettings: {
        parameters: {
            query?: never;
            header: {
                /** @description Strong ETag from the last read. Required for updates/deletes/settings. Missing precondition returns 428; stale returns 412. */
                "If-Match": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SettingsWrite"];
            };
        };
        responses: {
            /** @description Settings saved. */
            200: {
                headers: {
                    /** @description Strong revision ETag, e.g. "1". */
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Settings"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            412: components["responses"]["PreconditionFailed"];
            428: components["responses"]["PreconditionRequired"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    listPresets: {
        parameters: {
            query?: {
                limit?: number;
                after?: string;
                collectionRevision?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Visible own presets only, UUID ascending. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PresetPage"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    getPreset: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                presetId: components["parameters"]["PresetId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Preset. */
            200: {
                headers: {
                    /** @description Strong revision ETag, e.g. "1". */
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Preset"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    savePreset: {
        parameters: {
            query?: never;
            header?: {
                /** @description Strong ETag from the last read. Required for updates/deletes/settings. Missing precondition returns 428; stale returns 412. */
                "If-Match"?: components["parameters"]["IfMatch"];
                /** @description Required when creating a preset with a client-generated UUID. */
                "If-None-Match"?: components["parameters"]["IfNoneMatch"];
            };
            path: {
                presetId: components["parameters"]["PresetId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PresetWrite"];
            };
        };
        responses: {
            /** @description Updated. */
            200: {
                headers: {
                    /** @description Strong revision ETag, e.g. "1". */
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Preset"];
                };
            };
            /** @description Created. */
            201: {
                headers: {
                    /** @description Strong revision ETag, e.g. "1". */
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Preset"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            412: components["responses"]["PreconditionFailed"];
            413: components["responses"]["TooLarge"];
            428: components["responses"]["PreconditionRequired"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    deletePreset: {
        parameters: {
            query?: never;
            header: {
                /** @description Strong ETag from the last read. Required for updates/deletes/settings. Missing precondition returns 428; stale returns 412. */
                "If-Match": string;
            };
            path: {
                presetId: components["parameters"]["PresetId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Tombstone saved. Public reads now return 404. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
            428: components["responses"]["PreconditionRequired"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Unavailable"];
        };
    };
    launchDesktopAuthorization: {
        parameters: {
            query: {
                attemptId: string;
                launch: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Set signed HttpOnly browser binding and redirect to the provider. */
            302: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            503: components["responses"]["Unavailable"];
        };
    };
    getSoundpad: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Account Soundpad document; revision 0 is the unsaved empty default. */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SoundpadDocument"];
                };
            };
        };
    };
    saveSoundpad: {
        parameters: {
            query?: never;
            header: {
                /** @description Quoted current revision, including "0" for the first save. */
                "If-Match": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SoundpadData"];
            };
        };
        responses: {
            /** @description Account Soundpad document; revision 0 is the unsaved empty default. */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SoundpadDocument"];
                };
            };
            /** @description SOUNDPAD_VERSION_CONFLICT; keep local edits and explicitly reload. */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getTts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Account TTS settings only; queue, chats and installed voices remain local. Revision 0 is the unsaved default. */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TtsDocument"];
                };
            };
        };
    };
    saveTts: {
        parameters: {
            query?: never;
            header: {
                /** @description Quoted current revision; use "0" for initial save. */
                "If-Match": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TtsData"];
            };
        };
        responses: {
            /** @description Account TTS settings only; queue, chats and installed voices remain local. Revision 0 is the unsaved default. */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TtsDocument"];
                };
            };
            /** @description TTS_VERSION_CONFLICT; retain local edits and explicitly reload. */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getOverlays: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Account Overlay settings only; LIVE events, queues and animation state remain local. Revision 0 is the unsaved default. */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OverlayDocument"];
                };
            };
        };
    };
    saveOverlays: {
        parameters: {
            query?: never;
            header: {
                /** @description Quoted current revision; use "0" for initial save. */
                "If-Match": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OverlayData"];
            };
        };
        responses: {
            /** @description Account Overlay settings only; LIVE events, queues and animation state remain local. Revision 0 is the unsaved default. */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OverlayDocument"];
                };
            };
            /** @description OVERLAY_VERSION_CONFLICT; retain local edits and explicitly reload. */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
