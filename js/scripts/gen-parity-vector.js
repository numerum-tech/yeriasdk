/**
 * Generates the cross-SDK parity golden vector consumed by the Python test
 * suite (py/tests/test_js_parity.py).
 *
 * It signs a representative view and a notification with the *built* JS SDK at
 * a fixed timestamp, then writes the exact signed bytes + Ed25519 signatures to
 * a JSON fixture. The Python test re-signs the same inputs with the same key
 * and asserts byte-for-byte equality — proving the two SDKs are wire-compatible.
 *
 * Regenerate after any change to JS signing/serialization:
 *   node js/scripts/gen-parity-vector.js
 * (A fresh random keypair each run is fine — the fixture is self-contained.)
 */
const { generateKeyPairSync } = require('crypto');
const { writeFileSync, mkdirSync } = require('fs');
const path = require('path');
const { YeriaApp, YeriaUI, Notification } = require('../dist');

const FIXED_TS = 1700000000000; // fixed so signatures are deterministic

const kp = generateKeyPairSync('ed25519');
const privateKey = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = kp.publicKey.export({ type: 'spki', format: 'pem' });

const app = new YeriaApp({ appId: 'parity', privateKey, publicKey });

// A view that exercises fields + nav + a submit action.
const form = YeriaUI
  .createFormView('pf', 'Parity Form')
  .addTextField('name', 'Name', true)
  .submitButton('Go', 'POST');
const viewJson = form.toJSON();
// Signature via le signer interne, et non `app.serve()` : seul le signer
// accepte un horodatage imposé, indispensable pour que la signature du
// vecteur soit reproductible.
const viewEnv = app.signer.signView(viewJson, 'parity', FIXED_TS);

// Notification WITHOUT a link — exercises the "omit undefined link" case.
const noteEnv = app.signer.signNotification(
  new Notification('u1', 'Title', 'Body'),
  'parity',
  FIXED_TS
);

// A notification whose text is NOT ASCII, and a view carrying boundary
// floats. Python escapes non-ASCII by default and formats floats its own way
// (`1.0`, `1e-07`, `-0.0`), so these two vectors are what pins the signing
// serializer: the notification travels as a STRUCTURED object, so the Yeria
// backend re-derives the signed string with `JSON.stringify` before verifying
// it — a French title signed by the Python SDK used to be rejected.
const noteAccentEnv = app.signer.signNotification(
  new Notification('u1', 'Réservation confirmée ☕', 'Votre créneau du 5 à 9 h — merci !'),
  'parity',
  FIXED_TS
);

// La MEME notification, signee depuis un deploiement de developpement. Le
// selecteur entre dans la charge signee, en derniere position : l'ordre des
// cles fait partie des octets signes. Sans ce vecteur, une divergence d'ordre
// entre JS et Python ne se verrait qu'a la premiere notification refusee par
// le backend, en production.
const noteDevEnv = app.signer.signNotification(
  new Notification('u1', 'Title', 'Body'),
  'parity',
  FIXED_TS,
  'devkey_a3f9c81e04b2d675'
);

// Structural goldens: one representative view per builder. The Python test
// rebuilds each with the equivalent fluent calls and asserts the JSON is
// structurally identical (transparent to the mobile renderer). Keep the calls
// here in sync with py/tests/test_js_structural_parity.py.
const ui = YeriaUI;
const structuralViews = {
  reader: ui.createReaderView('rd', 'Reader').setIntro('hi')
    .addParagraph('para').addSubTitle('sub').addMarkdown('**b**').addLink('Go', '/x').addSeparator().toJSON(),
  actionlist: ui.createActionListView('al', 'Actions').setIntro('pick')
    .addAction('/a', 'Alpha', 'Do A').addAction('/b', 'Beta').toJSON(),
  actiongrid: ui.createActionGridView('ag', 'Grid').setColumns(3)
    .addAction('/a', 'Alpha').addAction('/b', 'Beta').toJSON(),
  card: ui.createCardView('cd', 'Card').setIntro('sub').setDescription('desc')
    .addStat('Views', '42').addAction('/open', 'Open').toJSON(),
  timeline: ui.createTimelineView('tl', 'Timeline').addEvent('Started', '2026-01-01', 'desc').toJSON(),
  formval: ui.createFormView('fv', 'F')
    .addSelectField('g', 'G', true, [{ value: 'm', label: 'M' }, { value: 'f', label: 'F' }])
    .setFieldValue('g', 'm').toJSON(),
};

// Byte-exact field parity. The structural goldens above sort keys, so they
// cannot catch a key-ORDER divergence — yet order is exactly what the
// signature depends on, since it is taken over the compact JSON. A single
// field carries no volatile metadata, so its compact JSON can be compared
// verbatim between the two SDKs. Keep these cases in sync with
// py/tests/test_js_field_bytes_parity.py.
const compactField = (form, fieldType) =>
  JSON.stringify(form.toJSON().content.fields.find(f => f.fieldType === fieldType));

const fieldBytes = {
  'date-bounded': compactField(
    ui.createFormView('d', 'D').addDateField('birth', 'Birth', true, '1900-01-01', '2010-12-31'), 'date'),
  'date-min-only': compactField(
    ui.createFormView('d', 'D').addDateField('from', 'From', false, '2020-01-01'), 'date'),
  'date-max-only': compactField(
    ui.createFormView('d', 'D').addDateField('until', 'Until', false, undefined, '2030-12-31'), 'date'),
  'date-unbounded': compactField(
    ui.createFormView('d', 'D').addDateField('day', 'Day'), 'date'),
  'gps-full': compactField(
    ui.createFormView('g', 'G').addGPSField('loc', 'Loc', true, false,
      { precision: true, maxAccuracy: 25, altitude: true }), 'gps'),
  'gps-plain': compactField(
    ui.createFormView('g', 'G').addGPSField('loc', 'Loc'), 'gps'),
  // Every option object below is deliberately written in an order that is NOT
  // the canonical emission order. A regression to `{...options}` would then
  // change these bytes and fail the Python side, which a same-order literal
  // would have let through.
  'photo': compactField(
    ui.createFormView('p', 'P').addPhotoField('img', 'Img', false, ['jpeg'], false,
      { source: 'record', maxCount: 3, multiple: true }), 'photo'),
  'file': compactField(
    ui.createFormView('p', 'P').addFileField('doc', 'Doc', false, ['application/pdf'],
      { maxCount: 2, multiple: true }), 'file'),
  'audio': compactField(
    ui.createFormView('a', 'A').addAudioField('m', 'M', false,
      { maxSize: 1000, source: 'record', minDuration: 2, maxDuration: 30 }), 'audio'),
  'video': compactField(
    ui.createFormView('v', 'V').addVideoField('c', 'C', false,
      { maxSize: 5000, quality: 'high', source: 'record', maxDuration: 60 }), 'video'),
  // A value set AFTER the field was added: `updateField` used to append the key
  // at the end, where Python emits it first.
  'late-value': compactField((() => {
    const form = ui.createFormView('f', 'F').addTextField('name', 'Name', true);
    form.setFieldValue('name', 'Ada');
    return form;
  })(), 'text'),
  // A media value set then cleared with null: the key must be gone, as it is
  // in Python where None is stripped at build.
  'media-value-cleared': compactField((() => {
    const form = ui.createFormView('p', 'P').addPhotoField('img', 'Img', false);
    form.setFieldValue('img', 'a.jpg');
    form.setFieldValue('img', null);
    return form;
  })(), 'photo'),
  // Floats whose Python formatting used to differ (`1.0`/`1e-07`/`-0.0`) and
  // a label with accents, which Python used to escape.
  'gps-floats': compactField(
    ui.createFormView('g', 'G').addGPSField('loc', 'Coordonnées à ±5 m', false, false,
      { maxAccuracy: 5.0, precision: true }), 'gps'),
  // A RegExp has no JSON form: this used to serialise as `"pattern":{}`.
  'email-pattern': compactField(
    ui.createFormView('e', 'E').addEmailField('m', 'M', true), 'email'),
  // Stored media as a read-only viewer — the JS-only feature Python lacked.
  'photo-stored': compactField(
    ui.createFormView('p', 'P').addPhotoField('img', 'Img', false, ['jpeg'], false,
      { readonly: true, multiple: true, value: ['a.jpg', 'b.jpg'] }), 'photo'),
  'video-stored': compactField(
    ui.createFormView('v', 'V').addVideoField('c', 'C', false,
      { readonly: true, value: 'c.mp4', maxDuration: 60 }), 'video'),
};

// Byte-exact goldens for the view builders OUTSIDE the form. Each caller
// object below is written in an order that is NOT the emission order, so a
// regression to a spread changes these bytes.
const compact = (v) => JSON.stringify(v);

const partBytes = {
  'timeline-item': compact(
    ui.createTimelineView('t', 'T')
      .addItem({ status: 'completed', icon: 'check', timestamp: '2026-01-01', title: 'A', id: 'a' })
      .toJSON().content.items[0]),
  'media-item': compact((() => {
    const view = ui.createMediaView('m', 'M');
    view.addMediaItem({
      loop: true, controls: false, kind: 'audio', poster: 'p.jpg', id: 'a',
      sources: [{ src: '/s.mp3', type: 'audio/mpeg' }]
    });
    return view.toJSON().content.items[0];
  })()),
  'media-item-bare': compact((() => {
    const view = ui.createMediaView('m', 'M');
    view.addMediaItem({ id: 'a', kind: 'audio', sources: [{ src: '/s.mp3', type: 'audio/mpeg' }] });
    return view.toJSON().content.items[0];
  })()),
  'media-item-created': compact((() => {
    const view = ui.createMediaView('m', 'M');
    view.addMediaItem(view.createMedia('a', 'video', '/v.mp4', { poster: 'p.jpg', loop: true, type: 'video/mp4' }));
    return view.toJSON().content.items[0];
  })()),
  'carousel-settings': compact((() => {
    const view = ui.createCarouselView('c', 'C').addSlide({ id: 's', title: 'S' });
    view.setSettings({ showIndicators: false, loop: false, autoplay: true });
    return view.toJSON().content.settings;
  })()),
  'map-layer': compact((() => {
    const view = ui.createMapView('m', 'M');
    view.addLayer({
      toggleable: true, zIndex: 2, type: 'markers',
      markers: [{ location: { lon: 2, lat: 1 }, id: 'a', color: '#fff' }],
      name: 'Stores', id: 'stores', cluster: false
    });
    return view.toJSON().content.layers[0];
  })()),
  'map-heatmap': compact((() => {
    const view = ui.createMapView('m', 'M');
    view.addLayer({
      colorRamp: ['#000', '#fff'], points: [{ intensity: 0.5, lon: 1, lat: 1 }],
      type: 'heatmap', id: 'h', radius: 30
    });
    return view.toJSON().content.layers[0];
  })()),
  'map-marker': compact((() => {
    const view = ui.createMapView('m', 'M');
    view.addMarker({
      popup: { actions: [{ method: 'POST', url: '/go' }], title: 'P' },
      action: { confirm: { message: 'M', title: 'T' }, url: '/act' },
      selected: true, location: { precision: 5, lon: 2, lat: 1 },
      title: ' A ', id: 'a', meta: { k: 1 }
    });
    return view.toJSON().content.layers[0].markers[0];
  })()),
  'map-shape': compact((() => {
    const view = ui.createMapView('m', 'M');
    view.addShape({
      config: { strokeColor: '#000', fillColor: '#fff' },
      points: [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }],
      action: { url: '/s' }, type: 'Polygon', id: 'z'
    });
    return view.toJSON().content.layers[0].shapes[0];
  })()),
  'map-viewport': compact((() => {
    const view = ui.createMapView('m', 'M');
    view.setEmptyMessage('-').setViewport({ pitch: 10, zoom: 12, center: { lon: 2, lat: 1 }, bearing: 90 });
    return view.toJSON().content.viewport;
  })()),
  'map-controls': compact((() => {
    const view = ui.createMapView('m', 'M');
    view.setEmptyMessage('-').setControls({ scale: true, zoom: false, attribution: 'X' });
    return view.toJSON().content.controls;
  })()),
  'carousel-bare': compact(
    ui.createCarouselView('c', 'C').addSlide({ id: 's', title: 'S' }).toJSON().content),
  'carousel-slide': compact((() => {
    const view = ui.createCarouselView('c', 'C');
    view.addSlide({
      meta: { k: 1 }, actions: [{ variant: 'primary', text: 'Go', href: '/x', method: 'GET' }],
      image: { alt: 'A', url: '/i.jpg' }, badge: 'New', title: ' S ', id: 's', description: 'D'
    });
    return view.toJSON().content.slides[0];
  })()),
  'map-pick': compact((() => {
    const view = ui.createMapView('m', 'M');
    view.setPickMode({
      snapToMarkers: true, submitLabel: 'Go', submitMethod: 'POST',
      prompt: 'Pick', submitUrl: '/submit'
    });
    return view.toJSON().content.pick;
  })()),
};

const floatForm = ui.createFormView('f', 'F');
floatForm.addGPSField('loc', 'Loc');
floatForm.setFieldValue('loc', {
  round: 6.0, tiny: 1e-7, atSix: 1e-6, big: 1e21, belowBig: 1e20,
  negZero: -0.0, third: 1 / 3, lat: 6.1319, lon: 1.2228
});
const floatEnv = app.signer.signView(floatForm.toJSON(), 'parity', FIXED_TS);

const vector = {
  _comment: 'Golden cross-SDK parity vector. Generated by js/scripts/gen-parity-vector.js. Do not edit by hand.',
  appId: 'parity',
  timestamp: FIXED_TS,
  privateKey,
  publicKey,
  viewJson,
  viewPayload: viewEnv.payload,
  viewSignature: viewEnv.signature,
  noteSignature: noteEnv.signature,
  noteAccentSignature: noteAccentEnv.signature,
  noteDevSignature: noteDevEnv.signature,
  devKeyId: 'devkey_a3f9c81e04b2d675',
  floatViewJson: floatForm.toJSON(),
  floatPayload: floatEnv.payload,
  floatSignature: floatEnv.signature,
  structuralViews,
  fieldBytes,
  partBytes,
};

const outDir = path.resolve(__dirname, '../../py/tests/fixtures');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'js_parity_vector.json');
writeFileSync(outFile, JSON.stringify(vector, null, 2) + '\n');
console.log('wrote', outFile);
