import { BaseView } from './base-view';
import { QRScanContent } from '../types';
import { InvalidParameterError } from '../errors';

/**
 * QRScanView - A view for scanning QR codes
 *
 * **Design Principles:**
 * - Mobile app handles ALL scanner implementation (camera, torch, focus, formats, UI)
 * - View only describes what to scan and where to submit
 * - Convention: Field name is ALWAYS "qrData" (not configurable)
 * - Auto-submit by default: scan → immediately POST { qrData: "ABC123" }
 * - Submit button disables auto-submit for manual confirmation workflows
 * - The preview is read-only: a retypable value would let anything be posted
 *   as if it had been scanned
 *
 * **Submission Convention:**
 * - Auto-submit: POST {service.baseUrl}/{viewId} with { qrData: "scanned-value" }
 * - With button: User scans, previews, clicks button to submit
 *
 * **Rejected scans:** when a scanned value fails `validation`, the client stops
 * the scanner and shows `validation.errorMessage` — it does not silently keep
 * scanning, and it never echoes the refused value. Write that message so it
 * states the rule ("must start with PROD- followed by 6 to 12 digits"), not
 * just "invalid code".
 *
 * Extends {@link BaseView}. Created via the YeriaApp/YeriaUI factory, populated
 * with the builder methods below (setIntro, submitButton, setValidation,
 * enablePreview, setAutoSubmit), then serialized and signed into a v3 envelope
 * by serve().
 *
 * @example
 * // Simple: Auto-submit after scan
 * const view = new QRScanView('scan-ticket', 'Scan Your Ticket')
 *     .setIntro('Point camera at the QR code on your ticket');
 * // → Scans, immediately POSTs { qrData: "ABC123" } to {baseUrl}/scan-ticket
 *
 * @example
 * // Manual confirmation workflow
 * const view = new QRScanView('verify-product', 'Verify Product')
 *     .setIntro('Scan the product barcode')
 *     .enablePreview('Product Code')
 *     .submitButton('Verify Product');
 * // → Scans, shows preview, user clicks "Verify Product" to submit
 *
 * @example
 * // With validation
 * const view = new QRScanView('scan-invoice', 'Scan Invoice')
 *     .setIntro('Scan the invoice QR code')
 *     .setValidation(/^INV-\d{6}$/, 'Invalid invoice format')
 *     .submitButton('Process Invoice');
 * // → Scans, validates pattern, shows preview, submits on button click
 */
export class QRScanView extends BaseView {

    static fromJson(json: Record<string, unknown>): QRScanView {
        return QRScanView.fromJsonAs(QRScanView, 'QRScan', json);
    }
    constructor(viewId: string, title: string, processId?: string) {
        super({
            id: viewId,
            type: 'QRScan',
            processId,
            metadata: {
                version: '2.0.0',
                createdAt: new Date()
            }
        });

        this.content = {
            title,
            autoSubmit: true  // Auto-submit by default
        } as QRScanContent;
    }

    /**
     * Sets instructional text shown to the user
     *
     * @param intro - Instructions like "Point your camera at the QR code"
     * @returns this for chaining
     *
     * @example
     * view.setIntro('Scan the code on your membership card');
     */
    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    /**
     * Configures a submit button for manual confirmation
     * **IMPORTANT**: Automatically disables auto-submit when button is added
     * **Note**: QRScan submissions are always POST (convention-based security)
     *
     * @param text - Button text like "Confirm", "Process", "Submit"
     * @param confirmMessage - Optional message to show with the scanned value.
     *                   Renderers display it as help text on the scan result
     *                   screen, not as a modal: on a QRScan the tap on this
     *                   button already IS the confirmation, so a dialog would
     *                   ask the same question twice.
     * @returns this for chaining
     *
     * @example
     * view.submitButton('Verify Code');
     * // User must click button after scanning
     *
     * @example
     * view.submitButton('Verify Product', 'Check the reference against the label before validating.');
     */
    submitButton(text: string, confirmMessage?: string): this {
        if (!text || text.trim().length === 0) {
            throw new InvalidParameterError('text', text, 'Button text cannot be empty');
        }

        (this.content as QRScanContent).submit = {
            text: text.trim(),
            method: 'POST',
            confirmMessage: confirmMessage?.trim() || undefined
        };

        // Disable auto-submit when button is present
        (this.content as QRScanContent).autoSubmit = false;

        return this;
    }

    /**
     * Sets simple validation rules for scanned data
     * **IMPORTANT**: Mobile app validates client-side for UX, but server MUST re-validate for security
     *
     * @param errorMessage - Error message shown on validation failure
     * @param format - Data format: 'text' (any), 'number' (digits only), 'url' (http/https), 'email' (has @ and .)
     * @param minLength - Minimum length (includes prefix if startsWith is set)
     * @param maxLength - Maximum length (includes prefix if startsWith is set)
     * @param startsWith - Required prefix (exempt from format validation)
     * @returns this for chaining
     *
     * @example
     * // Numeric code with exact length
     * view.setValidation('Code must be 6 digits', 'number', 6, 6);
     * // Accepts: "123456", "000001"
     *
     * @example
     * // Prefix + format + length range
     * view.setValidation('Invalid invoice', 'number', 10, 15, 'INV-');
     * // Accepts: "INV-123456" (10-15 chars total, digits after INV-)
     *
     * @example
     * // Email format
     * view.setValidation('Invalid email format', 'email');
     * // Accepts: "user@example.com" (simple check: has @ and .)
     *
     * @example
     * // URL format
     * view.setValidation('Invalid URL', 'url');
     * // Accepts: "https://example.com" (starts with http:// or https://)
     *
     * @example
     * // Just prefix, any content after
     * view.setValidation('Must start with TICKET-', undefined, undefined, undefined, 'TICKET-');
     * // Accepts: "TICKET-ABC123", "TICKET-XYZ"
     *
     * @example
     * // Length range without format
     * view.setValidation('Code must be 8-20 characters', undefined, 8, 20);
     */
    setValidation(
        errorMessage: string,
        format?: 'text' | 'number' | 'url' | 'email',
        minLength?: number,
        maxLength?: number,
        startsWith?: string
    ): this {
        if (!errorMessage || errorMessage.trim().length === 0) {
            throw new InvalidParameterError('errorMessage', errorMessage, 'Error message is required for validation');
        }

        const validation: NonNullable<QRScanContent['validation']> = {
            errorMessage: errorMessage.trim()
        };

        // Validate and set format
        if (format !== undefined) {
            const validFormats: Array<'text' | 'number' | 'url' | 'email'> = ['text', 'number', 'url', 'email'];
            if (!validFormats.includes(format)) {
                throw new InvalidParameterError('format', format, `Format must be one of: ${validFormats.join(', ')}`);
            }
            validation.format = format;
        }

        // Validate and set startsWith prefix
        if (startsWith !== undefined && startsWith !== null) {
            const trimmed = startsWith.trim();
            if (trimmed.length === 0) {
                throw new InvalidParameterError('startsWith', startsWith, 'startsWith cannot be empty');
            }
            validation.startsWith = trimmed;
        }

        // Validate and set minLength
        if (minLength !== undefined) {
            if (minLength < 0) {
                throw new InvalidParameterError('minLength', minLength, 'minLength must be >= 0');
            }
            validation.minLength = minLength;
        }

        // Validate and set maxLength
        if (maxLength !== undefined) {
            if (maxLength < 1) {
                throw new InvalidParameterError('maxLength', maxLength, 'maxLength must be >= 1');
            }
            if (minLength !== undefined && maxLength < minLength) {
                throw new InvalidParameterError('maxLength', maxLength, 'maxLength must be >= minLength');
            }
            validation.maxLength = maxLength;
        }

        (this.content as QRScanContent).validation = validation;
        return this;
    }

    /**
     * Enables preview mode: the scanned value is echoed back, read-only,
     * before submission.
     * **Note**: Requires submit button to be set
     *
     * The preview is never editable — a value the user can retype could be
     * posted as if it had been scanned, which defeats the point of scanning.
     * Only enable it when the scanned value means something to the user (a
     * ticket reference, an invoice number printed next to the code); for
     * opaque payloads, auto-submit and return a view describing what the code
     * resolved to instead.
     *
     * @param label - Field label in preview (default: "Scanned Code")
     * @returns this for chaining
     *
     * @example
     * view.enablePreview('Barcode')
     *     .submitButton('Confirm');
     */
    enablePreview(label?: string): this {
        (this.content as QRScanContent).preview = {
            enabled: true,
            label: label?.trim() || 'Scanned Code'
        };

        return this;
    }

    /**
     * Disables preview mode
     * @returns this for chaining
     */
    disablePreview(): this {
        (this.content as QRScanContent).preview = undefined;
        return this;
    }

    /**
     * Explicitly enables or disables auto-submit
     * **Note**: Auto-submit is automatically disabled when submitButton() is called
     *
     * @param enabled - Enable auto-submit (default: true)
     * @returns this for chaining
     *
     * @example
     * // Explicit auto-submit
     * view.setAutoSubmit(true);  // Scan → immediate POST
     *
     * @example
     * // Disable auto-submit without button (rare case)
     * view.setAutoSubmit(false);
     */
    setAutoSubmit(enabled: boolean = true): this {
        (this.content as QRScanContent).autoSubmit = enabled;
        return this;
    }

    // ============================================
    // Getters
    // ============================================

    /**
     * Validates the view configuration before serving
     * @internal
     */
    override validate(): import('../types').ValidationResult {
        const baseResult = super.validate();

        const content = this.content as QRScanContent;
        const errors = [...baseResult.errors];

        // Preview requires submit button
        if (content.preview?.enabled && !content.submit) {
            errors.push({ message: 'Preview mode requires a submit button' });
        }

        // No rule for submit.confirmMessage: it lives inside `submit`, so it
        // cannot exist without the step it is displayed on.

        // Validation without submit button is allowed (auto-submit with validation)
        // But it's recommended to have a button for better UX

        return {
            isValid: errors.length === 0,
            errors,
            warnings: baseResult.warnings
        };
    }
}
