/**
 * YeriaPublicKeys — trusted-set resolution, staleness bounds, fallback.
 *
 * The behaviour under test is the one that motivated the trusted set: a key
 * that Yeria has retired must stop verifying tokens the instant its grace
 * window closes, even when the SDK still holds the document that carried it.
 */

import { YeriaPublicKeys } from '../src/core/key-store';
import { YeriaPlatformUnreachableError } from '../src/errors';

const BASE_URL = 'https://yeria.test';
const SET_URL = `${BASE_URL}/api/v1/public/registry/public-key`;
const kidUrl = (kid: string) => `${BASE_URL}/api/v1/public/registry/public-keys/${kid}`;

const PEM_ACTIVE = '-----BEGIN PUBLIC KEY-----\nACTIVE\n-----END PUBLIC KEY-----';
const PEM_ROTATING = '-----BEGIN PUBLIC KEY-----\nROTATING\n-----END PUBLIC KEY-----';

const MIN = 60 * 1000;

/** Minimal Response stand-in — the store only uses ok/status/json(). */
function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

function envelope(result: unknown) {
    return { success: true, status: 200, message: 'ok', result };
}

function setBody(keys: Array<Record<string, unknown>>) {
    return envelope({
        public_key: PEM_ACTIVE,
        algorithm: 'RS256',
        key_id: 'key_active',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * MIN).toISOString(),
        keys,
    });
}

function activeEntry(overrides: Record<string, unknown> = {}) {
    return {
        key_id: 'key_active',
        state: 'active',
        algorithm: 'RS256',
        public_key: PEM_ACTIVE,
        trusted_until: new Date(Date.now() + 365 * 24 * 60 * MIN).toISOString(),
        ...overrides,
    };
}

function rotatingEntry(trustedUntilMs: number) {
    return {
        key_id: 'key_rotating',
        state: 'rotating',
        algorithm: 'RS256',
        public_key: PEM_ROTATING,
        trusted_until: new Date(trustedUntilMs).toISOString(),
    };
}

/** Records every URL requested and replies from a per-URL handler. */
function makeFetch(handler: (url: string) => Response | Promise<Response> | never) {
    const calls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        return handler(url);
    }) as unknown as typeof fetch;
    return { impl, calls };
}

describe('YeriaPublicKeys — trusted set', () => {
    it('resolves a kid from the set and caches the document', async () => {
        const { impl, calls } = makeFetch(() =>
            jsonResponse(setBody([activeEntry(), rotatingEntry(Date.now() + 4 * MIN)])),
        );
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
        expect(await keys.getByKid('key_rotating')).toBe(PEM_ROTATING);

        // Two lookups, one document.
        expect(calls).toEqual([SET_URL]);
    });

    it('rejects a rotating key once trusted_until passes, without refetching', async () => {
        // Grace ends 50 ms from now; the cached document keeps the entry for
        // the full 10-minute TTL, so only the deadline can stop it. The window
        // was 1 ms and the wait 5 ms, which a slow run could cross before the
        // first lookup — the test then failed on timing rather than on the
        // rule it checks.
        const GRACE_MS = 50;
        const { impl, calls } = makeFetch(() =>
            jsonResponse(setBody([activeEntry(), rotatingEntry(Date.now() + GRACE_MS)])),
        );
        const keys = new YeriaPublicKeys({
            baseUrl: BASE_URL,
            fetch: impl,
            // Long floor: a refetch here would be a test failure, not a rescue.
            minRefetchIntervalMs: 60 * MIN,
        });

        expect(await keys.getByKid('key_rotating')).toBe(PEM_ROTATING);

        await new Promise((r) => setTimeout(r, GRACE_MS + 20));

        expect(await keys.getByKid('key_rotating')).toBeNull();
        expect(await keys.getState('key_rotating')).toBe('expired');
        expect(calls).toEqual([SET_URL]); // still one fetch — the deadline decided
    });

    it('serves the active key normally while a sibling entry has expired', async () => {
        const { impl } = makeFetch(() =>
            jsonResponse(setBody([activeEntry(), rotatingEntry(Date.now() - MIN)])),
        );
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getByKid('key_rotating')).toBeNull();
        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
    });

    it('refetches once when a kid is absent — covers a key created after the last fetch', async () => {
        let rotated = false;
        const { impl, calls } = makeFetch(() =>
            jsonResponse(
                setBody(rotated
                    ? [activeEntry({ key_id: 'key_fresh', public_key: 'PEM_FRESH' }), activeEntry()]
                    : [activeEntry()]),
            ),
        );
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl, minRefetchIntervalMs: 0 });

        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
        rotated = true;
        expect(await keys.getByKid('key_fresh')).toBe('PEM_FRESH');
        expect(calls.length).toBe(2);
    });

    it('rate-limits the absent-kid refetch so forged kids cannot amplify', async () => {
        const { impl, calls } = makeFetch(() => jsonResponse(setBody([activeEntry()])));
        const keys = new YeriaPublicKeys({
            baseUrl: BASE_URL,
            fetch: impl,
            minRefetchIntervalMs: 60 * MIN,
        });

        // Primes the set (fetch 1). The floor blocks any refetch after that.
        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);

        for (let i = 0; i < 25; i++) {
            expect(await keys.getByKid(`forged_${i}`)).toBeNull();
        }
        expect(calls.length).toBe(1);
    });

    it('reports unknown for a kid absent from the set', async () => {
        const { impl } = makeFetch(() => jsonResponse(setBody([activeEntry()])));
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl, minRefetchIntervalMs: 60 * MIN });

        expect(await keys.getState('nope')).toBe('unknown');
    });

    it('rejects an empty kid without touching the network', async () => {
        const { impl, calls } = makeFetch(() => jsonResponse(setBody([activeEntry()])));
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getByKid('')).toBeNull();
        expect(calls).toEqual([]);
    });

    it('skips set entries with a missing PEM or an untrusted state', async () => {
        const { impl } = makeFetch(() =>
            jsonResponse(setBody([
                activeEntry(),
                { key_id: 'key_nopem', state: 'active', algorithm: 'RS256' },
                { key_id: 'key_expired', state: 'expired', public_key: 'PEM_X' },
            ])),
        );
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl, minRefetchIntervalMs: 60 * MIN });

        expect(await keys.getByKid('key_nopem')).toBeNull();
        expect(await keys.getByKid('key_expired')).toBeNull();
        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
    });

    it('honours an entry with no deadline as unbounded', async () => {
        const { impl } = makeFetch(() =>
            jsonResponse(setBody([activeEntry({ trusted_until: null })])),
        );
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
    });

    it('refetches the set after its TTL lapses', async () => {
        const { impl, calls } = makeFetch(() => jsonResponse(setBody([activeEntry()])));
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl, ttlMs: 5 });

        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
        await new Promise((r) => setTimeout(r, 15));
        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);

        expect(calls.length).toBe(2);
    });

    it('drops the cached set on invalidate', async () => {
        const { impl, calls } = makeFetch(() => jsonResponse(setBody([activeEntry()])));
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        await keys.getByKid('key_active');
        keys.invalidate('key_active');
        await keys.getByKid('key_active');

        expect(calls.length).toBe(2);
    });
});

describe('YeriaPublicKeys — platform unreachable', () => {
    it('throws on a transport failure instead of rejecting the token', async () => {
        const { impl } = makeFetch(() => {
            throw new Error('ECONNREFUSED');
        });
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        await expect(keys.getByKid('key_active')).rejects.toBeInstanceOf(YeriaPlatformUnreachableError);
        expect(await keys.getState('key_active')).toBe('unreachable');
    });

    it('treats a 5xx as unreachable, not as an authoritative verdict', async () => {
        const { impl } = makeFetch(() => jsonResponse({ error: 'bad gateway' }, 502));
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        await expect(keys.getByKid('key_active')).rejects.toBeInstanceOf(YeriaPlatformUnreachableError);
    });

    it('treats an unparseable body as unreachable', async () => {
        const { impl } = makeFetch(() => ({
            ok: true,
            status: 200,
            json: async () => { throw new Error('not json'); },
        } as unknown as Response));
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        await expect(keys.getByKid('key_active')).rejects.toBeInstanceOf(YeriaPlatformUnreachableError);
    });

    it('caches an outage only briefly, then recovers', async () => {
        let down = true;
        const { impl, calls } = makeFetch(() =>
            down ? jsonResponse({}, 503) : jsonResponse(setBody([activeEntry()])),
        );
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl, errorTtlMs: 5 });

        await expect(keys.getByKid('key_active')).rejects.toBeInstanceOf(YeriaPlatformUnreachableError);
        // Second call inside the error TTL is served from cache — no new request.
        await expect(keys.getByKid('key_active')).rejects.toBeInstanceOf(YeriaPlatformUnreachableError);
        expect(calls.length).toBe(1);

        down = false;
        await new Promise((r) => setTimeout(r, 15));
        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
    });
});

describe('YeriaPublicKeys — pre-trusted-set platform', () => {
    it('falls back to the per-kid endpoint when the set is absent', async () => {
        const { impl, calls } = makeFetch((url) => {
            if (url === SET_URL) {
                // Old Yeria: active key only, no `keys` array.
                return jsonResponse(envelope({ public_key: PEM_ACTIVE, key_id: 'key_active' }));
            }
            return jsonResponse(envelope({
                state: 'active',
                key_id: 'key_active',
                public_key: PEM_ACTIVE,
                expires_at: new Date(Date.now() + 30 * MIN).toISOString(),
            }));
        });
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
        expect(calls).toEqual([SET_URL, kidUrl('key_active')]);

        // The set endpoint is not probed again — the fallback is latched.
        expect(await keys.getByKid('key_active')).toBe(PEM_ACTIVE);
        expect(calls.length).toBe(2); // second lookup served from the per-kid cache
    });

    it('clamps the per-kid cache to the key trust deadline', async () => {
        let state = 'rotating';
        const { impl, calls } = makeFetch((url) => {
            if (url === SET_URL) return jsonResponse(envelope({ public_key: PEM_ACTIVE }));
            return state === 'rotating'
                ? jsonResponse(envelope({
                    state: 'rotating',
                    key_id: 'key_rotating',
                    public_key: PEM_ROTATING,
                    // Trust ends in 10 ms; the cache TTL is 10 minutes.
                    trusted_until: new Date(Date.now() + 10).toISOString(),
                }))
                : jsonResponse(envelope({ state: 'expired', key_id: 'key_rotating' }), 200);
        });
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getByKid('key_rotating')).toBe(PEM_ROTATING);

        await new Promise((r) => setTimeout(r, 25));
        state = 'expired';

        // Cache entry expired with the key, so the store asks again and Yeria
        // now refuses the PEM. Without the clamp this stayed cached ~10 min.
        expect(await keys.getByKid('key_rotating')).toBeNull();
        expect(calls.filter((u) => u === kidUrl('key_rotating')).length).toBe(2);
    });

    it('surfaces a 404 from the per-kid endpoint as unknown', async () => {
        const { impl } = makeFetch((url) => {
            if (url === SET_URL) return jsonResponse(envelope({ public_key: PEM_ACTIVE }));
            return jsonResponse({ state: 'unknown', key_id: 'nope' }, 404);
        });
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getState('nope')).toBe('unknown');
    });

    it('rejects on a 404 whose body carries no state — must not answer 503', async () => {
        // Shape emitted by a Yeria whose error envelope drops unknown fields:
        // {success, status, error:{status, message}} — no `state` anywhere.
        const { impl } = makeFetch((url) => {
            if (url === SET_URL) return jsonResponse(envelope({ public_key: PEM_ACTIVE }));
            return jsonResponse(
                { success: false, status: 404, error: { status: 404, message: 'Key not found' } },
                404,
            );
        });
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        expect(await keys.getState('nope')).toBe('unknown');
        expect(await keys.getByKid('nope')).toBeNull();
    });

    it('still treats a stateless 200 body as unreachable', async () => {
        // Only 404 is authoritative-by-status. A 200 that fails the contract
        // stays "cannot verify" — it may be a proxy page, not Yeria.
        const { impl } = makeFetch((url) => {
            if (url === SET_URL) return jsonResponse(envelope({ public_key: PEM_ACTIVE }));
            return jsonResponse({ hello: 'world' }, 200);
        });
        const keys = new YeriaPublicKeys({ baseUrl: BASE_URL, fetch: impl });

        await expect(keys.getByKid('nope')).rejects.toBeInstanceOf(YeriaPlatformUnreachableError);
    });
});
