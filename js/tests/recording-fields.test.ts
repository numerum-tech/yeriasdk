/**
 * Tests for the audio/video recording form fields.
 *
 * These lock two things the renderer depends on:
 *  - the wire shape (fieldType, accept as MIME types, capture constraints), and
 *  - the build-time guards that stop a provider shipping a video field with no
 *    duration bound, which is the only thing keeping an upload inside a
 *    provider's request body limit.
 */

import { FormView } from '../src/core/form-view';
import { FieldValidator } from '../src/utils/validators';

const fieldsOf = (form: FormView) => (form.toJSON().content as any).fields;

describe('FormView - audio field', () => {
    it('emits fieldType "audio" with MIME types resolved from extensions', () => {
        const form = new FormView('f', 'F');
        form.addAudioField('note', 'Voice note', true, { maxDuration: 60 });

        const field = fieldsOf(form).find((f: any) => f.fieldId === 'note');
        expect(field.fieldType).toBe('audio');
        expect(field.required).toBe(true);
        expect(field.maxDuration).toBe(60);
        expect(field.accept).toEqual(['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']);
    });

    it('carries the capture constraints through to the payload', () => {
        const form = new FormView('f', 'F');
        form.addAudioField('note', 'Voice note', false, {
            maxDuration: 30,
            minDuration: 2,
            source: 'record',
            maxSize: 2 * 1024 * 1024,
            multiple: true,
            maxCount: 3
        });

        const field = fieldsOf(form).find((f: any) => f.fieldId === 'note');
        expect(field.minDuration).toBe(2);
        expect(field.source).toBe('record');
        expect(field.maxSize).toBe(2 * 1024 * 1024);
        expect(field.multiple).toBe(true);
        expect(field.maxCount).toBe(3);
    });

    it('accepts custom formats and rejects unknown ones', () => {
        const form = new FormView('f', 'F');
        form.addAudioField('note', 'Voice note', false, { maxDuration: 60, formats: ['opus'] });
        const field = fieldsOf(form).find((f: any) => f.fieldId === 'note');
        expect(field.accept).toEqual(['audio/opus']);

        expect(() =>
            new FormView('f2', 'F2').addAudioField('n', 'N', false, { maxDuration: 60, formats: ['flac'] })
        ).toThrow();
    });

    it('builds without maxDuration but warns that the recording is unbounded', () => {
        const form = new FormView('f', 'F');
        expect(() => form.addAudioField('note', 'Voice note')).not.toThrow();

        const result = FieldValidator.validateField('audio', 'note', 'Voice note', {
            accept: ['audio/mp4']
        });
        expect(result.isValid).toBe(true);
        expect((result.warnings ?? []).some(w => w.message.includes('maxDuration'))).toBe(true);
    });
});

describe('FormView - video field', () => {
    it('emits fieldType "video" and defaults quality to medium', () => {
        const form = new FormView('f', 'F');
        form.addVideoField('clip', 'Damage clip', true, { maxDuration: 45 });

        const field = fieldsOf(form).find((f: any) => f.fieldId === 'clip');
        expect(field.fieldType).toBe('video');
        expect(field.maxDuration).toBe(45);
        expect(field.quality).toBe('medium');
        expect(field.accept).toEqual(['video/mp4', 'video/quicktime', 'video/webm']);
    });

    it('lets the caller override quality and source', () => {
        const form = new FormView('f', 'F');
        form.addVideoField('clip', 'Clip', false, {
            maxDuration: 20,
            quality: 'low',
            source: 'record'
        });

        const field = fieldsOf(form).find((f: any) => f.fieldId === 'clip');
        expect(field.quality).toBe('low');
        expect(field.source).toBe('record');
    });

    it('refuses a video field with no maxDuration', () => {
        const form = new FormView('f', 'F');
        expect(() => form.addVideoField('clip', 'Clip', false, {} as any)).toThrow();
    });
});

describe('FieldValidator - recording constraints', () => {
    const base = { accept: ['video/mp4'], maxDuration: 30 };

    it('rejects a non-positive maxDuration', () => {
        const result = FieldValidator.validateField('video', 'clip', 'Clip', { ...base, maxDuration: 0 });
        expect(result.isValid).toBe(false);
    });

    it('rejects minDuration greater than maxDuration', () => {
        const result = FieldValidator.validateField('video', 'clip', 'Clip', { ...base, minDuration: 60 });
        expect(result.isValid).toBe(false);
    });

    it('rejects an unknown source', () => {
        const result = FieldValidator.validateField('audio', 'note', 'Note', {
            accept: ['audio/mp4'],
            maxDuration: 30,
            source: 'camera' as any
        });
        expect(result.isValid).toBe(false);
    });

    it('rejects an unknown video quality', () => {
        const result = FieldValidator.validateField('video', 'clip', 'Clip', {
            ...base,
            quality: 'ultra' as any
        });
        expect(result.isValid).toBe(false);
    });

    it('warns when quality is set on an audio field', () => {
        const result = FieldValidator.validateField('audio', 'note', 'Note', {
            accept: ['audio/mp4'],
            maxDuration: 30,
            quality: 'high'
        });
        expect(result.isValid).toBe(true);
        expect((result.warnings ?? []).some(w => w.message.includes('quality'))).toBe(true);
    });

    it('rejects a non-positive maxSize', () => {
        const result = FieldValidator.validateField('audio', 'note', 'Note', {
            accept: ['audio/mp4'],
            maxDuration: 30,
            maxSize: 0
        });
        expect(result.isValid).toBe(false);
    });

    it('requires accepted types', () => {
        const result = FieldValidator.validateField('audio', 'note', 'Note', { maxDuration: 30 });
        expect(result.isValid).toBe(false);
    });
});

describe('FieldValidator - multi-capture', () => {
    it('rejects a non-integer maxCount', () => {
        const result = FieldValidator.validateField('photo', 'pics', 'Pics', {
            accept: ['image/jpeg'],
            multiple: true,
            maxCount: 2.5
        });
        expect(result.isValid).toBe(false);
    });

    it('warns when maxCount is set without multiple', () => {
        const result = FieldValidator.validateField('photo', 'pics', 'Pics', {
            accept: ['image/jpeg'],
            maxCount: 4
        });
        expect(result.isValid).toBe(true);
        expect((result.warnings ?? []).some(w => w.message.includes('maxCount'))).toBe(true);
    });
});

describe('FormView - photo/file multi-capture', () => {
    it('passes multiple/maxCount/source through the photo builder', () => {
        const form = new FormView('f', 'F');
        form.addPhotoField('pics', 'Pictures', true, ['jpeg'], false, {
            multiple: true,
            maxCount: 4,
            source: 'record'
        });

        const field = fieldsOf(form).find((f: any) => f.fieldId === 'pics');
        expect(field.multiple).toBe(true);
        expect(field.maxCount).toBe(4);
        expect(field.source).toBe('record');
    });

    it('passes multiple/maxCount through the file builder', () => {
        const form = new FormView('f', 'F');
        form.addFileField('docs', 'Documents', false, ['application/pdf'], {
            multiple: true,
            maxCount: 2
        });

        const field = fieldsOf(form).find((f: any) => f.fieldId === 'docs');
        expect(field.multiple).toBe(true);
        expect(field.maxCount).toBe(2);
    });
});
