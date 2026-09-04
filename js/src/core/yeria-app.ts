import type { BaseView } from './base-view';
import { Notification } from './notification';
import { SecureNotificationResponse } from '../types';
import { SignedEnvelope, UserDetails, YeriaTokenClaims, YeriaPublicKeyResolver } from './yeria-protocol';
import { YeriaSigner } from './security/yeria-signer';
import { YeriaEnvelopeVerifier } from './security/yeria-envelope-verifier';
import { YeriaUserTokenVerifier } from './security/yeria-user-token-verifier';
import { YeriaPlatform } from './platform/yeria-platform-client';
import { buildProviderError, ProviderErrorSpec } from './provider-error';
import { stringifyForSigning } from '../utils/signing-json';

// Types for the secure configuration
export interface YeriaAppConfig {
    appId: string;
    privateKey?: string; // Ed25519 private key (optional, generated automatically if not provided)
    publicKey?: string;  // Ed25519 public key (optional — derived from privateKey if absent)
    allowedDomains?: string[];
    viewExpirationMinutes?: number;
    baseUrl?: string; // Yeria platform base URL (e.g. https://yeria.app) — used for notifications and profile fetch
    notificationTimeout?: number; // HTTP request timeout in ms (default: 5000)
}

/**
 * The provider's SECRET-HOLDING half of the SDK: it owns the Ed25519 keypair
 * and does everything that needs it —
 *   - `app.serve(view)`            — sign a view into a v3 SignedEnvelope
 *   - `app.verifyIntegrity(env)`   — verify an envelope this app signed
 *   - `app.verifyUserToken(bearer)`— verify an inbound Yeria user token
 *   - `app.notify(...)` / `signNotification` / `rotateKey` / `fetchUserDetails`
 *
 * The KEYLESS other half is the `YeriaUI` factory (`YeriaUI.createFormView(...)`, etc.),
 * imported separately — it builds views with no credential. Typical flow:
 * `const v = YeriaUI.createFormView(id, title); … ; return app.serve(v);`.
 *
 * Construct once with `{ appId, privateKey, baseUrl, ... }`: the parsed
 * private key is held in memory, so a YeriaApp is a process-wide singleton.
 * The signer, envelope verifier, kid key cache, and Yeria HTTP client are all
 * internal — the methods above are the whole surface.
 */
export class YeriaApp {
    private config: YeriaAppConfig;
    private readonly signer: YeriaSigner;
    private readonly envelopeVerifier: YeriaEnvelopeVerifier;
    /** Provider-to-Yeria-backend flow. Internal — reach it through
     *  `verifyUserToken` / `notify` / `rotateKey` / `fetchUserDetails`. */
    private readonly platform: YeriaPlatform;

    constructor(config: YeriaAppConfig) {
        this.config = {
            allowedDomains: [],
            viewExpirationMinutes: 60,
            ...config
        };

        this.signer = new YeriaSigner({
            privateKey: config.privateKey,
            publicKey: config.publicKey
        });
        this.envelopeVerifier = new YeriaEnvelopeVerifier({
            appId: this.config.appId,
            publicKey: this.signer.getServicePublicKey(),
            viewExpirationMinutes: this.config.viewExpirationMinutes ?? 60,
        });
        this.platform = new YeriaPlatform({
            appId: this.config.appId,
            signer: this.signer,
            baseUrl: this.config.baseUrl,
            notificationTimeout: this.config.notificationTimeout
        });
    }

    // ── Views: sign / verify ────────────────────────────────────────────
    /**
     * Sign a view (built via `YeriaUI.createFormView(...)` etc.) into a v3
     * SignedEnvelope `{ payload, signature }` — send it as-is
     * (`res.json(app.serve(view))`). This is the single signing path; view
     * building is keyless and lives on `YeriaUI`.
     */
    serve(view: BaseView): SignedEnvelope {
        return this.signer.signView(view.build(), this.config.appId);
    }

    /**
     * Sign a provider error into a v3 SignedEnvelope whose payload is
     * `{ appId, timestamp, error: {...} }` (parallel to `serve`, which carries
     * `view`). Return it to the mobile client on the failing request. The
     * mobile verifies the signature (present) then reads `error.code` +
     * `error.invalid_params`. When you cannot sign (no key / app), use the
     * keyless `YeriaUi.error(spec)` instead — the mobile accepts an unsigned
     * `{ error: {...} }` body too.
     */
    serveError(spec: ProviderErrorSpec): SignedEnvelope {
        const decoded = {
            appId: this.config.appId,
            timestamp: Date.now(),
            ...buildProviderError(spec),
        };
        const payload = stringifyForSigning(decoded);
        return { payload, signature: this.signer.signPayload(payload) };
    }

    /**
     * Verify the integrity of an envelope this app produced (signature against
     * the service public key + appId + expiration).
     */
    verifyIntegrity(envelope: SignedEnvelope): boolean {
        return this.envelopeVerifier.verifyIntegrity(envelope);
    }

    /** The service's own public key (derived from the private key). */
    getServicePublicKey(): string {
        return this.signer.getServicePublicKey();
    }

    // ── Yeria backend ───────────────────────────────────────────────────
    /**
     * Verify an inbound Yeria-issued user token (the bearer a mobile client
     * sends). The signing `kid` is resolved against Yeria (rotation-aware) via
     * an internal key cache — you never wire a resolver or hold PEMs yourself.
     * Throws `YeriaPlatformUnreachableError` when Yeria is unreachable (surface
     * 503); an expired/unknown key surfaces as a verification error (401).
     * `expectedAudience` optionally pins the token to this service id.
     */
    async verifyUserToken(
        bearerToken: string,
        expectedAudience?: string | number,
    ): Promise<YeriaTokenClaims> {
        return this.platform.verifyYeriaToken(bearerToken, expectedAudience);
    }

    /** Sign a notification without sending it (returns the signed payload). */
    signNotification(notification: Notification): SecureNotificationResponse {
        return this.platform.signNotification(notification);
    }

    /** Sign and POST a notification to the Yeria backend. */
    async notify(notification: Notification): Promise<void> {
        return this.platform.sendNotification(notification);
    }

    /**
     * Rotate the service's signing key on the Yeria registry, then refresh the
     * local integrity check so freshly-signed envelopes still verify locally.
     */
    async rotateKey(
        yeriaApiBaseUrl: string,
        serviceId: string | number,
        newKeys: { privateKey: string; publicKey: string }
    ): Promise<{ keyId: number; expiresAt: string; gracePeriodMinutes: number }> {
        const rotated = await this.platform.rotateKey(yeriaApiBaseUrl, serviceId, newKeys);
        this.envelopeVerifier.setPublicKey(this.signer.getServicePublicKey());
        return rotated;
    }

    /**
     * Provider-side helper: fetch a Yeria user's details, authorized by the
     * user's own live service token. Delegates to `platform.fetchUserDetails`.
     */
    async fetchUserDetails(opts: {
        userServiceToken: string;
        fetch?: typeof fetch;
        timeoutMs?: number;
    }): Promise<UserDetails> {
        return this.platform.fetchUserDetails(opts);
    }

    // ── Static view-signing utilities ───────────────────────────────────
    /** Verify a raw Ed25519 signature over the payload string against a PEM. */
    static verifySignature(
        publicKey: string,
        payload: string,
        signature: string,
        onError?: (error: Error) => void
    ): boolean {
        return YeriaEnvelopeVerifier.verifySignature(publicKey, payload, signature, onError);
    }

    /** Sign a view into a v3 SignedEnvelope from a one-off private key. */
    static signView(
        view: Record<string, unknown>,
        appId: string,
        privateKey: string,
        timestamp: number = Date.now()
    ): SignedEnvelope {
        return new YeriaSigner({ privateKey }).signView(view, appId, timestamp);
    }

    // ── Static token verification (escape hatch) ──
    /**
     * Verify a Yeria-issued user token against a known PEM (pure, no network).
     * Prefer the instance method `app.verifyUserToken(bearer, aud?)`, which
     * resolves the `kid` for you; use this static only when you already hold
     * the exact PEM and want no network.
     */
    static verifyYeriaToken(
        jwtToken: string,
        yeriaPublicKey: string,
        expectedAudience?: string | number,
    ): YeriaTokenClaims {
        return YeriaUserTokenVerifier.verifyYeriaToken(jwtToken, yeriaPublicKey, expectedAudience);
    }

    /**
     * Same verify, but the second argument is a `kid` resolver instead of a
     * fixed PEM. Prefer `app.platform.verifyYeriaToken(jwt, aud?)`, which owns
     * an internal `YeriaPublicKeys`.
     */
    static async verifyYeriaTokenWithResolver(
        jwtToken: string,
        resolver: YeriaPublicKeyResolver,
        expectedAudience?: string | number,
    ): Promise<YeriaTokenClaims> {
        return YeriaUserTokenVerifier.verifyYeriaTokenWithResolver(jwtToken, resolver, expectedAudience);
    }
}
