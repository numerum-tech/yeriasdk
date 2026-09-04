/**
 * The two platform calls that had no timeout at all now have one — and it is
 * the CONFIGURED one, as `sendNotification` always used, with a per-call
 * override on top. Mirrors py/tests/test_platform_timeouts.py.
 */
import { generateKeyPairSync } from 'crypto';
import { YeriaApp } from '../src/core/yeria-app';

// A fetch that never answers and only settles when its signal aborts.
const hangingFetch = (): typeof fetch => ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as unknown as typeof fetch;

function tokenWithAud(aud: string): string {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    return `${b64('{"alg":"RS256"}')}.${b64(JSON.stringify({ aud }))}.sig`;
}

function app(notificationTimeout?: number): YeriaApp {
    const kp = generateKeyPairSync('ed25519');
    return new YeriaApp({
        appId: 'p',
        baseUrl: 'https://yeria.test',
        privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
        publicKey: kp.publicKey.export({ type: 'spki', format: 'pem' }) as string,
        notificationTimeout
    });
}

describe('platform calls honour the configured timeout', () => {
    it('fetchUserDetails gives up at the configured notificationTimeout', async () => {
        await expect(app(1).fetchUserDetails({ userServiceToken: tokenWithAud('svc'), fetch: hangingFetch() }))
            .rejects.toThrow(/timeout|abort/i);
    });

    it('a per-call timeoutMs wins over the configured one', async () => {
        await expect(app(60_000).fetchUserDetails({
            userServiceToken: tokenWithAud('svc'), fetch: hangingFetch(), timeoutMs: 1
        })).rejects.toThrow(/timeout|abort/i);
    });

    it('getYeriaPublicKey gives up at the configured notificationTimeout', async () => {
        const platform = (app(1) as unknown as { platform: { getYeriaPublicKey: (o: unknown) => Promise<unknown> } }).platform;
        await expect(platform.getYeriaPublicKey({ fetch: hangingFetch() }))
            .rejects.toThrow(/timeout|abort/i);
    });
});
