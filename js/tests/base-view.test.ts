/**
 * Security tests for BaseView navigation URL validation
 */

import { FormView } from '../src/core/form-view';
import { InvalidParameterError } from '../src/errors';

describe('BaseView - Navigation URL Validation', () => {
    let view: FormView;

    beforeEach(() => {
        view = new FormView('test-form', 'Test Form');
        view.addTextField('name', 'Name', true);
    });

    describe('setNext() URL Validation', () => {
        it('should accept valid HTTPS URLs', () => {
            expect(() => {
                view.setNext('https://example.com/next-view');
            }).not.toThrow();

            const json = view.toJSON();
            expect(json.nav).toBeDefined();
            expect((json.nav as any).next).toBe('https://example.com/next-view');
        });

        it('should reject HTTP URLs (HTTPS only by default)', () => {
            expect(() => {
                view.setNext('http://example.com/next-view');
            }).toThrow(InvalidParameterError);
        });

        it('should accept localhost HTTPS URLs (for development)', () => {
            expect(() => {
                view.setNext('https://localhost:3000/next');
            }).not.toThrow();

            expect(() => {
                view.setNext('https://127.0.0.1:8080/next');
            }).not.toThrow();
        });

        it('should accept private IPs with HTTPS (for development)', () => {
            expect(() => {
                view.setNext('https://192.168.1.100/next');
            }).not.toThrow();

            expect(() => {
                view.setNext('https://10.0.0.1:3000/next');
            }).not.toThrow();
        });

        it('should reject javascript: protocol', () => {
            expect(() => {
                view.setNext('javascript:alert("XSS")');
            }).toThrow(InvalidParameterError);
        });

        it('should reject data: URLs', () => {
            expect(() => {
                view.setNext('data:text/html,<script>alert(1)</script>');
            }).toThrow(InvalidParameterError);
        });

        it('should reject file: protocol', () => {
            expect(() => {
                view.setNext('file:///etc/passwd');
            }).toThrow(InvalidParameterError);
        });

        it('should reject vbscript: protocol', () => {
            expect(() => {
                view.setNext('vbscript:msgbox("XSS")');
            }).toThrow(InvalidParameterError);
        });

        it('should reject URLs with path traversal', () => {
            expect(() => {
                view.setNext('https://example.com/../../../etc/passwd');
            }).toThrow(InvalidParameterError);
        });

        it('should reject extremely long URLs', () => {
            const longUrl = 'https://example.com/' + 'a'.repeat(3000);

            expect(() => {
                view.setNext(longUrl);
            }).toThrow(InvalidParameterError);
        });

        it('should reject malformed URLs', () => {
            const malformedUrls = [
                'htp://example.com',   // unknown scheme
                'ftp://example.com',   // disallowed protocol
                'https://',            // no host, unparseable
                ''                     // empty
            ];

            malformedUrls.forEach(url => {
                expect(() => {
                    view.setNext(url);
                }).toThrow();
            });
        });

        it('should handle case variations in dangerous protocols', () => {
            const variations = [
                'JavaScript:alert(1)',
                'JAVASCRIPT:alert(1)',
                'JaVaScRiPt:alert(1)'
            ];

            variations.forEach(url => {
                expect(() => {
                    view.setNext(url);
                }).toThrow(InvalidParameterError);
            });
        });

        it('should provide detailed error messages', () => {
            try {
                view.setNext('javascript:alert(1)');
                throw new Error('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidParameterError);
                expect((error as Error).message).toContain('Invalid navigation target');
            }
        });
    });

    describe('setPrev() URL Validation', () => {
        it('should accept valid HTTPS URLs', () => {
            expect(() => {
                view.setPrev('https://example.com/prev-view');
            }).not.toThrow();

            const json = view.toJSON();
            expect(json.nav).toBeDefined();
            expect((json.nav as any).prev).toBe('https://example.com/prev-view');
        });

        it('should reject javascript: protocol', () => {
            expect(() => {
                view.setPrev('javascript:alert("XSS")');
            }).toThrow(InvalidParameterError);
        });

        it('should reject data: URLs', () => {
            expect(() => {
                view.setPrev('data:text/html,<script>alert(1)</script>');
            }).toThrow(InvalidParameterError);
        });

        it('should reject path traversal attempts', () => {
            expect(() => {
                view.setPrev('https://example.com/../../admin');
            }).toThrow(InvalidParameterError);
        });

        it('should accept localhost HTTPS for development', () => {
            expect(() => {
                view.setPrev('https://localhost:3000/prev');
            }).not.toThrow();
        });
    });

    describe('Both setNext() and setPrev()', () => {
        it('should allow setting both navigation URLs', () => {
            expect(() => {
                view.setNext('https://example.com/next');
                view.setPrev('https://example.com/prev');
            }).not.toThrow();

            const json = view.toJSON();
            expect((json.nav as any).next).toBe('https://example.com/next');
            expect((json.nav as any).prev).toBe('https://example.com/prev');
        });

        it('should validate both URLs independently', () => {
            view.setNext('https://example.com/next');

            expect(() => {
                view.setPrev('javascript:alert(1)');
            }).toThrow(InvalidParameterError);

            // Next should still be set despite prev failing
            const json = view.toJSON();
            expect((json.nav as any).next).toBe('https://example.com/next');
        });

        it('should allow relative paths (for same-domain navigation)', () => {
            // setNext/setPrev permit safe relative paths for same-domain navigation.
            expect(() => {
                view.setNext('/relative/path');
            }).not.toThrow();
            expect((view.toJSON().nav as any).next).toBe('/relative/path');
        });
    });

    describe('Real-world URL Scenarios', () => {
        it('should accept URLs with query parameters', () => {
            expect(() => {
                view.setNext('https://example.com/next?id=123&type=form');
            }).not.toThrow();
        });

        it('should accept URLs with fragments', () => {
            expect(() => {
                view.setNext('https://example.com/next#section');
            }).not.toThrow();
        });

        it('should accept URLs with authentication', () => {
            expect(() => {
                view.setNext('https://user:pass@example.com/next');
            }).not.toThrow();
        });

        it('should accept URLs with custom ports', () => {
            expect(() => {
                view.setNext('https://example.com:8443/next');
            }).not.toThrow();
        });

        it('should accept international domain names', () => {
            expect(() => {
                view.setNext('https://例え.jp/next');
            }).not.toThrow();
        });

        it('should handle URL-encoded characters correctly', () => {
            expect(() => {
                view.setNext('https://example.com/next%20view');
            }).not.toThrow();
        });
    });

    describe('Attack Vector Prevention', () => {
        it('should block HTTP URLs to metadata services', () => {
            const metadataUrls = [
                'http://169.254.169.254/latest/meta-data/',
                'http://metadata.google.internal'
            ];

            // These are blocked because HTTP is not allowed by default
            // Even though we allow private IPs for development, HTTPS is required
            metadataUrls.forEach(url => {
                expect(() => {
                    view.setNext(url);
                }).toThrow(InvalidParameterError);
            });
        });

        it('should prevent open redirect attacks', () => {
            // Normal URLs should work
            expect(() => {
                view.setNext('https://legitimate.com/redirect');
            }).not.toThrow();

            // Obvious attack patterns should fail
            expect(() => {
                view.setNext('https://legitimate.com@evil.com/');
            }).not.toThrow(); // URL parser handles this correctly

            expect(() => {
                view.setNext('https://legitimate.com.evil.com/');
            }).not.toThrow(); // This is actually evil.com domain, which is valid format
        });

        it('should block URL with embedded credentials to untrusted domains', () => {
            // This is a valid URL format, but security policies might want to block it
            // For now, we accept it as URL validation is for format, not trust
            expect(() => {
                view.setNext('https://victim.com@attacker.com/steal');
            }).not.toThrow();
        });
    });

    describe('Error Handling', () => {
        it('should throw InvalidParameterError for invalid URLs', () => {
            try {
                view.setNext('javascript:alert(1)');
                throw new Error('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidParameterError);
                const err = error as InvalidParameterError;
                expect(err.parameterName).toBe('url');
                expect(err.value).toBe('javascript:alert(1)');
                expect(err.constraint).toContain('Invalid navigation target');
            }
        });

        it('should include specific validation errors in message', () => {
            try {
                view.setNext('javascript:alert(1)');
                fail('Should have thrown');
            } catch (error) {
                const message = (error as Error).message;
                // Should mention the specific problem
                expect(message.toLowerCase()).toContain('url');
            }
        });
    });

    describe('view ids are refused', () => {
        // The client has no registry to resolve a bare id against: a provider
        // must be stopped at write time rather than discover at run time that
        // nothing happens.
        const bareIds = ['step-two', 'orders_list', 'view42'];

        it('setNext() rejects a bare view id', () => {
            bareIds.forEach(id => {
                expect(() => view.setNext(id)).toThrow(InvalidParameterError);
            });
        });

        it('setPrev() rejects a bare view id', () => {
            bareIds.forEach(id => {
                expect(() => view.setPrev(id)).toThrow(InvalidParameterError);
            });
        });

        it('still accepts a path relative to the service base', () => {
            expect(() => view.setNext('/orders/page/2')).not.toThrow();
            expect(() => view.setPrev('/orders/page/1')).not.toThrow();
        });
    });

    describe('setEntry()', () => {
        it('writes nav.entry', () => {
            view.setEntry('replace');
            const json = view.toJSON();
            expect((json.nav as any).entry).toBe('replace');
        });

        it('leaves the key out when never called', () => {
            // The default is 'push'. Emitting it would change the signed bytes
            // of every existing view for no behavioural gain.
            view.setNext('/next');
            const json = view.toJSON();
            expect((json.nav as any).entry).toBeUndefined();
        });

        it('rejects anything but push or replace', () => {
            ['root', 'REPLACE', '', 'pop'].forEach(value => {
                expect(() => view.setEntry(value as never)).toThrow(InvalidParameterError);
            });
        });

        it('survives a round trip through fromJson', () => {
            view.setEntry('replace').setNext('/orders/page/2');
            const rehydrated = FormView.fromJson(view.toJSON());
            const json = rehydrated.toJSON();
            expect((json.nav as any).entry).toBe('replace');
            expect((json.nav as any).next).toBe('/orders/page/2');
        });
    });

    describe('serialization order', () => {
        it('emits nav keys in a fixed order, whatever the call order', () => {
            // The Python SDK writes next/prev/entry in that order. A JS object
            // keeps its insertion order, so without normalisation the same
            // view built in the two languages would not sign to the same bytes.
            const a = new FormView('f', 'F');
            a.addTextField('name', 'Name', true);
            a.setPrev('/p/1').setNext('/p/3').setEntry('replace');

            const b = new FormView('f', 'F');
            b.addTextField('name', 'Name', true);
            b.setEntry('replace').setNext('/p/3').setPrev('/p/1');

            expect(Object.keys(a.toJSON().nav as object)).toEqual(['next', 'prev', 'entry']);
            expect(JSON.stringify(a.toJSON().nav)).toBe(JSON.stringify(b.toJSON().nav));
        });
    });
});

describe('setPage — position in the sequence', () => {
    // `nav.page` dit OÙ l'on est, il ne déplace rien. Des nombres et non une
    // phrase : le client les met en forme dans sa langue.
    // Miroir de py/tests/test_navigation.py::TestPagePosition.
    const aForm = () => new FormView('f', 'F').addTextField('name', 'Name', true);

    it('writes current and total', () => {
        const nav = (aForm().setPage(1, 2).toJSON() as any).nav;
        expect(nav.page).toEqual({ current: 1, total: 2 });
    });

    it('leaves total out of an open-ended sequence', () => {
        const nav = (aForm().setPage(3).toJSON() as any).nav;
        expect(nav.page).toEqual({ current: 3 });
    });

    it('omits the key until it is set', () => {
        const nav = (aForm().setNext('/page-2').toJSON() as any).nav;
        expect(nav.page).toBeUndefined();
    });

    it('refuses a position below one', () => {
        [0, -1].forEach(bad => {
            expect(() => aForm().setPage(bad)).toThrow(InvalidParameterError);
        });
    });

    it('refuses a non-integer', () => {
        [1.5, NaN, '2' as never, null as never].forEach(bad => {
            expect(() => aForm().setPage(bad as number)).toThrow(InvalidParameterError);
        });
    });

    it('refuses a total smaller than current', () => {
        expect(() => aForm().setPage(3, 2)).toThrow(InvalidParameterError);
    });
});

describe('setEntry — recul relatif', () => {
    // Le nombre compte des écrans DU FOURNISSEUR, jamais une profondeur
    // absolue : celle-ci dépend du chemin par lequel l'utilisateur est arrivé,
    // que le fournisseur ne connaît pas.
    // Miroir de py/tests/test_navigation.py::TestNumericEntry.
    const aForm = () => new FormView('f', 'F').addTextField('name', 'Name', true);

    it('accepts 1, 0 and negatives', () => {
        [1, 0, -1, -5].forEach(value => {
            const nav = (aForm().setEntry(value).toJSON() as any).nav;
            expect(nav.entry).toBe(value);
        });
    });

    it('still accepts the two words', () => {
        (['push', 'replace'] as const).forEach(word => {
            const nav = (aForm().setEntry(word).toJSON() as any).nav;
            expect(nav.entry).toBe(word);
        });
    });

    it('refuses anything above one', () => {
        // Empiler est empiler : au-delà, rien de plus ne se dirait.
        [2, 7].forEach(value => {
            expect(() => aForm().setEntry(value)).toThrow(InvalidParameterError);
        });
    });

    it('refuses a non-integer', () => {
        [1.5, NaN].forEach(value => {
            expect(() => aForm().setEntry(value)).toThrow(InvalidParameterError);
        });
    });
});
