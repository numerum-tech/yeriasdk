// YeriaPublicKeys — provider-side helper for resolving the JWT `kid` header
// of inbound Yeria-issued user tokens.
//
// The store fetches the TRUSTED KEY SET from
// `GET /api/v1/public/registry/public-key` and caches it as one document.
// Every key Yeria currently vouches for is in there — the active one plus
// any key still inside its rotation grace window — each stamped with
// `trusted_until`, the instant it stops being trusted.
//
// Two consequences, both deliberate:
//
//   1. A `kid` that is absent from the set is rejected with NO network call.
//      A flood of forged kids costs nothing.
//   2. Trust is re-evaluated on every lookup against `trusted_until`, not
//      against the cache TTL. A retired key stops verifying the moment its
//      grace window closes, even if the cached document outlives it. Caching
//      the document longer never widens the window a retired key is accepted
//      in — that was the bug this design replaces.
//
// A failure to REACH Yeria (network error, timeout, 5xx, non-JSON error
// page) is kept strictly separate from an authoritative "key not trusted"
// answer: it surfaces as state `unreachable` and, through `getByKid`, as a
// thrown `YeriaPlatformUnreachableError`. That lets provider middleware
// answer 503 ("cannot verify right now") instead of 401 ("token invalid").
// Unreachable results use a short cache TTL so a transient blip does not
// reject every token for the full positive TTL.
//
// Against a Yeria older than the trusted-set response (no `keys` array),
// the store falls back to the per-kid endpoint
// `GET /api/v1/public/registry/public-keys/{kid}` and behaves as before.
//
// Providers wire it into their own auth middleware:
//
//   import { YeriaApp, YeriaPublicKeys } from '@numerum-tech/yeriasdk';
//
//   const keys = new YeriaPublicKeys({ baseUrl: process.env.YERIA_BASE_URL });
//
//   const claims = await YeriaApp.verifyYeriaTokenWithResolver(
//       bearer,
//       (kid) => keys.getByKid(kid),
//       MY_SERVICE_ID
//   );
//
// The SDK never reaches out to Yeria on its own — every network call
// flows through a fetch implementation the caller can swap (tests,
// non-Node runtimes).

// Trust state of a `kid`:
//   active/rotating — key is trusted, PEM returned.
//   expired         — key was issued by Yeria but is past its validity;
//                     the token must be rejected (a decision was made).
//   unknown         — Yeria answered authoritatively that it holds no such
//                     kid; the token must be rejected.
//   unreachable     — the SDK could NOT reach Yeria (network, timeout, 5xx,
//                     non-JSON error page). No trust decision was possible.
//                     Distinct from unknown/expired on purpose: this is a
//                     transport problem, not a verdict on the key.
import { YeriaPlatformUnreachableError } from '../errors';

export type KeyState = 'active' | 'rotating' | 'expired' | 'unknown' | 'unreachable';

export interface KeyLookup {
    state: KeyState;
    publicKey: string | null; // PEM, present only for active/rotating
    // Trust deadline, ISO — present only for active/rotating. This is the
    // instant the key stops verifying tokens, NOT the key's declared expiry:
    // for a rotating key the declared expiry is still months out while trust
    // ends when the grace window closes.
    expiresAt: string | null;
    // Populated only when state === 'unreachable' — carries why the platform
    // could not be reached so getByKid can raise a precise error.
    reason?: 'network' | 'http_error' | 'malformed_response';
    statusCode?: number;
    cause?: Error;
}

export interface YeriaPublicKeysOptions {
    /**
     * Base URL of the Yeria platform — e.g. `https://yeria.app`. Trailing
     * slash optional. The store appends `/api/v1/public/registry/...`.
     */
    baseUrl: string;
    /**
     * Cache lifetime for the trusted key set, in milliseconds. Default 10
     * minutes. This bounds how stale the SET may be — it does NOT extend how
     * long an individual key is accepted, which is governed by that key's
     * `trusted_until`. Lower it to shorten the window in which a manually
     * revoked key is still honoured.
     */
    ttlMs?: number;
    /**
     * Cache lifetime for `unreachable` results, in milliseconds. Default 5s.
     * Kept short on purpose: a transient network blip must not poison the
     * cache for the full `ttlMs` and fail every token for 10 minutes. Short
     * enough to recover fast, long enough to avoid hot-looping Yeria under a
     * flood of tokens while it is down.
     */
    errorTtlMs?: number;
    /**
     * Minimum interval between forced refetches of the set, in milliseconds.
     * Default 30s. A `kid` absent from the cached set triggers ONE refetch —
     * that covers a token minted with a key created after the last fetch.
     * Without the floor, a flood of forged kids would turn every bad token
     * into a request against Yeria.
     */
    minRefetchIntervalMs?: number;
    /**
     * Inject a `fetch` implementation. Defaults to the global `fetch` —
     * Node 18+ ships it natively. Tests override to avoid real HTTP.
     */
    fetch?: typeof fetch;
}

/** One key from the trusted set. */
interface TrustedEntry {
    publicKey: string;
    state: 'active' | 'rotating';
    /** Epoch ms; null when Yeria published no deadline (unbounded). */
    trustedUntil: number | null;
}

interface CacheEntry {
    lookup: KeyLookup;
    expiresAt: number;
}

type SetResult =
    | { kind: 'ok'; entries: Map<string, TrustedEntry> }
    | { kind: 'unreachable'; lookup: KeyLookup }
    /** Yeria answered, but without a `keys` array — pre-trusted-set backend. */
    | { kind: 'unsupported' };

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ERROR_TTL_MS = 5 * 1000;
const DEFAULT_MIN_REFETCH_INTERVAL_MS = 30 * 1000;

export class YeriaPublicKeys {
    private readonly baseUrl: string;
    private readonly ttlMs: number;
    private readonly errorTtlMs: number;
    private readonly minRefetchIntervalMs: number;
    private readonly fetchImpl: typeof fetch;

    // Trusted-set path.
    private set: { entries: Map<string, TrustedEntry>; expiresAt: number } | null = null;
    private setUnreachable: CacheEntry | null = null;
    private lastSetFetchAt = 0;
    /** Latched once Yeria answers without `keys` — stops re-probing the set
     *  endpoint on every lookup against an older platform. */
    private setUnsupported = false;

    // Legacy per-kid path (only used when `setUnsupported`).
    private readonly cache = new Map<string, CacheEntry>();

    constructor(opts: YeriaPublicKeysOptions) {
        if (!opts || !opts.baseUrl) {
            throw new Error('YeriaPublicKeys: baseUrl is required');
        }
        this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
        this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
        this.errorTtlMs = opts.errorTtlMs ?? DEFAULT_ERROR_TTL_MS;
        this.minRefetchIntervalMs = opts.minRefetchIntervalMs ?? DEFAULT_MIN_REFETCH_INTERVAL_MS;
        const f = opts.fetch ?? globalThis.fetch;
        if (typeof f !== 'function') {
            throw new Error(
                'YeriaPublicKeys: no fetch available — pass opts.fetch on Node < 18 or non-browser runtimes',
            );
        }
        this.fetchImpl = f.bind(globalThis);
    }

    /**
     * Resolve a kid to a PEM.
     *
     *   - active/rotating → the PEM string.
     *   - expired/unknown → `null`. Yeria answered authoritatively that the
     *     key is not trusted; the caller must REJECT the token (401).
     *   - unreachable     → throws {@link YeriaPlatformUnreachableError}. The
     *     SDK could not reach Yeria, so no trust decision was possible; the
     *     caller must surface a 503, NOT a 401. Wired as a resolver into
     *     `verifyYeriaTokenWithResolver`, this throw propagates out of verify
     *     so provider middleware can tell "cannot verify" from "invalid".
     */
    async getByKid(kid: string): Promise<string | null> {
        const lookup = await this.lookup(kid);
        if (lookup.state === 'unreachable') {
            throw new YeriaPlatformUnreachableError(
                kid,
                this.setUrl(),
                lookup.reason ?? 'network',
                lookup.statusCode,
                lookup.cause,
            );
        }
        return lookup.publicKey;
    }

    /**
     * Resolve a kid to its full trust state, INCLUDING `unreachable`. Same
     * network/cache behaviour as `getByKid` but never throws — exposed for
     * callers that want to log / branch on the state (e.g. distinguish a
     * platform outage from a genuinely unknown key without a try/catch).
     */
    async getState(kid: string): Promise<KeyState> {
        const lookup = await this.lookup(kid);
        return lookup.state;
    }

    /** Drop the cached set (and any legacy per-kid entry) so the next lookup
     *  refetches. Use on an out-of-band revoke signal — an admin webhook, an
     *  ops call. NOT useful as a verify-failure hook: a rotated-out key still
     *  produces a mathematically valid signature, so rotation never surfaces
     *  as a verification failure. Staleness is handled by `trusted_until`. */
    invalidate(kid: string): void {
        this.cache.delete(kid);
        this.set = null;
    }

    /** Drop the entire cache. */
    invalidateAll(): void {
        this.cache.clear();
        this.set = null;
        this.setUnreachable = null;
    }

    private setUrl(): string {
        return `${this.baseUrl}/api/v1/public/registry/public-key`;
    }

    private urlFor(kid: string): string {
        return `${this.baseUrl}/api/v1/public/registry/public-keys/${encodeURIComponent(kid)}`;
    }

    private async lookup(kid: string): Promise<KeyLookup> {
        if (typeof kid !== 'string' || kid.length === 0) {
            // Malformed input, not a platform problem — authoritative reject.
            return { state: 'unknown', publicKey: null, expiresAt: null };
        }

        if (!this.setUnsupported) {
            const viaSet = await this.lookupInSet(kid);
            if (viaSet) return viaSet;
            // Fell through: this Yeria predates the trusted-set response.
        }

        return this.lookupByKid(kid);
    }

    /** Resolve from the trusted set. Returns null when the set path is not
     *  usable against this platform (no `keys` array) so the caller can fall
     *  back to the per-kid endpoint. */
    private async lookupInSet(kid: string): Promise<KeyLookup | null> {
        let result = await this.ensureSet(false);
        if (result.kind === 'unreachable') return result.lookup;
        if (result.kind === 'unsupported') {
            this.setUnsupported = true;
            return null;
        }

        let entry = result.entries.get(kid);

        // Absent kid: either genuinely unknown, or minted with a key created
        // after our last fetch. One rate-limited refetch settles it.
        if (!entry && Date.now() - this.lastSetFetchAt >= this.minRefetchIntervalMs) {
            result = await this.ensureSet(true);
            if (result.kind === 'unreachable') return result.lookup;
            if (result.kind === 'unsupported') {
                this.setUnsupported = true;
                return null;
            }
            entry = result.entries.get(kid);
        }

        if (!entry) {
            return { state: 'unknown', publicKey: null, expiresAt: null };
        }

        // Present but past its deadline — the cached document outlived the
        // key's trust. Reject without a refetch: Yeria would not hand the key
        // back either. This is what caps the retired-key window at zero.
        if (entry.trustedUntil !== null && entry.trustedUntil <= Date.now()) {
            return { state: 'expired', publicKey: null, expiresAt: null };
        }

        return {
            state: entry.state,
            publicKey: entry.publicKey,
            expiresAt: entry.trustedUntil === null ? null : new Date(entry.trustedUntil).toISOString(),
        };
    }

    private async ensureSet(force: boolean): Promise<SetResult> {
        const now = Date.now();

        if (!force) {
            if (this.setUnreachable && this.setUnreachable.expiresAt > now) {
                return { kind: 'unreachable', lookup: this.setUnreachable.lookup };
            }
            if (this.set && this.set.expiresAt > now) {
                return { kind: 'ok', entries: this.set.entries };
            }
        }

        const result = await this.fetchSet();
        this.lastSetFetchAt = now;

        if (result.kind === 'unreachable') {
            this.setUnreachable = { lookup: result.lookup, expiresAt: now + this.errorTtlMs };
            return result;
        }
        if (result.kind === 'unsupported') {
            return result;
        }

        this.setUnreachable = null;
        this.set = { entries: result.entries, expiresAt: now + this.ttlMs };
        return result;
    }

    private async fetchSet(): Promise<SetResult> {
        const url = this.setUrl();
        let res: Response;
        try {
            res = await this.fetchImpl(url, { method: 'GET' });
        } catch (e) {
            return {
                kind: 'unreachable',
                lookup: {
                    state: 'unreachable', publicKey: null, expiresAt: null,
                    reason: 'network', cause: e instanceof Error ? e : undefined,
                },
            };
        }

        // Unlike the per-kid endpoint there is no authoritative-404 case here:
        // the set always exists. Any non-2xx is the platform failing to answer.
        if (!res.ok) {
            return {
                kind: 'unreachable',
                lookup: {
                    state: 'unreachable', publicKey: null, expiresAt: null,
                    reason: 'http_error', statusCode: res.status,
                },
            };
        }

        let body: unknown;
        try {
            body = await res.json();
        } catch (_e) {
            return {
                kind: 'unreachable',
                lookup: {
                    state: 'unreachable', publicKey: null, expiresAt: null,
                    reason: 'malformed_response', statusCode: res.status,
                },
            };
        }

        const result = extractResult(body);
        if (!result) {
            return {
                kind: 'unreachable',
                lookup: {
                    state: 'unreachable', publicKey: null, expiresAt: null,
                    reason: 'malformed_response', statusCode: res.status,
                },
            };
        }

        const rawKeys = result['keys'];
        if (!Array.isArray(rawKeys)) {
            // Pre-trusted-set Yeria: it answered fine, it just has no set to
            // give. Not an error — the caller falls back to the per-kid route.
            return { kind: 'unsupported' };
        }

        const entries = new Map<string, TrustedEntry>();
        for (const raw of rawKeys) {
            if (!raw || typeof raw !== 'object') continue;
            const k = raw as Record<string, unknown>;
            const kid = k['key_id'];
            const pem = k['public_key'];
            const state = k['state'];
            if (typeof kid !== 'string' || typeof pem !== 'string') continue;
            if (state !== 'active' && state !== 'rotating') continue;

            const rawUntil = k['trusted_until'];
            let trustedUntil: number | null = null;
            if (typeof rawUntil === 'string') {
                const parsed = Date.parse(rawUntil);
                trustedUntil = Number.isNaN(parsed) ? null : parsed;
            }

            entries.set(kid, { publicKey: pem, state, trustedUntil });
        }

        return { kind: 'ok', entries };
    }

    // ── Legacy per-kid path ────────────────────────────────────────────────
    // Used only against a Yeria that does not publish the trusted set.

    private async lookupByKid(kid: string): Promise<KeyLookup> {
        const now = Date.now();
        const cached = this.cache.get(kid);
        if (cached && cached.expiresAt > now) {
            return cached.lookup;
        }

        const lookup = await this.fetchFromYeria(kid);
        // Transient (unreachable) results get the short error TTL so a blip
        // does not fail every token for the full ttlMs; authoritative
        // results (active/rotating/expired/unknown) get the normal TTL —
        // clamped to the key's own trust deadline so a rotating key is never
        // cached past the end of its grace window.
        let ttl = lookup.state === 'unreachable' ? this.errorTtlMs : this.ttlMs;
        if (lookup.expiresAt) {
            const deadline = Date.parse(lookup.expiresAt);
            if (!Number.isNaN(deadline)) {
                ttl = Math.max(0, Math.min(ttl, deadline - now));
            }
        }
        this.cache.set(kid, { lookup, expiresAt: now + ttl });
        return lookup;
    }

    private async fetchFromYeria(kid: string): Promise<KeyLookup> {
        const url = this.urlFor(kid);
        let res: Response;
        try {
            res = await this.fetchImpl(url, { method: 'GET' });
        } catch (e) {
            // Transport failure (DNS, connection refused, timeout). Yeria was
            // never reached — we cannot decide anything about the key.
            return {
                state: 'unreachable', publicKey: null, expiresAt: null,
                reason: 'network', cause: e instanceof Error ? e : undefined,
            };
        }

        // Yeria answers 200 with a state body for a known kid and 404 (still a
        // well-formed body) for a genuinely unknown one. Any OTHER non-2xx
        // (5xx, 502/503 gateway pages, 429, …) is the platform failing to
        // answer — treat as unreachable, not as an authoritative verdict.
        if (!res.ok && res.status !== 404) {
            return {
                state: 'unreachable', publicKey: null, expiresAt: null,
                reason: 'http_error', statusCode: res.status,
            };
        }

        // The body shape is the same on 200 and on the 404 case
        // (`{state, key_id, [public_key, ...]}`) wrapped in
        // `{success, message, result}` by the platform's jsonSuccess /
        // jsonFail helpers. A body that will not parse as JSON (e.g. an HTML
        // error page served by a proxy in front of Yeria) is NOT a trustworthy
        // "unknown" — treat it as the platform being unreachable.
        let body: unknown;
        try {
            body = await res.json();
        } catch (_e) {
            return {
                state: 'unreachable', publicKey: null, expiresAt: null,
                reason: 'malformed_response', statusCode: res.status,
            };
        }

        const result = extractResult(body);
        const rawState = result ? result['state'] : undefined;
        const stateKnown = rawState === 'active' || rawState === 'rotating'
            || rawState === 'expired' || rawState === 'unknown';

        // A 404 is an authoritative not-found regardless of what the body
        // looks like: Yeria only serves it when it holds no such kid. Older
        // platforms lose the `state` field on that path (the error envelope
        // drops unknown keys), and treating that as malformed answered 503
        // for every forged kid instead of rejecting it.
        if (!stateKnown && res.status === 404) {
            return { state: 'unknown', publicKey: null, expiresAt: null };
        }

        // Any other body without a recognisable state is a broken contract,
        // not an authoritative "unknown" — surface it as unreachable so it is
        // never silently cached as a hard token rejection.
        if (!result || !stateKnown) {
            return {
                state: 'unreachable', publicKey: null, expiresAt: null,
                reason: 'malformed_response', statusCode: res.status,
            };
        }

        if (rawState === 'active' || rawState === 'rotating') {
            // Prefer `trusted_until` (the real deadline) over `expires_at`
            // (the key's declared expiry, untouched by rotation). Older Yeria
            // sends only the latter.
            const trustedUntil = typeof result['trusted_until'] === 'string'
                ? result['trusted_until'] as string
                : (typeof result['expires_at'] === 'string' ? result['expires_at'] as string : null);
            return {
                state: rawState,
                publicKey: typeof result['public_key'] === 'string' ? result['public_key'] as string : null,
                expiresAt: trustedUntil,
            };
        }
        return { state: rawState, publicKey: null, expiresAt: null };
    }
}

/** Extract `result` from a `{success, message, result}` envelope, or fall
 *  back to the top-level object when the platform returned a state-only
 *  body without the wrapper. */
function extractResult(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    if (b['result'] && typeof b['result'] === 'object') {
        return b['result'] as Record<string, unknown>;
    }
    // Some jsonFail paths return the result fields at the top level.
    if (typeof b['state'] === 'string') return b;
    // Trusted-set body without the wrapper.
    if (Array.isArray(b['keys']) || typeof b['public_key'] === 'string') return b;
    return null;
}
