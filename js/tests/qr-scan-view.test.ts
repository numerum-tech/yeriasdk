/**
 * Tests for QRScanView - Simplified scanner view
 * Tests convention-based design, auto-submit behavior, and validation
 */

import { QRScanView } from '../src/core/qr-scan-view';
import { InvalidParameterError } from '../src/errors';

describe('QRScanView - Simplified Design Tests', () => {
    let view: QRScanView;

    beforeEach(() => {
        view = new QRScanView('scan-test', 'Test Scanner');
    });

    describe('Constructor and Basic Properties', () => {
        it('should create a QRScan view with correct type', () => {
            const json = view.toJSON();

            expect(json.type).toBe('QRScan');
            expect(json.id).toBe('scan-test');
        });

        it('should set title correctly', () => {
            const json = view.toJSON();
            expect((json.content as any)['title']).toBe('Test Scanner');
        });

        it('should default to auto-submit enabled', () => {
            const json = view.toJSON();
            expect((json.content as any)['autoSubmit']).toBe(true);
        });

        it('omits intro until it is set', () => {
            // Une clé vide obligerait chaque renderer à distinguer « pas
            // d'introduction » de « introduction vide » — et tous ne le font
            // pas : le lecteur mobile réservait 51 px de bande blanche.
            const json = view.toJSON();
            expect((json.content as any)['intro']).toBeUndefined();

            view.setIntro('Scannez le code');
            expect((view.toJSON().content as any)['intro']).toBe('Scannez le code');
        });

        it('should accept optional processId', () => {
            const processView = new QRScanView('scan-process', 'Process Scanner', 'onboarding');
            const json = processView.toJSON();

            expect((json.process as any)?.processId).toBe('onboarding');
        });

        it('should set version to 2.0.0', () => {
            const json = view.toJSON();
            expect((json.metadata as any)?.version).toBe('2.0.0');
        });
    });

    describe('setIntro() - Instructions', () => {
        it('should set intro text', () => {
            view.setIntro('Point your camera at the QR code');

            const json = view.toJSON();
            expect((json.content as any)['intro']).toBe('Point your camera at the QR code');
        });

        it('should trim whitespace', () => {
            view.setIntro('  Scan the code  ');

            const json = view.toJSON();
            expect((json.content as any)['intro']).toBe('Scan the code');
        });

        it('should reject empty intro', () => {
            expect(() => view.setIntro('')).toThrow(InvalidParameterError);
            expect(() => view.setIntro('   ')).toThrow(InvalidParameterError);
        });

        it('should return this for chaining', () => {
            const result = view.setIntro('Test');
            expect(result).toBe(view);
        });
    });

    describe('submitButton() - Manual Confirmation', () => {
        it('should configure submit button with text', () => {
            view.submitButton('Verify Code');

            const action = (view.toJSON().content as any)['submit'];
            expect(action).toBeDefined();
            expect(action?.text).toBe('Verify Code');
            expect(action?.method).toBe('POST');
        });

        it('should always use POST method', () => {
            view.submitButton('Process');

            const action = (view.toJSON().content as any)['submit'];
            expect(action?.method).toBe('POST');
        });

        it('should accept a confirmation message', () => {
            view.submitButton('Process', 'Check the reference on the label.');

            const action = (view.toJSON().content as any)['submit'];
            expect(action?.confirmMessage).toBe('Check the reference on the label.');
        });

        it('should automatically disable auto-submit when button is added', () => {
            expect((view.toJSON().content as any)['autoSubmit'] ?? true).toBe(true);

            view.submitButton('Confirm');

            expect((view.toJSON().content as any)['autoSubmit'] ?? true).toBe(false);
        });

        it('should trim button text', () => {
            view.submitButton('  Submit  ');

            const action = (view.toJSON().content as any)['submit'];
            expect(action?.text).toBe('Submit');
        });

        it('should reject empty button text', () => {
            expect(() => view.submitButton('')).toThrow(InvalidParameterError);
            expect(() => view.submitButton('   ')).toThrow(InvalidParameterError);
        });

        it('should return this for chaining', () => {
            const result = view.submitButton('Test');
            expect(result).toBe(view);
        });
    });

    describe('setValidation() - Simple Formats', () => {
        it('should set number format validation', () => {
            view.setValidation('Must be numeric', 'number');

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBe('number');
            expect(validation?.errorMessage).toBe('Must be numeric');
        });

        it('should set email format validation', () => {
            view.setValidation('Invalid email', 'email');

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBe('email');
            expect(validation?.errorMessage).toBe('Invalid email');
        });

        it('should set url format validation', () => {
            view.setValidation('Invalid URL', 'url');

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBe('url');
            expect(validation?.errorMessage).toBe('Invalid URL');
        });

        it('should set text format validation', () => {
            view.setValidation('Invalid text', 'text');

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBe('text');
            expect(validation?.errorMessage).toBe('Invalid text');
        });

        it('should set startsWith prefix', () => {
            view.setValidation('Invalid prefix', undefined, undefined, undefined, 'INV-');

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.startsWith).toBe('INV-');
            expect(validation?.format).toBeUndefined();
        });

        it('should combine format + startsWith + length', () => {
            view.setValidation('Invalid invoice', 'number', 10, 15, 'INV-');

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBe('number');
            expect(validation?.startsWith).toBe('INV-');
            expect(validation?.minLength).toBe(10);
            expect(validation?.maxLength).toBe(15);
            expect(validation?.errorMessage).toBe('Invalid invoice');
        });

        it('should set exact length with format', () => {
            view.setValidation('Must be 6 digits', 'number', 6, 6);

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBe('number');
            expect(validation?.minLength).toBe(6);
            expect(validation?.maxLength).toBe(6);
        });

        it('should set length constraints without format', () => {
            view.setValidation('Too short or too long', undefined, 10, 50);

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBeUndefined();
            expect(validation?.minLength).toBe(10);
            expect(validation?.maxLength).toBe(50);
        });

        it('should reject invalid format', () => {
            expect(() => view.setValidation('Error', 'invalid' as any)).toThrow(InvalidParameterError);
            expect(() => view.setValidation('Error', 'regex' as any)).toThrow(InvalidParameterError);
        });

        it('should reject empty startsWith', () => {
            expect(() => view.setValidation('Error', undefined, undefined, undefined, '')).toThrow(InvalidParameterError);
            expect(() => view.setValidation('Error', undefined, undefined, undefined, '   ')).toThrow(InvalidParameterError);
        });

        it('should reject negative minLength', () => {
            expect(() => view.setValidation('Error', undefined, -1)).toThrow(InvalidParameterError);
        });

        it('should reject maxLength < 1', () => {
            expect(() => view.setValidation('Error', undefined, undefined, 0)).toThrow(InvalidParameterError);
        });

        it('should reject maxLength < minLength', () => {
            expect(() => view.setValidation('Error', undefined, 10, 5)).toThrow(InvalidParameterError);
        });

        it('should require error message', () => {
            expect(() => view.setValidation('')).toThrow(InvalidParameterError);
            expect(() => view.setValidation('   ')).toThrow(InvalidParameterError);
        });

        it('should trim errorMessage and startsWith', () => {
            view.setValidation('  Error  ', 'number', undefined, undefined, '  INV-  ');

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.errorMessage).toBe('Error');
            expect(validation?.startsWith).toBe('INV-');
        });

        it('should allow validation without format (just length)', () => {
            view.setValidation('Too short', undefined, 10);

            const validation = (view.toJSON().content as any)['validation'];
            expect(validation?.format).toBeUndefined();
            expect(validation?.minLength).toBe(10);
        });

        it('should serialize to JSON correctly', () => {
            view.setValidation('Invalid format', 'number', 8, 12, 'CODE-');

            const json = view.toJSON();
            const validation = (json.content as any)['validation'];

            expect(validation.format).toBe('number');
            expect(validation.startsWith).toBe('CODE-');
            expect(validation.minLength).toBe(8);
            expect(validation.maxLength).toBe(12);
            expect(validation.errorMessage).toBe('Invalid format');
            expect(validation.pattern).toBeUndefined(); // No more regex
        });

        it('should return this for chaining', () => {
            const result = view.setValidation('Error', 'number');
            expect(result).toBe(view);
        });
    });

    describe('enablePreview() / disablePreview()', () => {
        it('should enable preview with default settings', () => {
            view.enablePreview();
            view.submitButton('Confirm');

            const preview = (view.toJSON().content as any)['preview'];
            expect(preview?.enabled).toBe(true);
            expect(preview?.label).toBe('Scanned Code');
        });

        // The preview is display-only by design: a value the user can retype
        // could be posted as if it had been scanned.
        it('should never emit an editable flag', () => {
            view.enablePreview('Barcode');
            view.submitButton('Confirm');

            const preview = (view.toJSON().content as any)['preview'];
            expect(preview?.editable).toBeUndefined();
            expect(preview?.label).toBe('Barcode');
        });

        it('should use default label if not provided', () => {
            view.enablePreview();
            view.submitButton('Confirm');

            const preview = (view.toJSON().content as any)['preview'];
            expect(preview?.label).toBe('Scanned Code');
        });

        it('should trim label text', () => {
            view.enablePreview('  Product Code  ');
            view.submitButton('Confirm');

            const preview = (view.toJSON().content as any)['preview'];
            expect(preview?.label).toBe('Product Code');
        });

        it('should disable preview', () => {
            view.enablePreview('Test');
            view.submitButton('Confirm');
            expect(((view.toJSON().content as any)['preview']?.enabled ?? false)).toBe(true);

            view.disablePreview();
            expect(((view.toJSON().content as any)['preview']?.enabled ?? false)).toBe(false);
            expect((view.toJSON().content as any)['preview']).toBeUndefined();
        });

        it('should return this for chaining', () => {
            const result = view.enablePreview();
            expect(result).toBe(view);
        });
    });

    describe('setAutoSubmit()', () => {
        it('should explicitly enable auto-submit', () => {
            view.setAutoSubmit(true);
            expect((view.toJSON().content as any)['autoSubmit'] ?? true).toBe(true);
        });

        it('should explicitly disable auto-submit', () => {
            view.setAutoSubmit(false);
            expect((view.toJSON().content as any)['autoSubmit'] ?? true).toBe(false);
        });

        it('should default to true when called without args', () => {
            view.setAutoSubmit(false);
            expect((view.toJSON().content as any)['autoSubmit'] ?? true).toBe(false);

            view.setAutoSubmit();
            expect((view.toJSON().content as any)['autoSubmit'] ?? true).toBe(true);
        });

        it('should return this for chaining', () => {
            const result = view.setAutoSubmit(true);
            expect(result).toBe(view);
        });
    });

    describe('validate() - View Configuration', () => {
        it('should validate successfully for simple auto-submit', () => {
            view.setIntro('Scan code');

            const result = view.validate();
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate successfully for manual submit', () => {
            view.setIntro('Scan code')
                .submitButton('Submit');

            const result = view.validate();
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject preview without submit button', () => {
            view.enablePreview();

            const result = view.validate();
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({ message: 'Preview mode requires a submit button' });
        });

        it('should accept preview with submit button', () => {
            view.enablePreview('Code')
                .submitButton('Confirm');

            const result = view.validate();
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should allow validation without submit button (auto-submit with validation)', () => {
            view.setValidation('Invalid code', 'number', 4, 4);

            const result = view.validate();
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('JSON Serialization', () => {
        it('should serialize simple auto-submit view', () => {
            view.setIntro('Scan the QR code');

            const json = view.toJSON();

            expect(json.type).toBe('QRScan');
            expect((json.content as any)['title']).toBe('Test Scanner');
            expect((json.content as any)['intro']).toBe('Scan the QR code');
            expect((json.content as any)['autoSubmit']).toBe(true);
            expect((json.content as any)['submit']).toBeUndefined();
        });

        it('should serialize manual submit view', () => {
            view.setIntro('Scan code')
                .enablePreview('Code')
                .submitButton('Process', 'Compare with the printed reference.');

            const json = view.toJSON();

            expect((json.content as any)['autoSubmit']).toBe(false);
            expect((json.content as any)['submit']).toEqual({
                text: 'Process',
                method: 'POST',
                confirmMessage: 'Compare with the printed reference.'
            });
        });

        it('should serialize validation rules', () => {
            view.setValidation('Invalid format', 'number', 8, 8, 'ABC-');

            const json = view.toJSON();
            const validation = (json.content as any)['validation'];

            expect(validation.format).toBe('number');
            expect(validation.startsWith).toBe('ABC-');
            expect(validation.errorMessage).toBe('Invalid format');
            expect(validation.minLength).toBe(8);
            expect(validation.maxLength).toBe(8);
        });

        it('should serialize preview configuration', () => {
            view.enablePreview('Product Code')
                .submitButton('Confirm');

            const json = view.toJSON();
            const preview = (json.content as any)['preview'];

            expect(preview.enabled).toBe(true);
            expect(preview.label).toBe('Product Code');
        });

        it('should not include elements array', () => {
            view.setIntro('Test');

            const json = view.toJSON();

            expect((json.content as any)['elements']).toBeUndefined();
        });
    });

    describe('Convention: "qrData" Field Name', () => {
        it('should document that mobile app always uses "qrData" field', () => {
            // This is a documentation test
            // Mobile app submits: { qrData: "scanned-value" }
            // There is NO configurable fieldName parameter

            view.setIntro('Scan');
            const json = view.toJSON();

            // No fieldName in JSON - it's a convention
            expect((json.content as any)['fieldName']).toBeUndefined();
        });
    });

    describe('Workflow Examples', () => {
        it('should support simple auto-submit workflow', () => {
            const scanView = new QRScanView('scan-ticket', 'Scan Your Ticket')
                .setIntro('Point camera at the QR code on your ticket');

            const json = scanView.toJSON();

            expect((json.content as any)['autoSubmit']).toBe(true);
            expect((json.content as any)['submit']).toBeUndefined();

            // Mobile app flow:
            // 1. User scans → gets "ABC123"
            // 2. Immediately POST {qrData: "ABC123"} to {baseUrl}/scan-ticket
        });

        it('should support manual confirmation workflow', () => {
            const scanView = new QRScanView('verify-product', 'Verify Product')
                .setIntro('Scan the product barcode')
                .enablePreview('Product Code')
                .submitButton('Verify Product');

            const json = scanView.toJSON();

            expect((json.content as any)['autoSubmit']).toBe(false);
            expect((json.content as any)['submit']).toBeDefined();
            expect((json.content as any)['preview']).toBeDefined();

            // Mobile app flow:
            // 1. User scans → gets "ABC123"
            // 2. Shows preview with label "Product Code": ABC123
            // 3. User clicks "Verify Product"
            // 4. POST {qrData: "ABC123"} to {baseUrl}/verify-product
        });

        it('should support validation with auto-submit', () => {
            const scanView = new QRScanView('scan-invoice', 'Scan Invoice')
                .setIntro('Scan the invoice QR code')
                .setValidation('Invalid invoice format', 'number', 10, 10, 'INV-');

            const json = scanView.toJSON();

            expect((json.content as any)['autoSubmit']).toBe(true);
            expect((json.content as any)['validation']).toBeDefined();
            expect((json.content as any)['validation'].format).toBe('number');
            expect((json.content as any)['validation'].startsWith).toBe('INV-');

            // Mobile app flow:
            // 1. User scans → gets "INV-123456"
            // 2. Validates: starts with "INV-", numbers after, length 10
            // 3. If valid: immediately POST {qrData: "INV-123456"}
            // 4. If invalid: show error "Invalid invoice format"
        });

        it('should support read-only preview with validation and a confirmation message', () => {
            const scanView = new QRScanView('enter-code', 'Enter Access Code')
                .setIntro('Scan the access code')
                .setValidation('Must be 6 digits', 'number', 6, 6)
                .enablePreview('Access Code')
                .submitButton('Submit Code', 'Check the code against the one on your invitation.');

            const json = scanView.toJSON();

            expect((json.content as any)['autoSubmit']).toBe(false);
            expect((json.content as any)['validation']).toBeDefined();
            expect((json.content as any)['validation'].format).toBe('number');
            expect((json.content as any)['preview']?.enabled).toBe(true);
            expect((json.content as any)['submit']?.confirmMessage).toBe(
                'Check the code against the one on your invitation.'
            );

            // Mobile app flow:
            // 1. User scans → gets "123456"
            // 2. Shows read-only preview: "Access Code: 123456" + the message as help text
            // 3. On "Submit Code": re-validate format=number and length 6-6
            // 4. If valid: POST {qrData: "123456"}
        });
    });

    describe('Method Chaining', () => {
        it('should support full method chaining', () => {
            const result = view
                .setIntro('Scan product')
                .setValidation('Invalid product code', 'number', undefined, undefined, 'PROD-')
                .enablePreview('Product')
                .submitButton('Process')
                .setAutoSubmit(false);

            expect(result).toBe(view);

            const json = view.toJSON();
            expect((json.content as any)['intro']).toBe('Scan product');
            expect((json.content as any)['validation']).toBeDefined();
            expect((json.content as any)['validation'].format).toBe('number');
            expect((json.content as any)['validation'].startsWith).toBe('PROD-');
            expect((json.content as any)['preview']).toBeDefined();
            expect((json.content as any)['submit']).toBeDefined();
        });
    });

    describe('clone()', () => {
        it('should clone view with all configuration', () => {
            view.setIntro('Test')
                .setValidation('Error', 'number', 6, 6)
                .enablePreview('Code')
                .submitButton('Submit');

            const cloned = view.clone();

            expect(cloned).not.toBe(view);
            expect(((cloned.toJSON().content as any)['title'])).toBe(((view.toJSON().content as any)['title']));
            expect(((cloned.toJSON().content as any)['intro'])).toBe(((view.toJSON().content as any)['intro']));
            expect(((cloned.toJSON().content as any)['validation'])).toEqual((view.toJSON().content as any)['validation']);
            expect(((cloned.toJSON().content as any)['preview'])).toEqual((view.toJSON().content as any)['preview']);
            expect(((cloned.toJSON().content as any)['submit'])).toEqual((view.toJSON().content as any)['submit']);
        });
    });

    describe('Breaking Changes from v1', () => {
        it('should not have elements array', () => {
            const json = view.toJSON();
            expect((json.content as any)['elements']).toBeUndefined();
        });

        it('should not have addQRCodeScan method', () => {
            expect((view as any).addQRCodeScan).toBeUndefined();
        });

        it('should not have fieldName parameter', () => {
            const json = view.toJSON();
            expect((json.content as any)['fieldName']).toBeUndefined();
        });

        it('should not use QRConfig (that\'s for QRDisplay only)', () => {
            const json = view.toJSON();
            expect((json.content as any)['config']).toBeUndefined();
        });
    });
});
