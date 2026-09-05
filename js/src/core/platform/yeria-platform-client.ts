import { randomBytes } from 'crypto';
import { ConfigurationError, ERROR_CODES, ExternalError } from '../../errors';
import { SecureNotificationResponse } from '../../types';
import { Notification } from '../notification';
import { UserDetails, YeriaTokenClaims, YeriaPublicKey } from '../yeria-protocol';
import { YeriaKeyPair, YeriaSigner } from '../security/yeria-signer';
import { YeriaUserTokenVerifier } from '../security/yeria-user-token-verifier';
import { YeriaPublicKeys } from '../key-store';
import { stringifyForSigning } from '../../utils/signing-json';
import { timeoutSignal } from '../../utils/timeout-signal';

/**
 * How long a platform call waits before giving up, in milliseconds.
 *
 * `sendNotification` already bounded itself; `getYeriaPublicKey` and
 * `fetchUserDetails` did not, so a platform that accepted the connection and
 * then went quiet held a provider's request handler open indefinitely. Five
 * seconds is what the Python SDK has always used (`timeout=5`), so the two
 * give up at the same point. A configured `notificationTimeout` comes first,
 * as it does for `sendNotification`; a per-call `timeoutMs` wins over both.
 */
const PLATFORM_TIMEOUT_MS = 5000;

export interface YeriaPlatformConfig {
    appId: string;
    signer: YeriaSigner;
    baseUrl?: string;
    notificationTimeout?: number;
    /** Selecteur d'un point de developpement (`devkey_...`). Voir
     *  YeriaAppConfig.devKeyId. */
    devKeyId?: string;
    /** Optional pre-built key store for token verification. When omitted one
     *  is created lazily from `baseUrl`. */
    keyStore?: YeriaPublicKeys;
}

/**
 * Provider-backend ⇄ Yeria-backend flow: everything network-facing. Owns
 * notifications (sign/send), key rotation on the Yeria registry, user-details
 * fetch, Yeria public-key retrieval, and rotation-aware user-token
 * verification — resolving the JWT `kid` via an internal, lazily-created
 * `YeriaPublicKeys` (the kid→PEM resolver + cache). Shares the service
 * `YeriaSigner` with the app. INTERNAL — reached through `app.verifyUserToken` / `notify` / `rotateKey` / `fetchUserDetails`.
 *
 * Not: it does not build or sign views — that is `YeriaUI`.
 */
export class YeriaPlatform {
    private config: YeriaPlatformConfig;
    private keyStore?: YeriaPublicKeys;

    constructor(config: YeriaPlatformConfig) {
        this.config = config;
        this.keyStore = config.keyStore;
    }

    /**
     * Verify a Yeria-issued user token, resolving the Yeria signing key by its
     * `kid` header (rotation-aware) via an internal `YeriaPublicKeys` — no
     * resolver or PEM to pass. Requires `baseUrl` (or a `keyStore`) in config.
     * Checks signature + `iss === 'yeria'` + `aud === expectedAudience` (when
     * given) + `exp > now`.
     */
    async verifyYeriaToken(
        jwt: string,
        expectedAudience?: string | number,
    ): Promise<YeriaTokenClaims> {
        const ks = this.ensureKeyStore();
        return YeriaUserTokenVerifier.verifyYeriaTokenWithResolver(
            jwt,
            (kid) => ks.getByKid(kid),
            expectedAudience,
        );
    }

    private ensureKeyStore(): YeriaPublicKeys {
        if (!this.keyStore) {
            if (!this.config.baseUrl) {
                throw new ConfigurationError('verifyYeriaToken requires baseUrl (or a keyStore) in config.');
            }
            this.keyStore = new YeriaPublicKeys({ baseUrl: this.config.baseUrl });
        }
        return this.keyStore;
    }

    /**
     * Pull Yeria's active backend signing key (RS256) — the key that signs
     * user service tokens — from `GET /api/v1/public/registry/public-key`.
     * Fetch once and cache; then verify tokens locally with
     * `YeriaApp.verifyYeriaToken(jwt, pem, aud?)`. For rotation-aware
     * verification without holding the key yourself, use `verifyYeriaToken`
     * (kid resolver via YeriaPublicKeys) instead.
     */
    async getYeriaPublicKey(opts?: { fetch?: typeof fetch; timeoutMs?: number }): Promise<YeriaPublicKey> {
        if (!this.config.baseUrl) {
            throw new ConfigurationError('getYeriaPublicKey requires baseUrl in config.');
        }
        const fetchImpl = opts?.fetch ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            throw new ConfigurationError('getYeriaPublicKey: no fetch available — pass opts.fetch on Node < 18 or non-browser runtimes.');
        }
        const url = `${this.config.baseUrl.replace(/\/+$/, '')}/api/v1/public/registry/public-key`;

        let res: Response;
        try {
            res = await fetchImpl(url, {
                method: 'GET',
                signal: timeoutSignal(opts?.timeoutMs ?? this.config.notificationTimeout ?? PLATFORM_TIMEOUT_MS)
            });
        } catch (error) {
            throw new ExternalError(
                ERROR_CODES.NOTIFICATION_FAILED,
                `getYeriaPublicKey request failed: ${error instanceof Error ? error.message : String(error)}`,
                'fetch',
                error instanceof Error ? error : undefined,
            );
        }

        let body: unknown;
        try { body = await res.json(); }
        catch (_e) { body = null; }

        if (!res.ok) {
            throw new ExternalError(
                ERROR_CODES.NOTIFICATION_FAILED,
                `getYeriaPublicKey failed: ${res.status} ${res.statusText}`,
                'fetch',
            );
        }

        const result = (body && typeof body === 'object' && 'result' in body)
            ? (body as { result: unknown }).result
            : body;
        const r = (result && typeof result === 'object') ? result as Record<string, unknown> : null;
        if (!r || typeof r['public_key'] !== 'string') {
            throw new ExternalError(
                ERROR_CODES.NOTIFICATION_FAILED,
                'getYeriaPublicKey: unexpected response shape',
                'fetch',
            );
        }

        return {
            publicKey: r['public_key'] as string,
            keyId: typeof r['key_id'] === 'string' ? r['key_id'] as string : '',
            algorithm: typeof r['algorithm'] === 'string' ? r['algorithm'] as string : null,
            expiresAt: typeof r['expires_at'] === 'string' ? r['expires_at'] as string : null,
        };
    }

    setBaseUrl(baseUrl?: string): void {
        this.config.baseUrl = baseUrl;
    }

    setNotificationTimeout(notificationTimeout?: number): void {
        this.config.notificationTimeout = notificationTimeout;
    }

    /** Sign a notification without sending it (returns the signed payload). */
    signNotification(notification: Notification): SecureNotificationResponse {
        return this.config.signer.signNotification(
            notification, this.config.appId, undefined, this.config.devKeyId
        );
    }

    /** Sign and POST a notification to `POST /api/v1/user/notifications`. */
    async sendNotification(notification: Notification): Promise<void> {
        const signedNotification = this.signNotification(notification);

        if (!this.config.baseUrl) {
            throw new ConfigurationError('Yeria baseUrl required for sending notifications. Set baseUrl in YeriaAppConfig.');
        }
        // Route SIGNEE de serveur a serveur, donc sous le prefixe `provider` : ce
        // n'est pas un appel d'utilisateur connecte et elle ne porte aucun
        // jeton. Elle vivait sous `/api/v1/user/notifications`, ou le middleware
        // exigeait un JWT que ce client n'envoie pas — elle repondait donc 401.
        const url = `${this.config.baseUrl.replace(/\/+$/, '')}` +
            `/api/v1/provider/services/${encodeURIComponent(String(this.config.appId))}/notifications`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(signedNotification),
                signal: timeoutSignal(this.config.notificationTimeout || 5000)
            });

            if (!response.ok) {
                throw new ExternalError(
                    ERROR_CODES.NOTIFICATION_FAILED,
                    `Failed to send notification: ${response.status} ${response.statusText}`,
                    'fetch'
                );
            }
        } catch (error) {
            if (error instanceof ExternalError || error instanceof ConfigurationError) {
                throw error;
            }
            throw new ExternalError(
                ERROR_CODES.NOTIFICATION_FAILED,
                `Failed to send notification: ${error instanceof Error ? error.message : String(error)}`,
                'fetch',
                error instanceof Error ? error : undefined
            );
        }
    }

    /** Rotate the service signing key on the Yeria registry (signed request). */
    async rotateKey(
        yeriaApiBaseUrl: string,
        serviceId: string | number,
        newKeys: YeriaKeyPair
    ): Promise<{ keyId: number; expiresAt: string; gracePeriodMinutes: number }> {
        if (!newKeys?.privateKey || !newKeys?.publicKey) {
            throw new ConfigurationError('rotateKey requires { privateKey, publicKey } in PEM');
        }

        // Refus LOCAL en mode developpement. Le serveur refuse deja une
        // enveloppe qui porte `devKeyId`, mais la rotation n'en met pas : la
        // garde serveur ne se declencherait donc jamais depuis ce client, et un
        // deploiement configure en developpement qui detiendrait par ailleurs la
        // cle de production pourrait faire tourner la cle du service. Faire
        // tourner la cle de production doit venir de la production.
        if (this.config.devKeyId) {
            throw new ConfigurationError(
                'rotateKey is refused while devKeyId is set: rotating the service key must come from production'
            );
        }

        const envelope = {
            serviceId: String(serviceId),
            newPublicKey: newKeys.publicKey,
            timestamp: Date.now()
        };
        const payload = stringifyForSigning(envelope);
        const signature = this.config.signer.signPayload(payload);

        // `/api/v1/provider/...` : ecrite avant la taxonomie a six prefixes,
        // l'URL sans `provider` ne correspond a aucune route et repondait 404.
        const url = `${yeriaApiBaseUrl.replace(/\/+$/, '')}` +
            `/api/v1/provider/services/${encodeURIComponent(String(serviceId))}/keys/rotate`;
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    envelope,
                    signature,
                    currentPublicKey: this.config.signer.getServicePublicKey()
                }),
                signal: timeoutSignal(this.config.notificationTimeout || 5000)
            });
        } catch (error) {
            throw new ExternalError(
                ERROR_CODES.NOTIFICATION_FAILED,
                `Key rotation request failed: ${error instanceof Error ? error.message : String(error)}`,
                'fetch',
                error instanceof Error ? error : undefined
            );
        }

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new ExternalError(
                ERROR_CODES.NOTIFICATION_FAILED,
                `Key rotation rejected: ${response.status} ${response.statusText} ${text}`,
                'fetch'
            );
        }

        const body = await response.json() as {
            data?: {
                key?: { id: number; expires_at: string };
                grace_period_minutes?: number;
            };
        };

        this.config.signer.updateKeyPair(newKeys);

        return {
            keyId: body.data?.key?.id as number,
            expiresAt: body.data?.key?.expires_at as string,
            gracePeriodMinutes: body.data?.grace_period_minutes ?? 5
        };
    }

    /** Fetch a Yeria user's details, authorized by the user's own live
     *  service token. POSTs to
     *  `/api/v1/provider/services/{serviceId}/users/details`. */
    async fetchUserDetails(opts: {
        userServiceToken: string;
        fetch?: typeof fetch;
        timeoutMs?: number;
    }): Promise<UserDetails> {
        if (!this.config.baseUrl) throw new Error('fetchUserDetails: baseUrl is required (set baseUrl in YeriaAppConfig)');
        const token = opts?.userServiceToken;
        if (typeof token !== 'string' || token.length === 0) {
            throw new Error('fetchUserDetails: userServiceToken is required');
        }
        if (typeof this.config.signer.getPrivateKey() !== 'string' || this.config.signer.getPrivateKey().length === 0) {
            throw new Error('fetchUserDetails: instance has no Ed25519 private key');
        }
        // The service id is the token's audience. Decode it (unverified — the
        // backend re-verifies the token signature and aud) just to route the
        // request; the user is identified server-side by the token's `sub`.
        const serviceId = decodeAud(token);
        if (!serviceId) {
            throw new Error('fetchUserDetails: user token missing aud (service id)');
        }

        const fetchImpl = opts.fetch ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            throw new Error(
                'fetchUserDetails: no fetch available — pass opts.fetch on Node < 18 or non-browser runtimes',
            );
        }

        const envelope: Record<string, unknown> = {
            service_id: serviceId,
            user_token: token,
            timestamp: Date.now(),
            nonce: randomBytes(16).toString('hex'),
        };
        // Ajoute SEULEMENT s'il existe : une enveloppe de production ne doit
        // pas changer de forme, sa signature couvrant la charge exacte.
        if (this.config.devKeyId) envelope['devKeyId'] = this.config.devKeyId;
        const payloadStr = stringifyForSigning(envelope);
        const signature = this.config.signer.signPayload(payloadStr);

        const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
        const url = `${baseUrl}/api/v1/provider/services/${encodeURIComponent(serviceId)}/users/details`;

        const res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: timeoutSignal(opts.timeoutMs ?? this.config.notificationTimeout ?? PLATFORM_TIMEOUT_MS),
            body: JSON.stringify({ envelope, signature }),
        });

        let body: unknown;
        try { body = await res.json(); }
        catch (_e) { body = null; }

        if (!res.ok) {
            const msg = extractErrorMessage(body) || `HTTP ${res.status}`;
            throw new Error(`Yeria user details fetch failed: ${msg}`);
        }

        const result = (body && typeof body === 'object' && 'result' in body)
            ? (body as { result: unknown }).result
            : body;
        if (!result || typeof result !== 'object') {
            throw new Error('Yeria user details fetch: unexpected response shape');
        }
        const r = result as Record<string, unknown>;
        return {
            user_id: typeof r['user_id'] === 'string' ? r['user_id'] as string : String(r['user_id']),
            first_name: typeof r['first_name'] === 'string' ? r['first_name'] as string : null,
            last_name:  typeof r['last_name']  === 'string' ? r['last_name']  as string : null,
            country_code: typeof r['country_code'] === 'string' ? r['country_code'] as string : null,
            email: typeof r['email'] === 'string' ? r['email'] as string : null,
        };
    }
}

/**
 * Decode a JWT's `aud` claim WITHOUT verifying the signature — used only to
 * route the request to the right service. The backend verifies the token.
 */
function decodeAud(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    try {
        const json = Buffer.from(parts[1], 'base64url').toString('utf8');
        const claims = JSON.parse(json) as { aud?: unknown };
        if (claims.aud === undefined || claims.aud === null) return null;
        return String(claims.aud);
    } catch (_e) {
        return null;
    }
}

function extractErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    if (typeof b['message'] === 'string') return b['message'] as string;
    if (b['error'] && typeof b['error'] === 'object') {
        const e = b['error'] as Record<string, unknown>;
        if (typeof e['message'] === 'string') return e['message'] as string;
    }
    if (typeof b['error'] === 'string') return b['error'] as string;
    return null;
}
