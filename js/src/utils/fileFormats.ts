export const fileFormats: Record<string, string> = {
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    rtf: "application/rtf",

    // Images
    png: "image/png",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tiff: "image/tiff",
    ico: "image/x-icon",

    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
    m4a: "audio/mp4",       // AAC in an MPEG-4 container — what iOS records by default
    opus: "audio/opus",     // what Android's recorder emits in an ogg/webm container

    // Video
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    webm: "video/webm",
    "3gp": "video/3gpp",    // low-bitrate capture container still emitted by some Android devices

    // Archives
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",

    // Code
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    ts: "application/typescript",
    py: "text/x-python",
    java: "text/x-java-source",
    cpp: "text/x-c++src",
    c: "text/x-csrc",

    // Other
    sql: "application/sql",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    md: "text/markdown",
    log: "text/plain"
};

import { InvalidParameterError, EmptyCollectionError } from '../errors';

export class FileFormatManager {
    private static instance: FileFormatManager;
    private customFormats: Map<string, string> = new Map();

    private constructor() { }

    static getInstance(): FileFormatManager {
        if (!FileFormatManager.instance) {
            FileFormatManager.instance = new FileFormatManager();
        }
        return FileFormatManager.instance;
    }

    /**
     * Gets the MIME types for a list of formats
     */
    static getMimeTypes(formats: string[]): string[] {
        if (!formats || !Array.isArray(formats) || formats.length === 0) {
            throw new EmptyCollectionError('formats', 'At least one format must be provided');
        }

        const manager = FileFormatManager.getInstance();
        return formats.map(format => {
            const mimeType = manager.getMimeType(format);
            if (!mimeType) {
                throw new InvalidParameterError('format', format, `Unsupported file format: ${format}`);
            }
            return mimeType;
        });
    }

    /**
     * Gets the MIME type for a specific format
     */
    getMimeType(format: string): string | undefined {
        const normalizedFormat = format.toLowerCase().replace(/^\./, '');

        // Check custom formats first
        if (this.customFormats.has(normalizedFormat)) {
            return this.customFormats.get(normalizedFormat);
        }

        // Then the standard formats
        return fileFormats[normalizedFormat];
    }

    /**
     * Adds a custom format
     */
    addCustomFormat(extension: string, mimeType: string): void {
        const normalizedExtension = extension.toLowerCase().replace(/^\./, '');
        this.customFormats.set(normalizedExtension, mimeType);
    }

    /**
     * Removes a custom format
     */
    removeCustomFormat(extension: string): boolean {
        const normalizedExtension = extension.toLowerCase().replace(/^\./, '');
        return this.customFormats.delete(normalizedExtension);
    }

    /**
     * Checks whether a format is supported
     */
    isSupported(format: string): boolean {
        return this.getMimeType(format) !== undefined;
    }

    /**
     * Gets all supported formats
     */
    getSupportedFormats(): string[] {
        const standardFormats = Object.keys(fileFormats);
        const customFormats = Array.from(this.customFormats.keys());
        return [...standardFormats, ...customFormats];
    }

    /**
     * Gets formats by category
     */
    getFormatsByCategory(): Record<string, string[]> {
        return {
            documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf'],
            images: ['png', 'jpeg', 'jpg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico'],
            audio: ['mp3', 'wav', 'ogg', 'aac', 'wma', 'm4a', 'opus'],
            video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', '3gp'],
            archives: ['zip', 'rar', '7z', 'tar', 'gz'],
            code: ['json', 'xml', 'html', 'css', 'js', 'ts', 'py', 'java', 'cpp', 'c'],
            other: ['sql', 'yaml', 'yml', 'md', 'log']
        };
    }

    /**
     * Validates a list of formats
     */
    validateFormats(formats: string[]): { valid: string[]; invalid: string[] } {
        const valid: string[] = [];
        const invalid: string[] = [];

        formats.forEach(format => {
            if (this.isSupported(format)) {
                valid.push(format);
            } else {
                invalid.push(format);
            }
        });

        return { valid, invalid };
    }

    /**
     * Gets the extension from a MIME type
     */
    getExtensionFromMimeType(mimeType: string): string | undefined {
        // Look in the standard formats
        for (const [ext, mime] of Object.entries(fileFormats)) {
            if (mime === mimeType) {
                return ext;
            }
        }

        // Look in the custom formats
        for (const [ext, mime] of this.customFormats.entries()) {
            if (mime === mimeType) {
                return ext;
            }
        }

        return undefined;
    }

    /**
     * Gets MIME types by category
     */
    getMimeTypesByCategory(): Record<string, string[]> {
        const categories = this.getFormatsByCategory();
        const result: Record<string, string[]> = {};

        for (const [category, formats] of Object.entries(categories)) {
            result[category] = formats
                .map(format => this.getMimeType(format))
                .filter((mime): mime is string => mime !== undefined);
        }

        return result;
    }
}

// Utility function for backward compatibility with legacy code
export function getMimeTypes(formats: string[]): string[] {
    return FileFormatManager.getMimeTypes(formats);
} 