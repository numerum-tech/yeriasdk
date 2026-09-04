import { InvalidParameterError } from '../errors';

/**
 * The one serializer for anything that gets signed. Compact, as
 * `JSON.stringify` is by default (Python matches with compact separators), and
 * it refuses a non-finite number: `NaN` and `±Infinity` have no JSON form, so
 * `JSON.stringify` would write `null` and the client would read a value the
 * provider never set. The replacer runs AFTER `toJSON`, so the bytes checked
 * are the bytes signed — a nested `toJSON()` yielding `NaN` is caught too.
 */
export function stringifyForSigning(value: unknown): string {
    return JSON.stringify(value, (key, v) => {
        if (typeof v === 'number' && !Number.isFinite(v)) {
            throw new InvalidParameterError(key || 'payload', v, 'payload contains a non-finite number');
        }
        return v;
    });
}
