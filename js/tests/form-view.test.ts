/**
 * Tests for FormView separators.
 * Locks the contract that separators carry an optional (possibly empty) label,
 * are skipped by field validation, and are excluded from the
 * "at least one field" rule. Regression guard: addSeparator() previously threw
 * because addField() rejected the empty label before separator handling.
 */

import { FormView } from '../src/core/form-view';
import { InvalidParameterError } from '../src/errors';

describe('FormView - separators', () => {
    it('adds a separator with an auto-generated id and empty label', () => {
        const form = new FormView('test-form', 'Test Form');
        form.addTextField('name', 'Name');
        form.addSeparator();
        form.addEmailField('email', 'Email');

        const fields = (form.toJSON().content as any).fields;
        const separator = fields.find((f: any) => f.fieldType === 'separator');
        expect(separator).toBeDefined();
        expect(separator.fieldId).toMatch(/^separator-/);
        expect(separator.fieldLabel).toBe('');
    });

    it('accepts an explicit separator id and label', () => {
        const form = new FormView('test-form', 'Test Form');
        form.addTextField('name', 'Name');
        form.addSeparator('sep-1', 'Contact details');
        form.addEmailField('email', 'Email');

        const fields = (form.toJSON().content as any).fields;
        const separator = fields.find((f: any) => f.fieldId === 'sep-1');
        expect(separator.fieldType).toBe('separator');
        expect(separator.fieldLabel).toBe('Contact details');
    });

    it('excludes separators from getFieldCount when requested', () => {
        const form = new FormView('test-form', 'Test Form');
        form.addTextField('name', 'Name');
        form.addSeparator();
        form.addEmailField('email', 'Email');

        expect(form.getFieldCount()).toBe(3);
        expect(form.getFieldCount(true)).toBe(2);
    });

    it('rejects a form whose only field is a separator', () => {
        const form = new FormView('test-form', 'Test Form');
        form.addSeparator();
        form.submitButton('Send');

        expect(() => form.toJSON()).toThrow();
    });
});

describe('addSpacer()', () => {
    // Complète addSeparator : le trait dit « nouveau groupe », l'espace laisse
    // seulement respirer.
    it('emits a display-only field with its size', () => {
        const form = new FormView('f', 'F');
        form.addTextField('a', 'A', true).addSpacer('lg');

        const content = form.toJSON().content as Record<string, unknown>;
        const spacer = (content['fields'] as Array<Record<string, unknown>>)[1]!;
        expect(spacer['fieldType']).toBe('spacer');
        expect(spacer['size']).toBe('lg');
        expect(spacer['fieldLabel']).toBe('');
    });

    it('defaults to md', () => {
        const form = new FormView('f', 'F');
        form.addTextField('a', 'A', true).addSpacer();
        const content = form.toJSON().content as Record<string, unknown>;
        expect((content['fields'] as Array<Record<string, unknown>>)[1]!['size']).toBe('md');
    });

    it('refuses a size outside the three steps', () => {
        const form = new FormView('f', 'F');
        form.addTextField('a', 'A', true);
        ['xl', 'MD', '', 'large'].forEach(size => {
            expect(() => form.addSpacer(size as never)).toThrow(InvalidParameterError);
        });
    });

    it('derives its id from the position, so two identical forms sign alike', () => {
        const build = () => {
            const f = new FormView('f', 'F');
            f.addTextField('a', 'A', true).addSpacer('sm');
            return JSON.stringify(f.toJSON().content);
        };
        expect(build()).toBe(build());
    });

    it('does not count as a field on its own', () => {
        // Un formulaire fait uniquement d'espaces n'est pas un formulaire.
        const form = new FormView('empty', 'F');
        form.addSpacer('md');
        expect(() => form.build()).toThrow();
    });
});

describe('addSelectField — display hint', () => {
    // `display` est une préférence de présentation, pas un autre champ. La clé
    // est OMISE quand elle n'est pas posée, pour qu'un client qui l'ignore
    // retombe sur la feuille de sélection.
    // Miroir de py/tests/test_form_view.py::TestSelectDisplay.
    const OPTS = [
        { label: 'Oui', value: 'y' },
        { label: 'Non', value: 'n' },
    ];

    const field = (display?: 'dropdown' | 'radio') => {
        const form = new FormView('f', 'F');
        form.addSelectField('choix', 'Choix', false, OPTS, display);
        return (form.toJSON().content as any).fields[0];
    };

    it('omits the key when it is not declared', () => {
        expect(field()['display']).toBeUndefined();
    });

    it('carries radio', () => {
        expect(field('radio')['display']).toBe('radio');
    });

    it('carries dropdown', () => {
        expect(field('dropdown')['display']).toBe('dropdown');
    });

    it('refuses anything else', () => {
        ['Radio', 'list', '', 'inline'].forEach(bad => {
            expect(() => field(bad as never)).toThrow(InvalidParameterError);
        });
    });

    it('writes display right after options, as the Python SDK does', () => {
        // La signature porte sur le JSON compact : un rang different casserait
        // la parite d'octets entre les deux SDK.
        expect(Object.keys(field('radio'))).toEqual([
            'fieldType', 'fieldId', 'fieldLabel', 'required', 'options', 'display',
        ]);
    });
});

/**
 * Date bounds travel as `minDate` / `maxDate` in `YYYY-MM-DD`.
 * Regression guard: addDateField() used to convert them to epoch milliseconds
 * and emit `min` / `max`. The renderer types both keys as strings, so it read
 * nothing and every bound was silently dropped; the Python SDK meanwhile
 * emitted the documented shape, so the two SDKs signed the same form
 * differently.
 */
describe('addDateField — bounds', () => {
    // Read the field back through a serialization round-trip: the signature is
    // taken over the JSON, so what survives JSON.stringify is what the client
    // and the Python SDK actually have to agree on.
    const boundsOf = (form: FormView) =>
        JSON.parse(JSON.stringify(
            (form.toJSON().content as any).fields.find((f: any) => f.fieldType === 'date')
        ));

    it('emits the bounds as minDate/maxDate strings', () => {
        const form = new FormView('f', 'F');
        form.addDateField('birth', 'Birth', true, '1900-01-01', '2010-12-31');

        const field = boundsOf(form);
        expect(field.minDate).toBe('1900-01-01');
        expect(field.maxDate).toBe('2010-12-31');
    });

    it('never emits the epoch min/max keys', () => {
        const form = new FormView('f', 'F');
        form.addDateField('birth', 'Birth', true, '1900-01-01', '2010-12-31');

        const field = boundsOf(form);
        expect(field).not.toHaveProperty('min');
        expect(field).not.toHaveProperty('max');
    });

    it('omits both keys when no bound is given', () => {
        const form = new FormView('f', 'F');
        form.addDateField('day', 'Day');

        const field = boundsOf(form);
        expect(field).not.toHaveProperty('minDate');
        expect(field).not.toHaveProperty('maxDate');
    });

    it('rejects a bound that is not YYYY-MM-DD', () => {
        const form = new FormView('f', 'F');

        expect(() => form.addDateField('birth', 'Birth', true, '01/01/1900'))
            .toThrow(/minDate/);
    });
});

/**
 * The payload must not depend on the order the provider happened to write the
 * option keys in.
 * Regression guard: photo, file, audio, video and GPS fields used to spread the
 * caller's object into the field (`...options` / `...config`). JavaScript keeps
 * a literal's insertion order, so `{multiple, source}` and `{source, multiple}`
 * produced different JSON — hence different signatures for the same field — and
 * neither matched the fixed order the Python SDK emits.
 */
describe('field key order is independent of the caller', () => {
    const bytesOf = (form: FormView, fieldType: string) =>
        JSON.stringify((form.toJSON().content as any).fields.find((f: any) => f.fieldType === fieldType));

    it('gps: same field, options written in either order', () => {
        const a = new FormView('g', 'G');
        a.addGPSField('loc', 'Loc', true, false, { altitude: true, maxAccuracy: 25, precision: true });
        const b = new FormView('g', 'G');
        b.addGPSField('loc', 'Loc', true, false, { precision: true, maxAccuracy: 25, altitude: true });

        expect(bytesOf(a, 'gps')).toBe(bytesOf(b, 'gps'));
    });

    it('photo: same field, options written in either order', () => {
        const a = new FormView('p', 'P');
        a.addPhotoField('img', 'Img', false, ['jpeg'], false, { multiple: true, maxCount: 3, source: 'record' });
        const b = new FormView('p', 'P');
        b.addPhotoField('img', 'Img', false, ['jpeg'], false, { source: 'record', maxCount: 3, multiple: true });

        expect(bytesOf(a, 'photo')).toBe(bytesOf(b, 'photo'));
    });

    it('audio: same field, options written in either order', () => {
        const a = new FormView('a', 'A');
        a.addAudioField('m', 'M', false, { maxDuration: 30, minDuration: 2, source: 'record', maxSize: 1000 });
        const b = new FormView('a', 'A');
        b.addAudioField('m', 'M', false, { maxSize: 1000, source: 'record', minDuration: 2, maxDuration: 30 });

        expect(bytesOf(a, 'audio')).toBe(bytesOf(b, 'audio'));
    });

    it('video: same field, options written in either order', () => {
        const a = new FormView('v', 'V');
        a.addVideoField('c', 'C', false, { maxDuration: 60, source: 'record', quality: 'high', maxSize: 5000 });
        const b = new FormView('v', 'V');
        b.addVideoField('c', 'C', false, { maxSize: 5000, quality: 'high', source: 'record', maxDuration: 60 });

        expect(bytesOf(a, 'video')).toBe(bytesOf(b, 'video'));
    });

    it('file: same field, options written in either order', () => {
        const a = new FormView('p', 'P');
        a.addFileField('doc', 'Doc', false, ['application/pdf'], { multiple: true, maxCount: 2 });
        const b = new FormView('p', 'P');
        b.addFileField('doc', 'Doc', false, ['application/pdf'], { maxCount: 2, multiple: true });

        expect(bytesOf(a, 'file')).toBe(bytesOf(b, 'file'));
    });

    it('the generic addField orders its keys too', () => {
        const a = new FormView('g', 'G');
        a.addField('gps', 'loc', 'Loc', { required: true, altitude: true, maxAccuracy: 25 });
        const b = new FormView('g', 'G');
        b.addField('gps', 'loc', 'Loc', { maxAccuracy: 25, altitude: true, required: true });

        expect(bytesOf(a, 'gps')).toBe(bytesOf(b, 'gps'));
    });

    it('a value set after the fact lands at its canonical place, not last', () => {
        const late = new FormView('f', 'F');
        late.addTextField('name', 'Name', true);
        late.setFieldValue('name', 'Ada');

        const upfront = new FormView('f', 'F');
        upfront.addField('text', 'name', 'Name', { required: true, value: 'Ada' });

        expect(bytesOf(late, 'text')).toBe(bytesOf(upfront, 'text'));
    });

    it('gps: precision still reaches the payload', () => {
        const form = new FormView('g', 'G');
        form.addGPSField('loc', 'Loc', true, false, { precision: true });

        expect(JSON.parse(bytesOf(form, 'gps')).precision).toBe(true);
    });
});

/**
 * The two SDKs each hold a canonical key order, and they must agree. This
 * checks the JS side against the Python table, read from the source, so a key
 * added to one and not the other fails here rather than at signing time.
 */
describe('canonical key order matches the Python SDK', () => {
    it('both tables list the same keys in the same order', () => {
        const fs = require('fs');
        const path = require('path');

        const jsSource = fs.readFileSync(path.join(__dirname, '../src/core/form-view.ts'), 'utf8');
        const pySource = fs.readFileSync(
            path.join(__dirname, '../../py/yeriasdk/views/form_view.py'), 'utf8');

        const keysBetween = (source: string, open: string, close: string) => {
            const start = source.indexOf(open);
            expect(start).toBeGreaterThan(-1);
            const body = source.slice(start + open.length, source.indexOf(close, start));
            return (body.match(/'[a-zA-Z]+'|"[a-zA-Z]+"/g) || []).map(q => q.slice(1, -1));
        };

        expect(keysBetween(jsSource, 'FIELD_KEY_ORDER: Array<keyof FormFieldParams> = [', ']'))
            .toEqual(keysBetween(pySource, 'FIELD_KEY_ORDER = (', ')'));
    });
});

/**
 * A key the order table does not know is kept, not dropped.
 * A provider casting past the types to carry an extension key would otherwise
 * watch it vanish from the payload without a word — worse than seeing it in an
 * unexpected position. Python's `order_field_keys` behaves the same.
 */
describe('unknown field keys survive ordering', () => {
    it('addField keeps a key the table does not know', () => {
        const form = new FormView('f', 'F');
        form.addField('text', 'n', 'N', { required: true, clientHint: 'keep-me' } as any);

        const field: any = (form.toJSON().content as any).fields[0];
        expect(field.clientHint).toBe('keep-me');
    });

    it('keeps a key that collides with Object.prototype', () => {
        const form = new FormView('f', 'F');
        form.addField('text', 'n', 'N', { required: true, toString: 'not-a-method' } as any);
        form.updateField('n', { value: 'x' });

        const field: any = (form.toJSON().content as any).fields[0];
        expect(Object.prototype.hasOwnProperty.call(field, 'toString')).toBe(true);
        expect(field.toString).toBe('not-a-method');
    });

    it('updateField does not lose it on the next rebuild', () => {
        const form = new FormView('f', 'F');
        form.addField('text', 'n', 'N', { required: true, clientHint: 'keep-me' } as any);
        form.updateField('n', { value: 'x' });

        const field: any = (form.toJSON().content as any).fields[0];
        expect(field.clientHint).toBe('keep-me');
        // and the known keys are still canonical: value before required
        expect(Object.keys(field).slice(3)).toEqual(['value', 'required', 'clientHint']);
    });
});

/**
 * Ordering is settled at serialization, not only at write time.
 * `getField` hands back the stored object, so a caller can set a key on it
 * directly — which is how a late key used to land at the end of the field and
 * change the signature of a form that describes the same thing.
 */
describe('a field mutated through getField is still ordered', () => {
    const bytes = (form: FormView) =>
        JSON.stringify((form.toJSON().content as any).fields[0]);

    it('a value set straight on the stored field lands canonically', () => {
        const mutated = new FormView('f', 'F');
        mutated.addTextField('name', 'Name', true);
        (mutated.getField('name') as any).value = 'Ada';

        const upfront = new FormView('f', 'F');
        upfront.addField('text', 'name', 'Name', { required: true, value: 'Ada' });

        expect(bytes(mutated)).toBe(bytes(upfront));
    });

    it('twice in a row, the payload does not drift', () => {
        const form = new FormView('f', 'F');
        form.addTextField('name', 'Name', true);
        (form.getField('name') as any).value = 'Ada';

        expect(bytes(form)).toBe(bytes(form));
    });
});
