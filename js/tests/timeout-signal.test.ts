/**
 * The SDK documents Node < 18 as supported when the caller injects `fetch`.
 * `AbortSignal.timeout` only arrived in Node 17.3, so calling it
 * unconditionally threw before the injected fetch ever ran — on exactly the
 * runtimes that path exists for.
 */
import { generateKeyPairSync } from 'crypto';
import { YeriaApp } from '../src/core/yeria-app';
import { timeoutSignal } from '../src/utils/timeout-signal';

function withoutNativeTimeout<T>(run: () => T): T {
    const native = (AbortSignal as unknown as { timeout?: unknown }).timeout;
    delete (AbortSignal as unknown as { timeout?: unknown }).timeout;
    try {
        return run();
    } finally {
        (AbortSignal as unknown as { timeout?: unknown }).timeout = native;
    }
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

function tokenWithAud(aud: string): string {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    return `${b64('{"alg":"RS256"}')}.${b64(JSON.stringify({ aud }))}.sig`;
}

describe('a runtime without AbortSignal.timeout still gets a timeout', () => {
    it('builds a signal that aborts on its own', async () => {
        const signal = withoutNativeTimeout(() => timeoutSignal(1));
        expect(signal).toBeDefined();
        expect(signal!.aborted).toBe(false);
        await new Promise(r => setTimeout(r, 20));
        expect(signal!.aborted).toBe(true);
    });

    it('the injected fetch is reached and then aborted', async () => {
        let sawFetch = false;
        const injected = ((_url: unknown, init?: RequestInit) => {
            sawFetch = true;
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            });
        }) as unknown as typeof fetch;

        const call = withoutNativeTimeout(() =>
            app(1).fetchUserDetails({ userServiceToken: tokenWithAud('svc'), fetch: injected })
        );
        await expect(call).rejects.toThrow();
        expect(sawFetch).toBe(true);
    });
});

describe('a runtime without AbortController either', () => {
    const g = globalThis as unknown as { AbortController?: unknown; AbortSignal?: unknown };

    it('sends the request unbounded rather than not at all', () => {
        const nativeSignal = (AbortSignal as unknown as { timeout?: unknown }).timeout;
        const nativeController = g.AbortController;
        delete (AbortSignal as unknown as { timeout?: unknown }).timeout;
        delete g.AbortController;
        try {
            expect(timeoutSignal(5)).toBeUndefined();
        } finally {
            (AbortSignal as unknown as { timeout?: unknown }).timeout = nativeSignal;
            g.AbortController = nativeController;
        }
    });

    it('does not even reach for AbortSignal when the global is absent', () => {
        // Reading `AbortSignal.timeout` on a runtime without `AbortSignal`
        // throws a ReferenceError, so the graceful path was unreachable.
        const nativeSignal = g.AbortSignal;
        const nativeController = g.AbortController;
        delete g.AbortSignal;
        delete g.AbortController;
        try {
            expect(timeoutSignal(5)).toBeUndefined();
        } finally {
            g.AbortSignal = nativeSignal;
            g.AbortController = nativeController;
        }
    });
});

describe('an impossible delay is refused the same way on every runtime', () => {
    // `AbortSignal.timeout` refuses these; `setTimeout` would coerce or clamp
    // them, so a bad configuration used to throw on a recent Node and send the
    // request on an older one.
    const bad: Array<[string, unknown]> = [
        ['negative', -1], ['fractional', 1.5], ['NaN', NaN],
        ['Infinity', Infinity], ['oversized', 2 ** 32], ['a string', '5'],
    ];

    it.each(bad)('refuses %s with the native implementation present', (_label, value) => {
        expect(() => timeoutSignal(value as number)).toThrow();
    });

    it.each(bad)('refuses %s with the native implementation absent', (_label, value) => {
        const native = (AbortSignal as unknown as { timeout?: unknown }).timeout;
        delete (AbortSignal as unknown as { timeout?: unknown }).timeout;
        try {
            expect(() => timeoutSignal(value as number)).toThrow();
        } finally {
            (AbortSignal as unknown as { timeout?: unknown }).timeout = native;
        }
    });

    it('accepts zero and a plain integer on both paths', () => {
        expect(timeoutSignal(0)).toBeDefined();
        expect(timeoutSignal(5000)).toBeDefined();
        const native = (AbortSignal as unknown as { timeout?: unknown }).timeout;
        delete (AbortSignal as unknown as { timeout?: unknown }).timeout;
        try {
            expect(timeoutSignal(0)).toBeDefined();
            expect(timeoutSignal(5000)).toBeDefined();
        } finally {
            (AbortSignal as unknown as { timeout?: unknown }).timeout = native;
        }
    });
});
