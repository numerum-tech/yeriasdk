/**
 * Parity guards raised by the JS/Python comparative review.
 *
 * Each case below fixes a place where the two SDKs refused — or accepted —
 * different things. The bytes themselves are covered by the golden vector
 * (py/tests/test_js_field_bytes_parity.py); these check the RULES.
 * Mirrors py/tests/test_parity_guards.py.
 */

import { FormView } from '../src/core/form-view';
import { CarouselView } from '../src/core/carousel-view';
import { MapView } from '../src/core/map-view';
import { MediaView } from '../src/core/media-view';
import { TimelineView } from '../src/core/timeline-view';
import { DataSanitizer } from '../src/utils/validators';
import { buildProviderError } from '../src/core/provider-error';
import { YeriaApp } from '../src/core/yeria-app';
import { stringifyForSigning } from '../src/utils/signing-json';
import { generateKeyPairSync } from 'crypto';

describe('a URL the client may open is http or https, nothing else', () => {
    it.each(['https://a.test/x', 'http://a.test'])('accepts %s', url => {
        expect(DataSanitizer.validateURL(url)).toBe(true);
    });

    it.each([
        'javascript:alert(1)', 'vbscript:msgbox', 'data:text/html,x',
        'file:///etc/passwd', 'ftp://h/x', 'mailto:a@b.c',
        '/relative', 'https://', 'not-a-url',
    ])('refuses %s', url => {
        expect(DataSanitizer.validateURL(url)).toBe(false);
    });
});

describe('a stored media path is relative to the service base', () => {
    it.each(['api/media/a.jpg', '/api/media/a.jpg', 'a.jpg'])('accepts %s', path => {
        const form = new FormView('p', 'P');
        expect(() => form.addPhotoField('img', 'Img', false, ['jpeg'], false, { value: path }))
            .not.toThrow();
    });

    it.each([
        'https://cdn.test/a.jpg', 'http://cdn.test/a.jpg', '//cdn.test/a.jpg',
        'file:///x', 'data:image/png;base64,AA',
        // WHATWG reads a backslash as a slash: these are absolute in a browser.
        '\\\\cdn.test/a.jpg', 'https:\\\\cdn.test\\\\a.jpg', '/\\\\cdn.test/a.jpg',
        // Any scheme, not a list of them.
        'javascript:alert(1)', 'mailto:x@y.test', 'blob:https://x',
        // WHATWG strips these before parsing; a browser sees an absolute URL.
        '\u0001https://cdn.test/a.jpg', 'ht\ntps://cdn.test/a.jpg', '\thttps://cdn.test/a.jpg',
        '\u0000https://cdn.test/a.jpg', '\u0001//cdn.test/a.jpg',
    ])('refuses %s', path => {
        const form = new FormView('p', 'P');
        expect(() => form.addPhotoField('img', 'Img', false, ['jpeg'], false, { value: path }))
            .toThrow(/relative to the service base/);
    });

    it('refuses an absolute path inside a list', () => {
        const form = new FormView('p', 'P');
        expect(() => form.addPhotoField('img', 'Img', false, ['jpeg'], false, {
            multiple: true, value: ['a.jpg', 'https://cdn.test/b.jpg']
        })).toThrow(/relative to the service base/);
    });

    it('refuses an absolute path set after the fact', () => {
        const form = new FormView('f', 'F');
        form.addPhotoField('p', 'P', false);

        expect(() => form.setFieldValue('p', 'https://cdn.test/a.jpg')).toThrow(/relative to the service base/);
        expect(() => form.updateField('p', { value: 'data:image/png;base64,AAAA' })).toThrow(/relative to the service base/);
        expect(() => form.updateField('p', { value: ['a.jpg', '//host/b.jpg'] })).toThrow(/relative to the service base/);

        const injected = form.injectData({ p: 'file:///etc/a.jpg' });
        expect(injected.ok).toBe(false);
        expect((form.toJSON().content as any).fields[0]).not.toHaveProperty('value');

        form.setFieldValue('p', 'a.jpg');
        expect((form.toJSON().content as any).fields[0].value).toBe('a.jpg');
    });

    it('refuses an absolute path written onto the object getField returned', () => {
        const form = new FormView('f', 'F');
        form.addPhotoField('p', 'P', false);
        (form.getField('p') as any).value = 'https://cdn.test/a.jpg';
        expect(() => form.toJSON()).toThrow(/relative to the service base/);

        const other = new FormView('f', 'F');
        other.addPhotoField('p', 'P', false);
        (other.getFields()[0] as any).value = ['a.jpg', 'data:image/png;base64,AAAA'];
        expect(() => other.toJSON()).toThrow(/relative to the service base/);
    });

    it('a value cleared with null is a value removed, as None is in Python', () => {
        const form = new FormView('f', 'F');
        form.addPhotoField('p', 'P', false);
        form.setFieldValue('p', 'a.jpg');
        form.setFieldValue('p', null);
        expect((form.toJSON().content as any).fields[0]).not.toHaveProperty('value');
    });

    it('still checks the accepted formats — the guard must not shadow that case', () => {
        const form = new FormView('p', 'P');
        expect(() => form.addField('photo', 'p', 'P', { required: false }))
            .toThrow(/accepted types/);
    });
});

describe('a validation pattern travels as its source text', () => {
    it('an email field carries the regex, not an empty object', () => {
        const form = new FormView('e', 'E');
        form.addEmailField('m', 'M', true);

        const field: any = (form.toJSON().content as any).fields[0];
        expect(typeof field.pattern).toBe('string');
        expect(field.pattern).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
    });

    it('a pattern set after the fact travels the same way', () => {
        const form = new FormView('e', 'E');
        form.addEmailField('m', 'M', true);
        form.updateField('m', { pattern: /^x$/ });

        const field: any = (form.toJSON().content as any).fields[0];
        expect(field.pattern).toBe('^x$');
    });
});

describe('a documented default belongs to the client, not the payload', () => {
    it('a bare media item carries no controls key', () => {
        const view = new MediaView('m', 'M');
        view.addMediaItem({ id: 'a', kind: 'audio', sources: [{ src: '/s.mp3', type: 'audio/mpeg' }] });

        expect((view.toJSON().content as any).items[0]).not.toHaveProperty('controls');
    });

    it('an item built through createMedia carries no controls key either', () => {
        const view = new MediaView('m', 'M');
        view.addMediaItem(view.createMedia('a', 'audio', '/s.mp3'));

        const item = (view.toJSON().content as any).items[0];
        expect(item).not.toHaveProperty('controls');
        expect(item.sources).toEqual([{ src: '/s.mp3' }]);
    });

    it('a bare carousel carries no settings key', () => {
        const view = new CarouselView('c', 'C');
        view.addSlide({ id: 's', title: 'S' });
        expect((view.toJSON().content as any)).not.toHaveProperty('settings');

        view.setSettings({});
        expect((view.toJSON().content as any)).not.toHaveProperty('settings');
    });

    it('carousel settings carry only what was set', () => {
        const view = new CarouselView('c', 'C');
        view.addSlide({ id: 's', title: 'S' });
        view.setSettings({ loop: false });

        expect((view.toJSON().content as any).settings).toEqual({ loop: false });
    });
});

describe('no payload carries a non-finite number, whatever the view', () => {
    it('a NaN carousel interval is refused when the view is built', () => {
        const view = new CarouselView('c', 'C');
        view.addSlide({ id: 's', title: 'S' });
        view.setSettings({ intervalMs: NaN });
        expect(() => view.toJSON()).toThrow(/non-finite number at content\.settings\.intervalMs/);
    });

    it('a NaN in view state is refused too, not serialised as null', () => {
        const form = new FormView('f', 'F');
        form.addTextField('t', 'T', true);
        form.setState('score', NaN);
        expect(() => form.toJSON()).toThrow(/non-finite number at state\.score/);
    });

    it('a non-finite number inside an opaque map field is refused when the view is built', () => {
        const view = new MapView('m', 'M');
        view.addMarker({ id: 'a', location: { lat: 1, lon: 2 }, meta: { score: NaN } });
        expect(() => view.toJSON()).toThrow(/non-finite number at content\.layers\[0\]\.markers\[0\]\.meta\.score/);

        const other = new MapView('m', 'M');
        other.addCircle('c', { lat: 1, lon: 2 }, 5);
        (other.getContent().layers[0] as any).shapes[0].action = { url: '/a', body: { weight: Infinity } };
        expect(() => other.toJSON()).toThrow(/non-finite number at content\.layers\[0\]\.shapes\[0\]\.action\.body\.weight/);
    });

    it('a nested toJSON that yields NaN is caught at build, on what gets serialised', () => {
        const view = new MapView('m', 'M');
        view.addMarker({ id: 'a', location: { lat: 1, lon: 2 }, meta: { score: { toJSON: () => NaN } } });
        expect(() => view.toJSON()).toThrow(/non-finite number at content\.layers\[0\]\.markers\[0\]\.meta\.score/);
    });

    it('the signing serializer is byte-identical to JSON.stringify for finite payloads', () => {
        const payloads: unknown[] = [
            { title: 'Réservation confirmée ☕' }, { n: 1.0, tiny: 1e-7, big: 1e21, negZero: -0 },
            { lat: 6.1319, lon: 1.2228 }, { nested: [1, 'é', null, true, {}] },
            { '8': 'index-like key', b: 'plain' },
        ];
        for (const p of payloads) expect(stringifyForSigning(p)).toBe(JSON.stringify(p));
    });

    it('the static signView refuses a raw view carrying a non-finite number', () => {
        const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
        expect(() => YeriaApp.signView({ id: 'v', type: 'Form', content: { x: NaN } }, 'app', pem))
            .toThrow(/non-finite/);
        expect(() => YeriaApp.signView({ id: 'v', type: 'Form', content: { x: { toJSON: () => Infinity } } }, 'app', pem))
            .toThrow(/non-finite/);
    });

    it('a non-finite provider error status falls back to the advisory 400', () => {
        expect(buildProviderError({ code: 'x.y', message: 'm', status: NaN }).error.status).toBe(400);
        expect(buildProviderError({ code: 'x.y', message: 'm', status: 503 }).error.status).toBe(503);
    });

    it('a NaN maxLength set after the fact is refused when the form is built', () => {
        const form = new FormView('f', 'F');
        form.addTextField('t', 'T', false);
        form.updateField('t', { maxLength: Infinity });
        expect(() => form.toJSON()).toThrow(/non-finite number at content\.fields\[0\]\.maxLength/);
    });
});

describe('a map carries finite numbers only', () => {
    it.each([NaN, Infinity, -Infinity])('refuses a marker latitude of %s', lat => {
        const view = new MapView('m', 'M');
        expect(() => view.addMarker({ id: 'a', location: { lat, lon: 2 } })).toThrow(/finite/);
    });

    it('refuses a non-finite coordinate inside a layer handed to addLayer', () => {
        const view = new MapView('m', 'M');
        expect(() => view.addLayer({
            id: 'l', type: 'markers', markers: [{ id: 'a', location: { lat: 1, lon: NaN } }]
        })).toThrow(/finite/);
        expect(() => view.addLayer({
            id: 'h', type: 'heatmap', points: [{ lat: 1, lon: 1, intensity: Infinity }]
        })).toThrow(/finite/);
    });

    it('refuses a non-finite number anywhere inside GeoJSON data', () => {
        const view = new MapView('m', 'M');
        expect(() => view.addLayer({
            id: 'g', type: 'geojson', data: { type: 'Point', coordinates: [NaN, 1] }
        })).toThrow(/finite/);
        expect(() => view.addLayer({
            id: 'g', type: 'geojson',
            data: { type: 'FeatureCollection', bbox: [0, 0, Infinity, 1], features: [] }
        })).toThrow(/finite/);
        expect(() => view.addLayer({
            id: 'g', type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: { open: true, n: 3 } }
        })).not.toThrow();
    });

    it('refuses a NaN viewport zoom, which every range check lets through', () => {
        const view = new MapView('m', 'M');
        expect(() => view.setViewport({ zoom: NaN })).toThrow(/finite/);
    });

    it('refuses a NaN circle radius and a NaN stroke width', () => {
        const view = new MapView('m', 'M');
        expect(() => view.addCircle('c', { lat: 1, lon: 2 }, NaN)).toThrow(/finite/);
        expect(() => view.addCircle('c', { lat: 1, lon: 2 }, 5, { strokeWidth: NaN })).toThrow(/finite/);
    });
});

describe('key order outside the form does not follow the caller either', () => {
    const bytes = (value: unknown) => JSON.stringify(value);

    it('timeline item', () => {
        const a = new TimelineView('t', 'T');
        const b = new TimelineView('t', 'T');
        a.addItem({ status: 'completed', id: 'a', title: 'A', timestamp: '2026-01-01' });
        b.addItem({ id: 'a', title: 'A', timestamp: '2026-01-01', status: 'completed' });

        expect(bytes((a.toJSON().content as any).items[0]))
            .toBe(bytes((b.toJSON().content as any).items[0]));
    });

    it('media item', () => {
        const a = new MediaView('m', 'M');
        const b = new MediaView('m', 'M');
        const sources = [{ src: '/s.mp3', type: 'audio/mpeg' }];
        a.addMediaItem({ loop: true, controls: false, id: 'a', kind: 'audio', sources });
        b.addMediaItem({ id: 'a', kind: 'audio', controls: false, loop: true, sources });

        expect(bytes((a.toJSON().content as any).items[0]))
            .toBe(bytes((b.toJSON().content as any).items[0]));
    });

    it('carousel slide', () => {
        const a = new CarouselView('c', 'C');
        const b = new CarouselView('c', 'C');
        a.addSlide({ badge: 'N', actions: [{ href: '/x', text: 'Go' }], title: 'S', id: 's' });
        b.addSlide({ id: 's', title: 'S', badge: 'N', actions: [{ text: 'Go', href: '/x' }] });

        expect(bytes((a.toJSON().content as any).slides[0]))
            .toBe(bytes((b.toJSON().content as any).slides[0]));
    });

    it('map layer, marker and shape', () => {
        const a = new MapView('m', 'M');
        const b = new MapView('m', 'M');
        a.addLayer({ name: 'L', type: 'markers', markers: [], id: 'l' });
        b.addLayer({ id: 'l', type: 'markers', name: 'L', markers: [] });
        a.addMarker({ location: { lon: 2, lat: 1 }, color: '#fff', id: 'a' }, 'l');
        b.addMarker({ id: 'a', location: { lat: 1, lon: 2 }, color: '#fff' }, 'l');
        a.addShape({ radius: 5, center: { lon: 2, lat: 1 }, type: 'Circle', id: 'c' });
        b.addShape({ id: 'c', type: 'Circle', center: { lat: 1, lon: 2 }, radius: 5 });

        expect(bytes((a.toJSON().content as any).layers))
            .toBe(bytes((b.toJSON().content as any).layers));
    });

    it('map viewport and controls', () => {
        const a = new MapView('m', 'M');
        const b = new MapView('m', 'M');
        a.setEmptyMessage('-').setViewport({ zoom: 3, center: { lon: 2, lat: 1 } }).setControls({ scale: true, zoom: false });
        b.setEmptyMessage('-').setViewport({ center: { lat: 1, lon: 2 }, zoom: 3 }).setControls({ zoom: false, scale: true });

        expect(bytes((a.toJSON().content as any).viewport)).toBe(bytes((b.toJSON().content as any).viewport));
        expect(bytes((a.toJSON().content as any).controls)).toBe(bytes((b.toJSON().content as any).controls));
    });

    it('carousel settings', () => {
        const a = new CarouselView('c', 'C');
        const b = new CarouselView('c', 'C');
        a.addSlide({ id: 's', title: 'S' });
        b.addSlide({ id: 's', title: 'S' });
        a.setSettings({ showIndicators: false, autoplay: true });
        b.setSettings({ autoplay: true, showIndicators: false });

        expect(bytes((a.toJSON().content as any).settings))
            .toBe(bytes((b.toJSON().content as any).settings));
    });

    it('map pick', () => {
        const a = new MapView('m', 'M');
        const b = new MapView('m', 'M');
        a.setPickMode({ snapToMarkers: true, prompt: 'Pick', submitUrl: '/submit' });
        b.setPickMode({ submitUrl: '/submit', prompt: 'Pick', snapToMarkers: true });

        expect(bytes((a.toJSON().content as any).pick))
            .toBe(bytes((b.toJSON().content as any).pick));
    });
});
