import { FieldValidation, ValidationResult, FormFieldParams, ValidationError as ValidationErrorType, createValidationError } from '../types';

/**
 * A media `value` is a path RELATIVE to the provider's service base.
 *
 * The renderer resolves it against that base and refuses anything absolute —
 * `http(s)://` and `//host` (no arbitrary external host, no cleartext),
 * `file://` (would read the device's own files) and `data:` (untrusted inline
 * payload). It refuses by displaying NOTHING, which is the worst way for a
 * provider to learn the rule, so the SDKs refuse it here instead, when the
 * view is built. A CDN is reached by answering the relative URL with a 3xx.
 *
 * The rule is "no scheme and no network path", not a list of schemes: a
 * `javascript:` or `mailto:` value, or a scheme nobody has thought of, resolves
 * away from the service base just the same. And a backslash counts as a
 * slash, because the web renderer resolves with WHATWG URL semantics where
 * `\\host/a.jpg` and `https:\\host` are absolute.
 */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/;
// WHATWG strips leading/trailing C0 controls and every tab or newline BEFORE
// parsing, so `\x01https://host` and `ht\ntps://host` are absolute in a
// browser while a plain prefix check reads them as relative. A media path
// never legitimately carries a control character: refuse the value outright.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export const MEDIA_FIELD_TYPES = ['photo', 'file', 'audio', 'video'];

/**
 * The stored-media-path rule, on its own so that every path a `value` can
 * take runs it: `addField` at build time, and `updateField` — hence
 * `setFieldValue` and `injectData` — when a value is set after the fact.
 * Returns no error for a field that is not a media field, or has no value.
 */
export function validateStoredMediaPaths(fieldType: string, fieldId: string, value: unknown): ReturnType<typeof createValidationError>[] {
    const errors: ReturnType<typeof createValidationError>[] = [];
    // `null` is "no value", as `None` is in Python; neither reaches the wire.
    if (!MEDIA_FIELD_TYPES.includes(fieldType) || value === undefined || value === null) return errors;
    const paths = Array.isArray(value) ? value : [value];
    for (const path of paths) {
        if (typeof path !== 'string' || !isRelativeAssetPath(path)) {
            errors.push(createValidationError(
                `Stored media path '${String(path)}' must be relative to the service base (a scheme, a //host and their backslash forms are refused)`,
                fieldId
            ));
        }
    }
    return errors;
}

export function isRelativeAssetPath(value: string): boolean {
    if (CONTROL_CHARACTER.test(value)) return false;
    const trimmed = value.trim().toLowerCase().replace(/\\/g, '/');
    if (trimmed.length === 0) return false;
    if (trimmed.startsWith('//')) return false;
    return !SCHEME_PREFIX.test(trimmed);
}

export class DataSanitizer {
    /**
     * Sanitizes user input to prevent injection attacks
     * @param input - String to sanitize
     * @param options - Sanitization options
     * @returns Sanitized string
     */
    static sanitizeInput(input: string, options: { allowHtml?: boolean } = {}): string {
        if (typeof input !== 'string') return '';

        let sanitized = input.trim();

        // Remove null bytes (can cause issues in C-based parsers)
        sanitized = sanitized.replace(/\0/g, '');

        // Normalize Unicode to prevent homograph attacks
        // NFD = Canonical Decomposition, then recompose to NFC
        sanitized = sanitized.normalize('NFC');

        // HTML encoding unless explicitly allowed
        if (!options.allowHtml) {
            sanitized = sanitized
                .replace(/&/g, '&amp;')   // Must be first
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;');
        }

        return sanitized;
    }

    static validateCoordinates(lat: number, lon: number): boolean {
        return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    }

    static validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * A URL the client may be asked to open — so only the two schemes it can
     * meaningfully open are accepted.
     *
     * `new URL(...)` alone was the whole test, and it parses anything with a
     * scheme: `javascript:alert(1)`, `data:text/html,...` and `vbscript:` all
     * passed as valid values for a `url` field, which the renderer then puts
     * in front of the user. Python refused them by requiring a network
     * location, incidentally rather than by rule; both now state the rule.
     */
    static validateURL(url: string): boolean {
        try {
            const parsed = new URL(url);
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
                && parsed.host.length > 0;
        } catch {
            return false;
        }
    }

    static validatePhoneNumber(phone: string): boolean {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    static validateDate(dateString: string): boolean {
        // Validate ISO 8601 date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateString)) return false;

        const date = new Date(dateString);
        return !isNaN(date.getTime()) && date.toISOString().split('T')[0] === dateString;
    }

    static validateNumber(value: unknown): boolean {
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
    }

    static validatePlusCode(plusCode: string): boolean {
        // Plus Code format: 8 characters + separator + 2-3 characters (e.g., 8FVC9G8F+6W)
        const plusCodeRegex = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}$/;
        return plusCodeRegex.test(plusCode.replace(/\s/g, '').toUpperCase());
    }

    static validatePassword(password: string, minLength: number = 8): { valid: boolean; error?: string } {
        if (password.length < minLength) {
            return { valid: false, error: `Password must be at least ${minLength} characters long` };
        }

        // Check for at least one lowercase letter
        if (!/[a-z]/.test(password)) {
            return { valid: false, error: 'Password must contain at least one lowercase letter' };
        }

        // Check for at least one uppercase letter
        if (!/[A-Z]/.test(password)) {
            return { valid: false, error: 'Password must contain at least one uppercase letter' };
        }

        // Check for at least one digit
        if (!/\d/.test(password)) {
            return { valid: false, error: 'Password must contain at least one digit' };
        }

        return { valid: true };
    }
}

export class FieldValidator {
    static validateField(
        fieldType: string,
        fieldId: string,
        fieldLabel: string,
        params?: FormFieldParams
    ): ValidationResult {
        const errors: ValidationErrorType[] = [];
        const warnings: ValidationErrorType[] = [];

        // Basic validation
        if (!fieldId || fieldId.trim() === '') {
            errors.push(createValidationError('Field ID is required', fieldId));
        }

        // Display-only fields (separator, paragraph) carry no label.
        if (!['separator', 'paragraph', 'spacer'].includes(fieldType) && (!fieldLabel || fieldLabel.trim() === '')) {
            errors.push(createValidationError('Field label is required', fieldId));
        }

        if (!fieldType || fieldType.trim() === '') {
            errors.push(createValidationError('Field type is required', fieldId));
        }

        // Skip validation rules for the purely visual types. NOTE: 'paragraph'
        // is skipped by the Python SDK here but not by this one — a divergence
        // that predates this list and is left as is on purpose.
        if (['separator', 'spacer'].includes(fieldType)) {
            return {
                isValid: errors.length === 0,
                errors,
                warnings
            };
        }

        // Parameter validation
        if (params) {
            // Length validation
            if (params.minLength !== undefined && params.minLength < 0) {
                errors.push(createValidationError('minLength must be non-negative', fieldId));
            }

            if (params.maxLength !== undefined && params.maxLength < 0) {
                errors.push(createValidationError('maxLength must be non-negative', fieldId));
            }

            if (params.minLength !== undefined && params.maxLength !== undefined &&
                params.minLength > params.maxLength) {
                errors.push(createValidationError('minLength cannot be greater than maxLength', fieldId));
            }

            // Numeric value validation
            if (params.min !== undefined && params.max !== undefined &&
                params.min > params.max) {
                errors.push(createValidationError('min value cannot be greater than max value', fieldId));
            }

            // Option validation for select fields
            if (params.options && (!Array.isArray(params.options) || params.options.length === 0)) {
                errors.push(createValidationError('Options must be a non-empty array for select fields', fieldId));
            }

            // MIME type validation
            if (params.accept && (!Array.isArray(params.accept) || params.accept.length === 0)) {
                errors.push(createValidationError('Accept must be a non-empty array for file fields', fieldId));
            }

            // Multi-capture validation (photo / file / audio / video)
            if (params.maxCount !== undefined) {
                if (!Number.isInteger(params.maxCount) || params.maxCount < 1) {
                    errors.push(createValidationError('maxCount must be a positive integer', fieldId));
                } else if (params.maxCount > 1 && params.multiple !== true) {
                    warnings.push(createValidationError('maxCount is ignored unless multiple is true', fieldId));
                }
            }

            // Dependency validation
            if (params.dependencies && (!Array.isArray(params.dependencies) ||
                params.dependencies.some(dep => !dep || dep.trim() === ''))) {
                errors.push(createValidationError('Dependencies must be a non-empty array of valid field IDs', fieldId));
            }
        }

        // Ces controles de format ne portent que sur des valeurs textuelles
        // (email, URL, telephone...). Depuis que `value` peut aussi etre une
        // liste d'URL de medias deja detenus par le fournisseur, on isole le
        // cas scalaire une fois pour toutes plutot que de le tester partout.
        const scalarValue = typeof params?.value === 'string' ? params.value : undefined;

        // A stored media path must be relative to the service base. Checked
        // before the switch rather than as a case of it: `photo` and `file`
        // already have a case further down, and a second one silently shadows
        // it — the accepted-formats check simply stopped running.
        errors.push(...validateStoredMediaPaths(fieldType, fieldId, params?.value));

        // Field-type-specific validation
        switch (fieldType) {
            case 'email':
                if (scalarValue && !DataSanitizer.validateEmail(scalarValue)) {
                    errors.push(createValidationError('Invalid email format', fieldId));
                }
                break;

            case 'url':
                if (scalarValue && !DataSanitizer.validateURL(scalarValue)) {
                    errors.push(createValidationError('Invalid URL format', fieldId));
                }
                break;

            case 'phone':
                if (scalarValue && !DataSanitizer.validatePhoneNumber(scalarValue)) {
                    errors.push(createValidationError('Invalid phone number format', fieldId));
                }
                break;

            case 'gps':
                if (scalarValue) {
                    try {
                        const coords = JSON.parse(scalarValue);
                        if (!DataSanitizer.validateCoordinates(coords.lat, coords.lon)) {
                            errors.push(createValidationError('Invalid GPS coordinates', fieldId));
                        }
                    } catch {
                        errors.push(createValidationError('Invalid GPS coordinates format', fieldId));
                    }
                }
                break;

            case 'password':
                if (params?.minLength !== undefined && params.minLength < 8) {
                    warnings.push(createValidationError('Password minimum length should be at least 8 characters for security', fieldId));
                }
                if (scalarValue) {
                    const passwordResult = DataSanitizer.validatePassword(scalarValue, params?.minLength || 8);
                    if (!passwordResult.valid && passwordResult.error) {
                        errors.push(createValidationError(passwordResult.error, fieldId));
                    }
                }
                break;

            case 'number':
                if (params?.value !== undefined && !DataSanitizer.validateNumber(params.value)) {
                    errors.push(createValidationError('Invalid number value', fieldId));
                }
                if (params?.min !== undefined && !DataSanitizer.validateNumber(params.min)) {
                    errors.push(createValidationError('Invalid min value', fieldId));
                }
                if (params?.max !== undefined && !DataSanitizer.validateNumber(params.max)) {
                    errors.push(createValidationError('Invalid max value', fieldId));
                }
                break;

            case 'date':
                if (params?.value && typeof params.value === 'string' && !DataSanitizer.validateDate(params.value)) {
                    errors.push(createValidationError('Invalid date format (expected YYYY-MM-DD)', fieldId));
                }
                if (params?.minDate && typeof params.minDate === 'string' && !DataSanitizer.validateDate(params.minDate)) {
                    errors.push(createValidationError('Invalid minDate format (expected YYYY-MM-DD)', fieldId));
                }
                if (params?.maxDate && typeof params.maxDate === 'string' && !DataSanitizer.validateDate(params.maxDate)) {
                    errors.push(createValidationError('Invalid maxDate format (expected YYYY-MM-DD)', fieldId));
                }
                // Validate date range logic
                if (params?.minDate && params?.maxDate &&
                    typeof params.minDate === 'string' && typeof params.maxDate === 'string') {
                    const minDate = new Date(params.minDate);
                    const maxDate = new Date(params.maxDate);
                    if (minDate > maxDate) {
                        errors.push(createValidationError('minDate cannot be after maxDate', fieldId));
                    }
                }
                break;

            case 'pluscode':
                if (params?.value && typeof params.value === 'string' && !DataSanitizer.validatePlusCode(params.value)) {
                    errors.push(createValidationError('Invalid Plus Code format (expected format: 8FVC9G8F+6W)', fieldId));
                }
                break;

            case 'textarea':
                // Same validations as text field but with larger typical limits
                if (params?.maxLength && params.maxLength < 10) {
                    warnings.push(createValidationError('Textarea maxLength is very small, consider using text field instead', fieldId));
                }
                break;

            case 'checkbox':
                if (params?.value !== undefined && typeof params.value !== 'boolean') {
                    errors.push(createValidationError('Checkbox value must be boolean', fieldId));
                }
                break;

            case 'select':
                if (!params?.options || params.options.length === 0) {
                    errors.push(createValidationError('Select fields must have options', fieldId));
                }
                // Validate option structure
                if (params?.options && Array.isArray(params.options)) {
                    params.options.forEach((option, index) => {
                        if (!option || typeof option !== 'object') {
                            errors.push(createValidationError(`Option at index ${index} must be an object with label and value`, fieldId));
                        } else if (!('label' in option) || !('value' in option)) {
                            errors.push(createValidationError(`Option at index ${index} must have 'label' and 'value' properties`, fieldId));
                        }
                    });
                }
                break;

            case 'file':
            case 'photo':
                if (!params?.accept || params.accept.length === 0) {
                    errors.push(createValidationError('File fields must specify accepted types', fieldId));
                }
                // Validate file format specifications
                if (params?.accept && Array.isArray(params.accept)) {
                    params.accept.forEach((format, index) => {
                        if (typeof format !== 'string' || format.trim() === '') {
                            errors.push(createValidationError(`File format at index ${index} must be a non-empty string`, fieldId));
                        }
                    });
                }
                break;

            case 'audio':
            case 'video': {
                if (!params?.accept || params.accept.length === 0) {
                    errors.push(createValidationError('Recording fields must specify accepted types', fieldId));
                }

                // Duration is what bounds the upload size. Video can realistically
                // exceed a provider's request body limit, so there it is mandatory;
                // for audio a missing bound is only worth a warning.
                if (params?.maxDuration === undefined) {
                    if (fieldType === 'video') {
                        errors.push(createValidationError(
                            'Video fields must specify maxDuration (seconds) — it is what bounds the upload size',
                            fieldId
                        ));
                    } else {
                        warnings.push(createValidationError(
                            'Audio field has no maxDuration; a recording can then grow unbounded',
                            fieldId
                        ));
                    }
                } else if (!Number.isFinite(params.maxDuration) || params.maxDuration <= 0) {
                    errors.push(createValidationError('maxDuration must be a positive number of seconds', fieldId));
                }

                if (params?.minDuration !== undefined) {
                    if (!Number.isFinite(params.minDuration) || params.minDuration < 0) {
                        errors.push(createValidationError('minDuration must be a non-negative number of seconds', fieldId));
                    } else if (params.maxDuration !== undefined && params.minDuration > params.maxDuration) {
                        errors.push(createValidationError('minDuration cannot be greater than maxDuration', fieldId));
                    }
                }

                if (params?.source !== undefined && !['record', 'library', 'both'].includes(params.source)) {
                    errors.push(createValidationError(
                        `Invalid source '${params.source}' (expected 'record', 'library' or 'both')`,
                        fieldId
                    ));
                }

                if (params?.maxSize !== undefined && (!Number.isFinite(params.maxSize) || params.maxSize <= 0)) {
                    errors.push(createValidationError('maxSize must be a positive number of bytes', fieldId));
                }

                if (params?.quality !== undefined) {
                    if (fieldType === 'audio') {
                        warnings.push(createValidationError('quality only applies to video fields and is ignored here', fieldId));
                    } else if (!['low', 'medium', 'high'].includes(params.quality)) {
                        errors.push(createValidationError(
                            `Invalid quality '${params.quality}' (expected 'low', 'medium' or 'high')`,
                            fieldId
                        ));
                    }
                }
                break;
            }

            case 'hidden':
                // Hidden fields must have a value
                if (params?.value === undefined || params?.value === null) {
                    errors.push(createValidationError('Hidden fields must have a value', fieldId));
                }
                break;

            case 'text':
                // Basic text field validation is already handled in general params validation
                break;

            default:
                warnings.push(createValidationError(`Unknown field type: ${fieldType}`, fieldId));
        }

        // Warnings
        if (fieldId.length > 50) {
            warnings.push(createValidationError('Field ID is quite long, consider using a shorter identifier', fieldId));
        }

        if (fieldLabel.length > 100) {
            warnings.push(createValidationError('Field label is quite long, consider using a shorter label', fieldId));
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
}

export class FormValidator {
    static validateFormData(
        formData: Record<string, unknown>,
        fieldValidations: Map<string, FieldValidation>
    ): ValidationResult {
        const errors: ValidationErrorType[] = [];
        const warnings: ValidationErrorType[] = [];

        for (const [fieldId, validation] of fieldValidations) {
            const value = formData[fieldId];

            // Required field validation
            if (validation.required && (value === undefined || value === null || value === '')) {
                errors.push(createValidationError(`Field '${fieldId}' is required`, fieldId));
                continue;
            }

            // Dependency validation
            if (validation.dependencies) {
                for (const dependency of validation.dependencies) {
                    if (!formData[dependency]) {
                        errors.push(createValidationError(
                            `Field '${fieldId}' depends on '${dependency}' which is not filled`,
                            fieldId
                        ));
                        break;
                    }
                }
            }

            // Conditional validation
            if (validation.conditional && !validation.conditional(formData)) {
                continue; // Skip validation if condition is not met
            }

            // Pattern validation
            if (validation.pattern && typeof value === 'string' && !validation.pattern.test(value)) {
                errors.push(createValidationError(`Field '${fieldId}' does not match required pattern`, fieldId));
            }

            // Length validation
            if (typeof value === 'string') {
                if (validation.minLength !== undefined && value.length < validation.minLength) {
                    errors.push(createValidationError(
                        `Field '${fieldId}' must be at least ${validation.minLength} characters long`,
                        fieldId
                    ));
                }

                if (validation.maxLength !== undefined && value.length > validation.maxLength) {
                    errors.push(createValidationError(
                        `Field '${fieldId}' must be at most ${validation.maxLength} characters long`,
                        fieldId
                    ));
                }
            }

            // Numeric value validation
            if (typeof value === 'number') {
                if (validation.min !== undefined && value < validation.min) {
                    errors.push(createValidationError(`Field '${fieldId}' must be at least ${validation.min}`, fieldId));
                }

                if (validation.max !== undefined && value > validation.max) {
                    errors.push(createValidationError(`Field '${fieldId}' must be at most ${validation.max}`, fieldId));
                }
            }

            // Custom validation
            if (validation.customValidator) {
                try {
                    const result = validation.customValidator(value);
                    if (typeof result === 'string') {
                        errors.push(createValidationError(`Field '${fieldId}': ${result}`, fieldId));
                    } else if (!result) {
                        errors.push(createValidationError(`Field '${fieldId}' failed custom validation`, fieldId));
                    }
                } catch (error) {
                    errors.push(createValidationError(
                        `Field '${fieldId}' custom validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        fieldId
                    ));
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
}

/**
 * Configuration for secure URL validation
 */
export interface URLValidationConfig {
    allowedDomains?: string[];
    allowedProtocols?: string[];
    blockPrivateIPs?: boolean;
    blockLocalhost?: boolean;
    maxUrlLength?: number;
}

export interface NavigationTargetValidationOptions {
    allowRelative?: boolean;
    allowViewId?: boolean;
}

/**
 * Securely validates a submission URL
 */
export function validateSubmissionURL(url: string, config: URLValidationConfig = {}): ValidationResult {
    const errors: ValidationErrorType[] = [];
    const warnings: ValidationErrorType[] = [];

    try {
        const urlObj = new URL(url);

        // 1. Length validation
        if (config.maxUrlLength && url.length > config.maxUrlLength) {
            errors.push(createValidationError(`URL too long (max ${config.maxUrlLength} characters)`));
        }

        // 2. Allowed protocol validation
        const allowedProtocols = config.allowedProtocols || ['https:', 'http:'];
        if (!allowedProtocols.includes(urlObj.protocol)) {
            errors.push(createValidationError(`Protocol '${urlObj.protocol}' not allowed. Allowed: ${allowedProtocols.join(', ')}`));
        }

        // 3. Block private IPs
        if (config.blockPrivateIPs !== false) {
            const hostname = urlObj.hostname;
            const privateIPPatterns = [
                /^10\./,
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
                /^192\.168\./,
                /^127\./,
                /^169\.254\./,
                /^fc00:/,
                /^fe80:/
            ];

            if (privateIPPatterns.some(pattern => pattern.test(hostname))) {
                errors.push(createValidationError('Private/local IP addresses are not allowed'));
            }
        }

        // 4. Block localhost
        if (config.blockLocalhost !== false) {
            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                errors.push(createValidationError('Localhost is not allowed'));
            }
        }

        // 5. Allowed domain validation
        if (config.allowedDomains && config.allowedDomains.length > 0) {
            const hostname = urlObj.hostname.toLowerCase();
            const isAllowed = config.allowedDomains.some(domain => {
                const allowedDomain = domain.toLowerCase();
                return hostname === allowedDomain || hostname.endsWith('.' + allowedDomain);
            });

            if (!isAllowed) {
                errors.push(createValidationError(`Domain '${hostname}' not in allowed list: ${config.allowedDomains.join(', ')}`));
            }
        }

        // 6. Dangerous port validation
        const dangerousPorts = [21, 22, 23, 25, 53, 80, 110, 143, 993, 995, 3306, 5432, 6379, 27017];
        if (urlObj.port && dangerousPorts.includes(parseInt(urlObj.port))) {
            warnings.push(createValidationError(`Using potentially dangerous port: ${urlObj.port}`));
        }

        // 7. Suspicious character validation
        const suspiciousPatterns = [
            /\.\./, // Directory traversal
            /javascript:/i, // JavaScript protocol
            /data:/i, // Data URLs
            /vbscript:/i, // VBScript protocol
            /file:/i // File protocol
        ];

        if (suspiciousPatterns.some(pattern => pattern.test(url))) {
            errors.push(createValidationError('URL contains suspicious patterns'));
        }

    } catch (error) {
        errors.push(createValidationError('Invalid URL format'));
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
    };
}

/**
 * Secure default configuration
 */
export const DEFAULT_URL_CONFIG: URLValidationConfig = {
    allowedProtocols: ['https:'],
    blockPrivateIPs: true,
    blockLocalhost: true,
    maxUrlLength: 2048
};

export function validateNavigationTarget(
    target: string,
    config: URLValidationConfig = {},
    options: NavigationTargetValidationOptions = {}
): ValidationResult {
    const errors: ValidationErrorType[] = [];
    const warnings: ValidationErrorType[] = [];
    const trimmed = target.trim();

    if (!trimmed) {
        errors.push(createValidationError('Navigation target cannot be empty'));
        return { isValid: false, errors };
    }

    const effectiveConfig = {
        ...DEFAULT_URL_CONFIG,
        ...config
    };

    if (effectiveConfig.maxUrlLength && trimmed.length > effectiveConfig.maxUrlLength) {
        errors.push(createValidationError(`URL too long (max ${effectiveConfig.maxUrlLength} characters)`));
    }

    const suspiciousPatterns = [
        /\.\./,
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /file:/i,
        /[\u0000-\u001F\u007F]/,
    ];
    if (suspiciousPatterns.some(pattern => pattern.test(trimmed))) {
        errors.push(createValidationError('URL contains suspicious patterns'));
    }

    if (/\s/.test(trimmed)) {
        errors.push(createValidationError('Navigation target cannot contain whitespace'));
    }

    const absoluteLike = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    if (absoluteLike) {
        const absoluteValidation = validateSubmissionURL(trimmed, effectiveConfig);
        return {
            isValid: errors.length === 0 && absoluteValidation.isValid,
            errors: [...errors, ...absoluteValidation.errors],
            warnings: absoluteValidation.warnings ?? (warnings.length > 0 ? warnings : undefined)
        };
    }

    if (trimmed.startsWith('//')) {
        errors.push(createValidationError('Protocol-relative URLs are not allowed'));
    }

    const relativeAllowed = options.allowRelative !== false;
    const viewIdAllowed = options.allowViewId === true;
    const looksLikePath = trimmed.startsWith('/') || trimmed.startsWith('?') || trimmed.startsWith('#') || trimmed.includes('/');
    const safeRelativeToken = /^[A-Za-z0-9._~\-]+$/.test(trimmed);
    const isAccepted =
        (relativeAllowed && looksLikePath) ||
        (viewIdAllowed && safeRelativeToken) ||
        (relativeAllowed && safeRelativeToken);

    if (!isAccepted) {
        errors.push(createValidationError('Navigation target must be an absolute https/http URL, a safe relative path, or an allowed viewId'));
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
    };
}
