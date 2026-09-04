/**
 * An abort signal that fires after `ms`, on runtimes that lack
 * `AbortSignal.timeout`.
 *
 * The SDK documents Node < 18 as supported when the caller injects `fetch`
 * (`opts.fetch`), and `AbortSignal.timeout` only arrived in Node 17.3 — so
 * calling it unconditionally would throw before the injected fetch ever ran,
 * on exactly the runtimes that path exists for. `AbortController` is older
 * (Node 15), so the fallback builds the same signal by hand.
 *
 * Older still than that, there is nothing to build one from: the call then
 * goes out unbounded rather than not at all, which is what these methods did
 * before they were given a timeout. Returns `undefined` there — `fetch`
 * accepts `signal: undefined`.
 */
// What `AbortSignal.timeout` itself accepts: an unsigned 32-bit count of ms.
const MAX_TIMEOUT_MS = 2 ** 32 - 1;

export function timeoutSignal(ms: number): AbortSignal | undefined {
    // Checked here rather than left to whichever branch runs: the native
    // method refuses a negative, fractional, non-finite or oversized delay,
    // while `setTimeout` quietly coerces or clamps it. Without this, the same
    // bad configuration threw before the request on a recent Node and SENT it
    // on an older one — then aborted a moment later, which for a key rotation
    // or a notification means the server may have acted while the caller saw
    // a failure.
    if (typeof ms !== 'number') {
        throw new TypeError('timeout must be a number of milliseconds');
    }
    if (!Number.isInteger(ms) || ms < 0 || ms > MAX_TIMEOUT_MS) {
        throw new RangeError(`timeout must be an integer between 0 and ${MAX_TIMEOUT_MS} milliseconds`);
    }

    // `typeof` first, and on the global itself: reading `AbortSignal.timeout`
    // on a runtime that has no `AbortSignal` throws a ReferenceError before
    // the graceful path below is ever reached.
    if (typeof AbortSignal !== 'undefined') {
        const native = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
        if (typeof native === 'function') return native.call(AbortSignal, ms);
    }
    if (typeof AbortController !== 'function') return undefined;

    const controller = new AbortController();
    const reason = typeof DOMException === 'function'
        ? new DOMException('The operation was aborted due to timeout', 'TimeoutError')
        : Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const timer = setTimeout(() => {
        // `abort(reason)` predates nothing that matters here: an older
        // implementation ignores the argument and aborts all the same.
        (controller.abort as (r?: unknown) => void).call(controller, reason);
    }, ms);
    // Node keeps the event loop alive for a pending timer; this one must not
    // outlive the request it guards. `unref` does not exist in a browser.
    (timer as unknown as { unref?: () => void }).unref?.();
    return controller.signal;
}
