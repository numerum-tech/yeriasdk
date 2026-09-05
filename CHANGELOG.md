# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2026-09-05

Two of the SDK's calls to Yeria could not have worked: their URLs matched no
route on the backend. Nothing exercised them end to end, so nobody had noticed.
The development endpoint arrives in the same release, because it is what made
the broken paths visible.

### Added

- `devKeyId` (`dev_key_id` in Python) in the client configuration: the selector
  the provider dashboard hands you once you register a development endpoint.
  Its presence tells Yeria the call comes from a working deployment; its value
  names the row that verifies the signature. One field to copy, and the
  signature stays the only proof, so declaring a `devKeyId` you hold no private
  key for buys nothing.

  It goes into the **signed** payload, in last position, since key order is part
  of the bytes being signed. It is added only when it is set: adding it
  unconditionally would change the shape of every production payload and break
  signatures already in the field. It covers `notify` and `fetchUserDetails`.
  Leave it unset in production.

- Key rotation is refused locally in development mode, before any request
  leaves. Rotating a service's production key is the heaviest action on this
  surface, and it should not start from a workstation whose key expires on its
  own.

### Fixed

- `sendNotification` targeted `POST /api/v1/user/notifications`, a path the
  middleware keeps behind a user JWT this client does not send, so every
  notification came back 401. It now posts to
  `POST /api/v1/provider/services/{appId}/notifications`, signed and without a
  bearer token, like the other provider routes.

- `rotateKey` targeted `/api/v1/services/{id}/keys/rotate`, written before the
  six-prefix taxonomy. That path matches no route and answered 404. It is now
  `/api/v1/provider/services/{id}/keys/rotate`.

- Python SDK: the request body always carried `"link"`, even when absent, while
  the signed payload omits it. The backend rebuilds what it verifies from the
  object it receives, so every Python notification without a link failed
  signature verification.

## [1.4.0] - 2026-09-05

Three breaking changes, all on the wire. Provider code keeps compiling in
two of the three cases — the historical method names are kept and mapped —
but the payload changes, so a client older than this release renders less
than it used to. Nothing is lost silently: what an older client cannot read,
it simply does not draw.

They ship in a minor rather than in a major because the version they were
written for never reached a registry: 1.3.2 was tagged on 2026-08-23 and the
publication never happened. npm holds 1.3.1, PyPI holds 1.3.0, the catalogue
holds three services whose payloads we control, and the mobile client reads
both the old shape and the new one — so there is nothing to race. The next
number after this one is what carries the next break.

**1.3.2 is skipped on purpose.** A 1.3.2 upload to PyPI was made and then
deleted, and PyPI never lets a deleted filename be reused — the number is
gone for this project, permanently and by design, so that anything already
pinned to it cannot be swapped underneath. Rather than let the two SDKs drift
onto different numbers, both move to 1.4.0.

### Added
- **Media fields accept a stored file in Python too** — `value`, `readonly` and `disabled` on `add_photo_field`, `add_file_field`, `add_audio_field` and `add_video_field`. The feature below was written for the JS SDK only: the Python methods had none of the three parameters, so a Python provider could not build the read-only viewer this changelog described.
- **`MapView.get_content()` (Python)** — the four other views exposed it and MapView did not.
- **`setStatsHeading` on CardView** — names the stats block. The renderer printed a hardcoded French `'Statistiques'` above every grid, with no l10n key and no way for a provider to change or drop it. Absent means no heading: the client draws no title of its own.
- **`setPage(current, total?)`** — where a view sits in its paginated sequence. The client draws the indicator between the `next` / `prev` controls. Numbers, not a sentence, so the same payload reads "Page 2 / 4" and "Page 2 of 4"; omit `total` for an open-ended sequence. Purely informative — it moves nothing.
- **A select can say how it wants to be shown** — `addSelectField(..., options, display?)` takes `'radio'` or `'dropdown'`. A presentation preference, not a new field type, deliberately: a client that does not know the key falls back to the sheet and stays usable, whereas a type it did not know would render nothing.
- **Blank space between fields** — `addSpacer(size?)` / `add_spacer(size?)`. Completes `addSeparator`: a rule says "a new group starts here", a spacer draws nothing and simply lets a group breathe. Three steps and no number — `sm`, `md` (default), `lg` — because a provider asks for a gap and the client decides what it measures (the mobile renders 8 / 16 / 32). A size outside them is refused when the view is built rather than normalised in silence. Display-only like `separator` and `paragraph`: no label, no value, skipped by validation, never submitted, and **excluded from the "at least one field" rule** — a form made only of rules and blank space is not a form. The field id derives from the field's position, not from a timestamp, so two identical forms serialise and sign identically. The demo shows the three steps at `/api/forms/rich`.
- **A second form action** — `secondaryButton(text, url, options?)` / `secondary_button(...)`. A form had exactly one action: `submitButton`, `updateButton` and `deleteButton` all wrote the same `content.submit`, so they were HTTP-method shortcuts, not extra buttons. Real screens have two outcomes — Send / Skip, Accept / Reject. The action renders under the submit, in the same footer bar, at secondary weight. `mode` is explicit because guessing would be a bug: `navigate` (default) calls the URL and **discards what was typed**, `submit` sends the current values to a second destination. `validate` defaults to `false` in navigate mode and `true` in submit mode.
- **Displayed text between fields** — `addParagraph(text, {size, bold, italic})` / `add_paragraph(...)`. Not an input: no value, never submitted, skipped by validation. Sizes are `xl` / `lg` / `md` / `sm` (24 / 18 / 14 / 12 px, default `md`) — **sizes, not roles**: the SDK does not decide whether a block is a heading, the provider does. Joins `separator` as a display-only field type.
- **`setNote` / `set_note`** — small print under the intro. The mobile app has always rendered `note` distinctly (smaller, italic, dimmed); the SDK simply had no setter, and the docs wrongly listed it as deprecated in favour of `setIntro`.
- **Media fields accept a stored file** — `value` on `photo` / `file` / `audio` / `video` takes the path of a file the provider already holds (an array when `multiple`), and with `readonly` the field becomes a viewer: the player works, the add and delete controls disappear. **The path must be relative to the service base** — `http(s)://`, `//host`, `file://` and `data:` are refused by the renderer, per the platform's asset policy. A CDN is reached by answering the relative URL with a redirect.

### Changed
- **A documented default is no longer written into the payload (both)** — `MediaView` emitted `controls: true` on every item the provider had not configured, and `CarouselView.set_settings` filled in all four of `autoplay` / `intervalMs` / `loop` / `showIndicators` whatever the provider had asked for. Both defaults are documented and the client already applies them; writing them in made a bare item carry keys nobody set, and made the two SDKs sign the same view differently. Only what the provider sets is emitted — the carousel constructor included, which used to write all four settings before the provider had said anything. `createMedia` / `create_media` follow the same rule: the helper used to fill `controls: true` in, so an item built through it signed differently from the same item written as a literal.
- **MessageView is built from buttons and outcomes (breaking)** — `addAction(label, { go?, method?, back? })`, two at most, zero valid. Without `go` or `back` a button closes and does nothing else; with `go` it loads that view; with `back` it steps back through the stack without loading anything. The model is the classic dialog — a set of buttons, a severity, one outcome per button — and the only thing that does not transfer is the return value: `MsgBox` handed the pressed button back to the caller, who branched, whereas the provider is not present when the user taps, so the outcome travels with the button. `setPrimaryAction`, `setSecondaryAction` and `submitButton` are kept and map onto the new shape, `confirmMessage` included, which is what retires that field as a destination — a name meant for a confirmation prompt that the client read as a path.
  With no action at all the client draws a single close button, and there is no cross and no dismissal by tapping outside: every exit is a labelled button whose outcome the provider declared, so a stray gesture cannot swallow a decision. `confirm` was previously emitted on every message with an `OK/POST` nobody had asked for, `cancel` only rendered when `canDismiss` was true, and `canDismiss: false` with no second button produced a box with no way out at all.
- **`content.subtitle` becomes `content.intro` on Card and Carousel (breaking)** — the eleven other views already said `intro`, and the split was never semantic: MessageView carries the key named `intro` and the mobile renderer draws it *as a subtitle*. One role wore two names for historical reasons, and the provider had to remember which view used which. `setSubtitle` stays as an alias of `setIntro` and writes the same key.
- **`setEntry` accepts a relative recoil** — an integer alongside the two words: `1` stacks (`push`), `0` replaces (`replace`), `-n` makes `n+1` screens give way. Counted from the current screen, in the provider's own screens, never in absolute depth — the same view sits at different heights depending on how the user arrived, and the provider does not know the path. The recoil always stops at the service root, which is what makes a relative recoil safe rather than a guess. Anything above `1` is refused.
- **A view returned by a form submission replaces that form by default (renderer)** — it used to stack, so a chain of forms left one dead screen per step and the back gesture walked the user through forms that had already done their work. A declared value still wins, so the next step of a wizard declares `entry: 'push'` and gets it.
- **`submit.confirmMessage` is now rendered as help text on QRScan (renderer behaviour, API unchanged)** — on a QRScan the tap on the submit button (with the scanned value in front of the user) already IS the confirmation, so a modal asked the same question twice. The message is now displayed next to the scanned value instead. The SDK API and the shared `SubmitAction` type are untouched.
- **Rejected scans stop the scanner (renderer behaviour, now specified)** — a value failing `validation` freezes the view on a failure panel showing `validation.errorMessage`, instead of looping the camera on a code it will keep refusing. The refused value is never echoed back. Providers should write `errorMessage` so it states the rule, since it is the only thing the user sees.
- `specs/qr-scan-view.md` documents the flag precedence (`submit` > `preview.enabled` > `autoSubmit`) and when a preview is worth enabling at all.
- Demo: the single `/api/qr/scan` route is split into `/api/qr/scan/auto` and `/api/qr/scan/preview` so both flows can be exercised independently.

### Removed
- **`confirm`, `cancel` and `canDismiss` on MessageView (breaking)** — replaced by `actions`, see below. `setDismissible` goes with them: it can no longer mean anything, and a provider is better told by a compile error than left believing it still works.
- **Empty header keys are no longer emitted** — every view initialised `intro` (and CardView `subtitle` / `description`) to `""` and sent it whether or not the provider had set one. The mobile renderer guarded several layouts on nullity alone, so the empty string was drawn: measured on ReaderView, the first body element sat at 135 px instead of 84 — a 51 px blank band under the title of every view nobody had written an intro for. An unset header text now emits no key at all, and a blank value is refused.
- **`preview.editable` on QRScanView (breaking)** — the preview is now read-only in every SDK and in the renderer. An editable preview let the user retype the value and post anything as if it had been scanned, which defeats the purpose of scanning. `enablePreview(editable, label)` becomes `enablePreview(label)` (JS) / `enable_preview(label)` (Python).

### Fixed
- **The Python SDK signed different bytes from the JS SDK (Python)** — `json.dumps` is not `JSON.stringify`, and a signature is over bytes. It escaped every non-ASCII character, so `Réservation confirmée` was signed as `R\u00e9servation confirm\u00e9e`; it wrote `1.0`, `1e-07`, `-0.0` and `1e+20` where JavaScript writes `1`, `1e-7`, `0` and `100000000000000000000`; and it kept a dict's insertion order where a JavaScript object puts integer-like keys first. A notification travels as a structured object, **not** as the string that was signed, so the Yeria backend re-derives that string with `JSON.stringify` before verifying it — which means every notification a Python provider sent with an accented word in its title or body was rejected as a bad signature. Views were spared only because their payload string travels with them. Two more followed from the same root: a JavaScript string is UTF-16 while a Python string is code points, so a hand-written surrogate pair (`chr(0xD83D) + chr(0xDE00)`) was one character for JavaScript and two for Python, and signing it raised `UnicodeEncodeError`; and a JavaScript number is a double, so an integer past 2^53 is printed as the nearest double or rounded outright — the SDK now folds valid surrogate pairs, keeps escaping lone ones, prints a large exactly-representable integer the way JavaScript does, and refuses one JavaScript would silently change. The Python SDK now emits the exact bytes `JSON.stringify` would, checked against Node over four thousand generated payloads, and the parity vector gained an accented notification and a view carrying `1.0` / `1e-7` / `1e21` / `-0.0` so that ASCII-only goldens can no longer hide it.
- **A URL field's value could carry `javascript:` (JS)** — `validateURL` was `new URL(...)` and nothing else, so `javascript:`, `data:`, `vbscript:` and `file:` all passed as valid values for a `url` field, which the renderer then puts in front of the user. The existing test asserted that as intended, on the grounds that `validateSubmissionURL` blocks those schemes — but that guards a submission TARGET, a different path with a second line of defence this one does not have. Both SDKs now accept `http` and `https` and refuse everything else, which is what Python already did, incidentally rather than by rule.
- **`inf` and `True` counted as numbers (Python)** — `validate_number` checked for NaN and stopped there. `float('inf')` passed, and `json.dumps` writes it `Infinity`, which JSON does not allow and no client can parse: a signed payload nothing could read back. `True` passed as well, `bool` being a subclass of `int`. The recording constraints (`max_duration`, `min_duration`, `max_size`) had the same hole. JS refused all of it already — for form fields. MapView had the hole on BOTH sides: `NaN` passes every range check, so a `NaN` latitude, zoom or radius reached the signed payload (`null` from JS, invalid `NaN` from Python), and Python took `True` for a latitude. Every number a map carries is now required finite — coordinates, altitude and precision, viewport, radii, style opacities and widths, layer zoom bounds, heatmap intensities — and a layer handed to `addLayer` / `add_layer` has its markers, shapes and points checked like the ones added one by one, which neither SDK did before. GeoJSON `data`, opaque to the SDK and copied whole, is walked whole: a non-finite number anywhere inside it is refused. And under all of that, `build()` on both sides walks the whole payload and refuses a non-finite number anywhere in it, naming the path — the net for every view and every key, including the ones set after the fact. Under that again, the signer itself serialises through one JSON that refuses a non-finite number — on JS after `toJSON` is applied, so the bytes checked are the bytes signed — which covers the static `signView`, `serveError` and notifications as well.
- **A stored media path is refused when it is absolute (both)** — `value` on a photo/file/audio/video field must be relative to the service base. The renderer enforces that by displaying NOTHING, which is the worst way for a provider to learn the rule; neither SDK said a word. Both now refuse `http(s)://`, `//host`, `file://` and `data:` when the view is built — and again when the value is set after the fact: `setFieldValue`, `updateField` and `injectData` (and their Python twins) used to bypass the check entirely, since nothing re-validated a late value — and once more when the view is built, which catches a value written straight onto the object `getField` hands back. A value cleared with `null` / `None` is a value removed, on both sides: the wire never carries a null. The rule is "no scheme and no network path" rather than a list of schemes, and a backslash counts as a slash: the web renderer resolves with WHATWG URL semantics, where `\\host/a.jpg` and `https:\\host` are absolute — and where a leading control byte or an embedded tab or newline is stripped before parsing, so a value carrying any control character is refused outright. A CDN is still reached by answering the relative URL with a redirect.
- **A slide written as a dict lost its `actions` and `meta` (Python)** — `add_slide` accepts a dict or a `CarouselSlide`, and the dict branch serialised on its own and stopped at `image`, so a dict caller's buttons and metadata never reached the payload. A dict is now lifted into the dataclass and takes the same road; as a side effect a missing `alt` is no longer written as `""`.
- **`nav.page` was lost when a view was rehydrated (Python)** — `from_json` rebuilt the navigation config from `next`, `prev` and `entry` and forgot `page`. Re-serving a rehydrated view dropped the pagination indicator in silence and no longer signed like the payload it came from.
- **A view could sign differently depending on how its parts were written (both)** — the same caller-order flaw fixed for form fields also reached `TimelineView.addItem`, `MediaView.addMediaItem`, `CarouselView.setSettings`, `CarouselView.addSlide` and the whole of MapView — `setViewport`, `setControls`, `setPickMode`, `addLayer`, `addMarker`, `addShape`, down to the geo points, actions, popups and styles nested inside them — each of which spread the caller's object into signed content. All now emit a fixed order, matching what Python's serializers already produced, and byte goldens hold the two SDKs in step for each part.
- **A shape's `action` never left the Python SDK** — `MapShape.action` was on the dataclass and in the spec, and `_shape_to_dict` skipped it: a tappable zone drawn from Python was silent on the map, where the same zone from JS worked. A popup action lost its `confirm` the same way. Both are emitted now, through the one action emitter the marker's own action already used.
- **`pattern` shipped as `{}` on every email field (JS)** — a `RegExp` has no JSON representation, so `JSON.stringify` rendered it as an empty object. The spec documents `pattern` as the expression's source text, which is what Python emitted and what JS now emits. Python had the mirror-image hole one step later: `add_field` converted a compiled pattern, `update_field` stored it as is, and `json.dumps` raised when the view was built. Both SDKs now convert at the one point every field passes through.
- **`create_media` produced an item `add_media_item` could not take (Python)** — the helper normalised its source into a plain dict, and `add_media_item` normalised every source again expecting a `MediaSource`, so the documented `create_media` + `add_media_item` pairing raised `AttributeError`. No test exercised the pairing. It now hands over a `MediaSource`, and a byte golden covers an item built through the helper.
- **A platform call could hang forever (JS)** — `getYeriaPublicKey` and `fetchUserDetails` had no timeout, so a platform that accepted the connection and then went quiet held a provider's request handler open indefinitely. `sendNotification` was already bounded; the other two now are too, and like it they honour the client's configured `notificationTimeout` / `notification_timeout` before falling back to five seconds — Python's two calls had ignored the configured value as well. A per-call `timeoutMs` / `timeout` wins over both. The signal itself is built by a helper that falls back to `AbortController` when `AbortSignal.timeout` is missing: it arrived in Node 17.3, and the SDK documents Node < 18 as supported when the caller injects `fetch` — bounding those two calls with it unconditionally would have thrown before the injected fetch ever ran, on exactly the runtimes that path exists for.
- **Token rejection messages differed between the SDKs (Python)** — `repr` wrapped the offending value in quotes where JS printed it plainly, and a missing value read `None` on one side and `undefined` on the other. Same words on both sides now: the message is a shared diagnostic, not Python prose.
- **A GPS field's `precision` never left the Python SDK** — `add_gps_field` accepted the argument and dropped it: `FormFieldParams` had no such attribute, so the flag vanished between the provider's call and the payload. The JS SDK emitted it, so the same GPS field signed differently in the two languages. `precision` is the legacy high-accuracy boolean, superseded by `maxAccuracy`; it is emitted again rather than retired, because retiring a documented key is a decision of its own.
- **A field's key order no longer depends on how the provider wrote it** — the SDKs built a field by spreading the caller's object, and JavaScript preserves a literal's insertion order, so `{multiple, source}` and `{source, multiple}` produced different JSON, therefore different signatures, for the same field. `updateField` / `update_field` had the matching flaw at the other end: a key the field did not already carry was appended, so a value set after the fact landed last where an upfront one comes first. Both SDKs now hold an explicit `FIELD_KEY_ORDER` and rebuild through it — one list per language, checked against each other by a test, since a key added to one and not the other would only surface as a signature mismatch. As a side effect the JS `FormFieldParams` type gains `altitude`, `maxAccuracy` and `precision`, which reached the payload only through the spread and were invisible to the type system.
- **Date bounds were dropped by every client (JS)** — `addDateField` converted `minDate` / `maxDate` into epoch milliseconds and emitted them as `min` / `max`. The spec declares `minDate` / `maxDate` in `YYYY-MM-DD` and the renderer types both as strings, so it read nothing: a form asking for a birth date accepted tomorrow, and a date range accepted anything. The JS SDK's own `minDate` / `maxDate` validation had been dead code for the same reason, and now fires. The Python SDK always emitted the documented shape, so the two SDKs were also signing the same form differently — the first of the parity blockers. Byte-exact field goldens (`fieldBytes` in the parity vector) now cover the four bound combinations, key order included, which the sorted structural goldens could not.
- **`textarea`, `phone` and `url` drew nothing (renderer)** — three documented SDK methods fell through the renderer's dispatch and rendered no field at all. The failure was silent and worse than a missing input: form validation only inspects widgets present in the tree, so a required field of those types was never validated and the form submitted incomplete, without a word to the user. For `phone` the cause was a vocabulary mismatch — the renderer knew `tel`, which the SDK never emits.
- **A textarea is a textarea because of its type (renderer)** — the multiline decision was guessed from label keywords ("biographie", "description détaillée" and their English forms), so a textarea labelled "Commentaire" got a single line while a text field labelled "Biography" got a paragraph box. Those keywords happened to match the demo form's own labels, which is why it looked correct there and nowhere else.
- **`setSecondaryAction` had no effect (renderer)** — the key travelled in the payload, and the client dropped it at four separate points. A provider writing `setSecondaryAction('OK')` read "Annuler" on screen.
- **The GPS accuracy no longer survives a manual edit (renderer)** — retyping a coordinate clears it, since it measured a point that is no longer the one on screen. Its presence now means the value came from the device rather than the keyboard.
- **The Plus Code capture button works (renderer)** — it used to open a dialog saying "TODO: integrate location service" and offer a hardcoded value. Open Location Code is arithmetic on the coordinates: no service, no key.
- **`disabled` and `readonly` now have an effect.** Both were already in the SDK types and the Zod schema, and both were dropped by the mobile converter — declared and silently lost. `readonly` is visible, unmodifiable and **submitted**; `disabled` is dimmed and **excluded** from the payload, as in HTML.
- **Unknown field types no longer render as text inputs (renderer).** The mobile fell back to a text field for anything it did not recognise, so every protocol addition surfaced on older builds as a stray input the user could fill and that was submitted. `separator` had been shipping that way. A build that does not understand an element now ignores it.
- **Audio and video capture constraints are honoured.** `maxDuration`, `minDuration`, `source`, `quality` and `maxSize` reached the app but not the widgets on one of the two conversion paths.

## [1.3.0] - 2026-07-24

### Added
- **Canonical Yeria link builders** (`YeriaLink`) — typed helpers to generate cross-service deeplinks: `service`, `component`, `chat`, `pin`, `subscribe`, plus `isValid`/`is_valid`. Exposed in both the JS and Python SDKs with byte-identical output frozen by shared golden vectors (`tests/fixtures/yeria_link_validation.json`).
- Card and Carousel views accept canonical Yeria links in their action targets.
- **FormView separators accept an optional label** — `addSeparator(fieldId?, label?)` / `add_separator(field_id, label)`. Empty by default; the mobile app will render the label once separator-label support lands.

### Changed
- **Standardized short deeplink routes** — canonical route table is now the single contract: `dl/s` (service), `dl/n` (subscribe), `dl/v?p=` (component), `dl/c` (chat), `dl/p` (pin), for both `yeria://` and `https://yeria.app`. Legacy `/service/{serviceId}/...` links are rejected, not aliased.
- `docs/deeplink-implementation.md` updated to the short-route table.

### Fixed
- `addSeparator()` / `add_separator()` no longer throw — the empty-label guard in `addField`/`add_field` now exempts separators (JS + Python). Previously any separator raised `MissingRequiredParameterError` before the downstream validator's separator exemption could run.

## [1.2.0] - 2026-07-06

### Added
- Two-symbol public surface, provider error contract, and GPS `maxAccuracy` field.

### Fixed
- JS/Python signing parity made byte-identical (compact JSON, null-link omission), frozen by a permanent parity test.

## [1.1.0] - 2026-06-21

### Added
- Complete Python SDK port with signing/verification parity to the JS SDK.

<!-- Legacy entries below use the pre-rename `jsonapp-js` version scheme (superseded by the 1.x `@numerum-tech/yeriasdk` line above). -->

## [3.0.0] - 2025-01-28

### BREAKING CHANGES
- **Removed DataView class** - DataView had unclear mobile screen representation and was not being used. Tables should be part of text content using ReaderView's `addTable(headers, rows)` method instead.

### Added
- **Intro field harmonization** - All view components now support a consistent `intro` field via `setIntro()` method:
  - FormView: Changed from `note` to `intro` (backward compatible via deprecated `setNote()`)
  - ActionListView: Added `intro` field and `setIntro()` method
  - ActionGridView: Added `intro` field and `setIntro()` method
  - MapView: Added `intro` field and `setIntro()` method
  - All other views already had intro support
- **FormView separator support** - Added `addSeparator()` method to visually group form fields
  - Separators are rendered as gaps or lines by mobile app renderers
  - Auto-generates unique field IDs when not provided
  - Excluded from "at least one field" validation
- **Enhanced FormView methods**:
  - `getFieldCount(excludeSeparators?)` - Optionally exclude separators from count
- **Complete Python SDK** - Full Python port with 100% API parity:
  - All 12 view types implemented
  - Ed25519 signing and verification
  - Complete validation system
  - Full error handling

### Changed
- **FormView**: `setNote()` is now deprecated in favor of `setIntro()` (still works for backward compatibility)
- **ActionListView/ActionGridView**: Constructor parameter renamed from `view_title` to `title` for consistency

### Removed
- DataView class and all related functionality
- DataViewContent interface from types
- YeriaApp.createDataView() factory method
- 'DataView' from ViewType union
- All DataView demo examples from demo-app

### Fixed
- **Python SDK**: Fixed all API parity issues identified in accuracy assessment
- **Python SDK**: Fixed version number consistency (now 3.0.0)
- **Validation**: Separator fields now properly excluded from form validation
- **FieldValidator**: Separator fields allowed to have empty labels

### Rationale
DataView served no clear purpose as a standalone mobile screen. Tabular data is better suited as part of text content within ReaderView, which already provides full table support via the `addTable()` method.

---

## [1.0.0] - 2025-09-02

### Added
- Initial release of JSON-driven UI SDK
- Core view types: FormView, DataView, ActionListView, ActionGridView
- Message and Reader views for content display
- QR code generation and scanning views
- Comprehensive validation system
- Ed25519 signature support for security
- TypeScript definitions with full type safety
- Builder pattern for easy view construction
- Example implementations
- Test suite with Jest

### Security
- Ed25519 cryptographic signatures for provider verification
- Secure form handling with validation
- Input sanitization and validation rules

### Documentation
- Complete README with usage examples
- TypeScript type definitions
- Example scripts for all view types