/**
 * Security tests for input sanitization and URL validation
 */

import { DataSanitizer, validateSubmissionURL, DEFAULT_URL_CONFIG } from '../src/utils/validators';

describe('DataSanitizer - Security Tests', () => {
    describe('Input Sanitization', () => {
        it('should remove HTML tags by default', () => {
            const input = '<script>alert("XSS")</script>Hello';
            const result = DataSanitizer.sanitizeInput(input);

            expect(result).not.toContain('<script>');
            expect(result).not.toContain('</script>');
            expect(result).toContain('Hello');
        });

        it('should encode special HTML characters', () => {
            const input = '< > & " \' /';
            const result = DataSanitizer.sanitizeInput(input);

            expect(result).toContain('&lt;');
            expect(result).toContain('&gt;');
            expect(result).toContain('&amp;');
            expect(result).toContain('&quot;');
            expect(result).toContain('&#x27;');
            expect(result).toContain('&#x2F;');
        });

        it('should remove null bytes', () => {
            const input = 'Hello\0World';
            const result = DataSanitizer.sanitizeInput(input);

            expect(result).toBe('HelloWorld');
            expect(result).not.toContain('\0');
        });

        it('should normalize Unicode to prevent homograph attacks', () => {
            // Using Unicode combining characters that could be used for spoofing
            const input = 'café'; // with combining acute accent
            const result = DataSanitizer.sanitizeInput(input);

            // Should be normalized to NFC form
            expect(result).toBe('café');
            expect(result.normalize('NFC')).toBe(result);
        });

        it('should trim whitespace', () => {
            const input = '  Hello World  ';
            const result = DataSanitizer.sanitizeInput(input);

            // Whitespace is trimmed, then no HTML encoding needed if no dangerous chars
            expect(result).toBe('Hello World');
            expect(result.startsWith(' ')).toBe(false);
        });

        it('should preserve HTML when allowHtml is true', () => {
            const input = '<p>Hello</p>';
            const result = DataSanitizer.sanitizeInput(input, { allowHtml: true });

            expect(result).toBe('<p>Hello</p>');
        });

        it('should handle empty strings', () => {
            const result = DataSanitizer.sanitizeInput('');
            expect(result).toBe('');
        });

        it('should handle non-string inputs', () => {
            const result = DataSanitizer.sanitizeInput(null as any);
            expect(result).toBe('');
        });

        it('should handle injection attack patterns', () => {
            const sqlInjection = "'; DROP TABLE users; --";
            const result = DataSanitizer.sanitizeInput(sqlInjection);

            // Should encode dangerous characters
            expect(result).toContain('&#x27;'); // Single quote encoded
            expect(result).not.toContain("'");
        });

        it('should handle command injection patterns', () => {
            const cmdInjection = 'file.txt; rm -rf /';
            const result = DataSanitizer.sanitizeInput(cmdInjection);

            // Should encode dangerous characters
            expect(result).toContain('&#x2F;'); // Slash encoded
        });

        it('should handle path traversal attempts', () => {
            const pathTraversal = '../../../etc/passwd';
            const result = DataSanitizer.sanitizeInput(pathTraversal);

            // Slashes should be encoded
            expect(result).toContain('&#x2F;');
        });
    });

    describe('Email Validation', () => {
        it('should validate correct email addresses', () => {
            expect(DataSanitizer.validateEmail('user@example.com')).toBe(true);
            expect(DataSanitizer.validateEmail('test.user@domain.co.uk')).toBe(true);
            expect(DataSanitizer.validateEmail('name+tag@company.org')).toBe(true);
        });

        it('should reject invalid email addresses', () => {
            expect(DataSanitizer.validateEmail('invalid')).toBe(false);
            expect(DataSanitizer.validateEmail('@example.com')).toBe(false);
            expect(DataSanitizer.validateEmail('user@')).toBe(false);
            expect(DataSanitizer.validateEmail('user @example.com')).toBe(false);
        });
    });

    describe('URL Validation', () => {
        it('should validate correct URLs', () => {
            expect(DataSanitizer.validateURL('https://example.com')).toBe(true);
            expect(DataSanitizer.validateURL('http://example.com/path')).toBe(true);
            expect(DataSanitizer.validateURL('https://sub.domain.com:8080/path?query=value')).toBe(true);
        });

        it('should reject invalid URLs', () => {
            expect(DataSanitizer.validateURL('not-a-url')).toBe(false);
            expect(DataSanitizer.validateURL('https://')).toBe(false);
            expect(DataSanitizer.validateURL('/relative/path')).toBe(false);
        });

        // These used to be asserted as VALID, on the grounds that the URL
        // constructor accepts them and that validateSubmissionURL blocks the
        // dangerous schemes. But validateSubmissionURL guards a submission
        // TARGET, and this function guards the pre-filled value of a `url`
        // field — a different path, with no second line of defence, whose
        // value the renderer puts in front of the user. The Python SDK
        // refused them all along, so the two SDKs also disagreed on what a
        // valid view was.
        it('rejects every scheme the client cannot meaningfully open', () => {
            expect(DataSanitizer.validateURL('javascript:alert(1)')).toBe(false);
            expect(DataSanitizer.validateURL('vbscript:msgbox')).toBe(false);
            expect(DataSanitizer.validateURL('data:text/html,<script>x</script>')).toBe(false);
            expect(DataSanitizer.validateURL('file:///etc/passwd')).toBe(false);
            expect(DataSanitizer.validateURL('ftp://example.com')).toBe(false);
            expect(DataSanitizer.validateURL('mailto:a@b.c')).toBe(false);
        });
    });

    describe('Phone Number Validation', () => {
        it('should validate E.164 format phone numbers', () => {
            expect(DataSanitizer.validatePhoneNumber('+1234567890')).toBe(true);
            expect(DataSanitizer.validatePhoneNumber('+33123456789')).toBe(true);
            expect(DataSanitizer.validatePhoneNumber('1234567890')).toBe(true);
        });

        it('should handle phone numbers with spaces', () => {
            expect(DataSanitizer.validatePhoneNumber('+1 234 567 890')).toBe(true);
            expect(DataSanitizer.validatePhoneNumber('123 456 7890')).toBe(true);
        });

        it('should reject invalid phone numbers', () => {
            expect(DataSanitizer.validatePhoneNumber('abc')).toBe(false);
            expect(DataSanitizer.validatePhoneNumber('++123')).toBe(false);
            expect(DataSanitizer.validatePhoneNumber('')).toBe(false);
        });
    });

    describe('GPS Coordinates Validation', () => {
        it('should validate correct coordinates', () => {
            expect(DataSanitizer.validateCoordinates(0, 0)).toBe(true);
            expect(DataSanitizer.validateCoordinates(45.5, -73.5)).toBe(true);
            expect(DataSanitizer.validateCoordinates(-90, 180)).toBe(true);
            expect(DataSanitizer.validateCoordinates(90, -180)).toBe(true);
        });

        it('should reject out-of-range coordinates', () => {
            expect(DataSanitizer.validateCoordinates(91, 0)).toBe(false);
            expect(DataSanitizer.validateCoordinates(-91, 0)).toBe(false);
            expect(DataSanitizer.validateCoordinates(0, 181)).toBe(false);
            expect(DataSanitizer.validateCoordinates(0, -181)).toBe(false);
        });
    });
});

describe('validateSubmissionURL - Security Tests', () => {
    describe('Protocol Validation', () => {
        it('should allow HTTPS URLs by default', () => {
            const result = validateSubmissionURL('https://example.com', DEFAULT_URL_CONFIG);
            expect(result.isValid).toBe(true);
        });

        it('should block HTTP URLs with default config', () => {
            const result = validateSubmissionURL('http://example.com', DEFAULT_URL_CONFIG);
            expect(result.isValid).toBe(false);
        });

        it('should block javascript: protocol', () => {
            const result = validateSubmissionURL('javascript:alert(1)');
            expect(result.isValid).toBe(false);
        });

        it('should block data: URLs', () => {
            const result = validateSubmissionURL('data:text/html,<script>alert(1)</script>');
            expect(result.isValid).toBe(false);
        });

        it('should block file: protocol', () => {
            const result = validateSubmissionURL('file:///etc/passwd');
            expect(result.isValid).toBe(false);
        });

        it('should block vbscript: protocol', () => {
            const result = validateSubmissionURL('vbscript:msgbox("XSS")');
            expect(result.isValid).toBe(false);
        });
    });

    describe('Private IP Blocking', () => {
        it('should block localhost by default', () => {
            const result1 = validateSubmissionURL('https://localhost/path', DEFAULT_URL_CONFIG);
            const result2 = validateSubmissionURL('https://127.0.0.1/path', DEFAULT_URL_CONFIG);

            expect(result1.isValid).toBe(false);
            expect(result2.isValid).toBe(false);
        });

        it('should block private IP ranges', () => {
            const privateIPs = [
                'https://10.0.0.1',
                'https://172.16.0.1',
                'https://192.168.1.1',
                'https://169.254.1.1'
            ];

            privateIPs.forEach(url => {
                const result = validateSubmissionURL(url, DEFAULT_URL_CONFIG);
                expect(result.isValid).toBe(false);
            });
        });

        it('should allow private IPs when explicitly enabled', () => {
            const config = { ...DEFAULT_URL_CONFIG, blockPrivateIPs: false, blockLocalhost: false };
            const result = validateSubmissionURL('https://192.168.1.1', config);

            expect(result.isValid).toBe(true);
        });
    });

    describe('Domain Whitelisting', () => {
        it('should allow whitelisted domains only', () => {
            const config = {
                ...DEFAULT_URL_CONFIG,
                allowedDomains: ['example.com', 'trusted.org']
            };

            const validUrl = validateSubmissionURL('https://example.com/path', config);
            const invalidUrl = validateSubmissionURL('https://evil.com/path', config);

            expect(validUrl.isValid).toBe(true);
            expect(invalidUrl.isValid).toBe(false);
        });

        it('should allow subdomains of whitelisted domains', () => {
            const config = {
                ...DEFAULT_URL_CONFIG,
                allowedDomains: ['example.com']
            };

            const result = validateSubmissionURL('https://sub.example.com/path', config);
            expect(result.isValid).toBe(true);
        });

        it('should be case-insensitive for domains', () => {
            const config = {
                ...DEFAULT_URL_CONFIG,
                allowedDomains: ['EXAMPLE.COM']
            };

            const result = validateSubmissionURL('https://example.com/path', config);
            expect(result.isValid).toBe(true);
        });
    });

    describe('Path Traversal Prevention', () => {
        it('should detect directory traversal patterns', () => {
            const result = validateSubmissionURL('https://example.com/../etc/passwd');
            expect(result.isValid).toBe(false);
        });

        it('should allow normal paths without traversal', () => {
            const result = validateSubmissionURL('https://example.com/path/to/resource', DEFAULT_URL_CONFIG);
            expect(result.isValid).toBe(true);
        });
    });

    describe('URL Length Validation', () => {
        it('should enforce maximum URL length', () => {
            const longUrl = 'https://example.com/' + 'a'.repeat(3000);
            const result = validateSubmissionURL(longUrl, DEFAULT_URL_CONFIG);

            expect(result.isValid).toBe(false);
        });

        it('should allow URLs within length limit', () => {
            const normalUrl = 'https://example.com/path';
            const result = validateSubmissionURL(normalUrl, DEFAULT_URL_CONFIG);

            expect(result.isValid).toBe(true);
        });

        it('should use custom max length when provided', () => {
            const url = 'https://example.com/' + 'a'.repeat(100);
            const config = { ...DEFAULT_URL_CONFIG, maxUrlLength: 50 };
            const result = validateSubmissionURL(url, config);

            expect(result.isValid).toBe(false);
        });
    });

    describe('Dangerous Port Detection', () => {
        it('should warn about dangerous ports', () => {
            const dangerousPorts = [22, 23, 3306, 5432, 27017];

            dangerousPorts.forEach(port => {
                const config = { ...DEFAULT_URL_CONFIG, blockLocalhost: false };
                const result = validateSubmissionURL(`https://localhost:${port}`, config);

                // Should have warnings but might still be valid
                expect(result.warnings).toBeDefined();
                if (result.warnings) {
                    expect(result.warnings.length).toBeGreaterThan(0);
                }
            });
        });

        it('should allow safe ports without warnings', () => {
            const config = { ...DEFAULT_URL_CONFIG, blockLocalhost: false };
            const result = validateSubmissionURL('https://localhost:8080', config);

            // Should be valid with no warnings about dangerous ports
            expect(result.isValid).toBe(true);
        });
    });

    describe('Invalid URL Format', () => {
        it('should reject malformed URLs', () => {
            const invalidUrls = [
                'not-a-url',
                'htp://example.com', // typo in protocol
                '://example.com',
                'https://',
                ''
            ];

            invalidUrls.forEach(url => {
                const result = validateSubmissionURL(url);
                expect(result.isValid).toBe(false);
            });
        });
    });

    describe('Real-world Attack Scenarios', () => {
        it('should block SSRF attacks to metadata services', () => {
            const metadataURLs = [
                'http://169.254.169.254/latest/meta-data/',
                'http://metadata.google.internal',
                'http://169.254.169.254'
            ];

            metadataURLs.forEach(url => {
                const result = validateSubmissionURL(url, DEFAULT_URL_CONFIG);
                expect(result.isValid).toBe(false);
            });
        });

        it('should handle URL-encoded patterns', () => {
            // URL constructor doesn't auto-decode path components, so encoded ../.. appears as literal string
            const encodedAttack = 'https://example.com/%2e%2e%2f%2e%2e%2fetc%2fpasswd';
            const result = validateSubmissionURL(encodedAttack);

            // This is a valid URL format - the server should reject .. patterns in paths
            // Our validator checks the raw URL string, not decoded version
            expect(result.isValid).toBe(true);
        });

        it('should handle mixed-case protocol variations', () => {
            const variations = [
                'JavaScript:alert(1)',
                'JAVASCRIPT:alert(1)',
                'JaVaScRiPt:alert(1)'
            ];

            variations.forEach(url => {
                const result = validateSubmissionURL(url);
                expect(result.isValid).toBe(false);
            });
        });
    });
});
