import { InvalidParameterError } from '../errors';

/**
 * Provider → mobile error contract.
 *
 * A provider signals a business/domain error to the mobile client with a
 * controlled `error` object that mirrors the Yeria platform's error shape, so
 * the mobile side reuses the SAME parsing + code→l10n logic it already runs for
 * platform/auth errors: read `error.code` and `error.invalid_params[]`,
 * then localize by code with a human-message fallback.
 *
 * Two emission forms (both carry the identical `error` object):
 *   - unsigned:  `YeriaUi.error(spec)`      → `{ error: {...} }`  (keyless,
 *                 always available — no `YeriaApp`, no key needed)
 *   - signed:    `app.serveError(spec)`     → `{ payload, signature }` wrapping
 *                 `{ appId, timestamp, error: {...} }`
 *
 * The mobile client verifies the signature ONLY when one is present, and keys
 * error handling off the presence of this `error` envelope in the body — NOT
 * off the HTTP status (the provider's gateway/proxy may return an arbitrary
 * status the SDK does not control).
 */

/** One field-level error, mirrors the platform `invalid_params[]` element.
 *  `code` here is the dot.notation string (e.g. `email.required`). */
export interface ProviderFieldError {
    path: string;
    code: string;
    message: string;
}

/** What a provider passes to `YeriaUi.error` / `app.serveError`. camelCase in,
 *  serialized to the platform's wire keys. */
export interface ProviderErrorSpec {
    /** Machine-readable dot.notation code, e.g. `form.validation_failed`.
     *  Same meaning as a field's `code`; the mobile localizes by it. */
    code: string;
    /** Human-readable fallback message (shown when the mobile has no l10n for
     *  the code). */
    message: string;
    /** Status-like severity number carried inside the envelope (default 400).
     *  Advisory — mobile does not rely on the HTTP status. */
    status?: number;
    /** Optional per-field errors. */
    invalidParams?: ProviderFieldError[];
}

/** The serialized `error` object — platform-identical: `status` is the number,
 *  `code` is the dot.notation string (same key name as per-field `code`). */
export interface ProviderErrorObject {
    status: number;
    code: string;
    message: string;
    invalid_params?: ProviderFieldError[];
}

/** The unsigned wire body: the `error` object under an `error` key. */
export interface ProviderErrorBody {
    error: ProviderErrorObject;
}

/**
 * Build the canonical `{ error: {...} }` body from a spec. Pure, keyless.
 * Throws `InvalidParameterError` when `code` or `message` is missing.
 */
export function buildProviderError(spec: ProviderErrorSpec): ProviderErrorBody {
    if (!spec || typeof spec.code !== 'string' || spec.code.length === 0) {
        throw new InvalidParameterError('code', spec ? spec.code : undefined, 'must be a non-empty string');
    }
    if (typeof spec.message !== 'string' || spec.message.length === 0) {
        throw new InvalidParameterError('message', spec.message, 'must be a non-empty string');
    }
    const error: ProviderErrorObject = {
        // Finite, or the advisory default: `NaN` is a number too, and it
        // would have been signed as `null`.
        status: typeof spec.status === 'number' && Number.isFinite(spec.status) ? spec.status : 400,
        code: spec.code,
        message: spec.message,
    };
    if (Array.isArray(spec.invalidParams) && spec.invalidParams.length > 0) {
        error.invalid_params = spec.invalidParams.map((p) => ({
            path: String(p.path),
            code: String(p.code),
            message: String(p.message),
        }));
    }
    return { error };
}
