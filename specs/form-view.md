# FormView Component Specification

## Description

The `FormView` component is used to create dynamic forms with various field types, validation rules, and submission actions. It supports a wide range of input types including text, email, password, number, date, select, file uploads, voice and video recording, GPS coordinates, and more.

Forms submit to the exact service URL whose response returned the form. That URL
is retained by the client, validated to remain inside the service's declared
base URL area, and is not configurable in the form payload. `content.submit`
controls only the button presentation and HTTP method.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the form view |
| `type` | `string` | Yes | Always `"Form"` |
| `content` | `FormContent` | Yes | Form content object |
| `content.title` | `string` | Yes | Form title displayed to the user |
| `content.intro` | `string` | No | Optional introduction/instructions shown above fields |
| `content.note` | `string` | No | Small print under the intro — a caveat, a legal mention, a count. Rendered smaller and dimmed |
| `content.submit` | `SubmitAction` | No | Submit button and HTTP method configuration; it cannot override the destination URL |
| `content.submit.text` | `string` | Yes* | Button text (required if submit is set) |
| `content.submit.method` | `HttpMethod` | No | HTTP method (default: `"POST"`) |
| `content.submit.confirmMessage` | `string` | No | Optional confirmation dialog message |
| `content.secondary` | `SecondaryAction` | No | Second action, rendered under the submit button in the same footer bar, at secondary weight |
| `content.secondary.text` | `string` | Yes* | Button label (required if secondary is set) |
| `content.secondary.url` | `string` | Yes* | Where the action goes (required if secondary is set) |
| `content.secondary.mode` | `"navigate" \| "submit"` | No | `navigate` (default) calls the URL and renders what comes back — **entered values are discarded**. `submit` sends the current values to that URL |
| `content.secondary.method` | `HttpMethod` | No | `submit` mode only (default: `"POST"`) |
| `content.secondary.validate` | `boolean` | No | Whether the form must be valid first. Defaults to `false` in `navigate` mode, `true` in `submit` mode |
| `content.secondary.confirmMessage` | `string` | No | Optional confirmation dialog message |
| `content.fields` | `FormField[]` | Yes | Array of form fields (at least one input field required) |
| `content.fields[].fieldType` | `string` | Yes | Field type: `"text"`, `"email"`, `"password"`, `"number"`, `"date"`, `"select"`, `"photo"`, `"file"`, `"audio"`, `"video"`, `"gps"`, `"pluscode"`, `"hidden"`, `"textarea"`, `"phone"`, `"url"`, `"checkbox"`, `"separator"`, `"paragraph"`, `"spacer"` |
| `content.fields[].fieldId` | `string` | Yes | Unique identifier for the field |
| `content.fields[].fieldLabel` | `string` | Yes | Display label for the field |
| `content.fields[].value` | `unknown` | No | Default/pre-filled value. On a media field (`photo`, `file`, `audio`, `video`) this is the **relative path** of a file the provider already holds — an array when `multiple` is set. See *Serving stored media* below |
| `content.fields[].size` | `"xl" \| "lg" \| "md" \| "sm"` | No | `paragraph`: text size, 24 / 18 / 14 / 12 px. Default `"md"` |
| `content.fields[].size` | `"sm" \| "md" \| "lg"` | No | `spacer`: how much blank space. Default `"md"` |
| `content.fields[].bold` | `boolean` | No | `paragraph` only |
| `content.fields[].italic` | `boolean` | No | `paragraph` only |
| `content.fields[].required` | `boolean` | No | Whether the field is required |
| `content.fields[].placeholder` | `string` | No | Placeholder text |
| `content.fields[].helpText` | `string` | No | Help text shown below the field |
| `content.fields[].disabled` | `boolean` | No | Whether the field is disabled |
| `content.fields[].readonly` | `boolean` | No | Whether the field is read-only |
| `content.fields[].min` | `number` | No | Minimum value (for number/date fields) |
| `content.fields[].max` | `number` | No | Maximum value (for number/date fields) |
| `content.fields[].minLength` | `number` | No | Minimum string length |
| `content.fields[].maxLength` | `number` | No | Maximum string length |
| `content.fields[].pattern` | `RegExp` | No | Validation regex pattern |
| `content.fields[].options` | `Array<{label: string, value: unknown, selected?: boolean}>` | No | Options for select/radio/checkbox fields |
| `content.fields[].accept` | `string[]` | No | Accepted file types (MIME types) |
| `content.fields[].live` | `boolean` | No | Enable live updates (for GPS/photo fields) |
| `content.fields[].minDate` | `string` | No | Minimum date (YYYY-MM-DD format) |
| `content.fields[].maxDate` | `string` | No | Maximum date (YYYY-MM-DD format) |
| `content.fields[].multiple` | `boolean` | No | photo/file/audio/video: accept more than one item |
| `content.fields[].maxCount` | `number` | No | Upper bound when `multiple` is true |
| `content.fields[].maxDuration` | `number` | No* | audio/video: maximum recording length in seconds. **Required for `video`** |
| `content.fields[].minDuration` | `number` | No | audio/video: minimum recording length in seconds |
| `content.fields[].source` | `string` | No | photo/audio/video: `"record"`, `"library"` or `"both"` (default) |
| `content.fields[].quality` | `string` | No | video only: `"low"`, `"medium"` (default) or `"high"` |
| `content.fields[].maxSize` | `number` | No | audio/video: maximum accepted file size in bytes |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro: string)` | `intro` - Introduction text | `this` | Sets the introduction text displayed above form fields |
| `setNote(note: string)` | `note` - Note text | `this` | Small print under the intro. Rendered smaller and dimmed — a caveat, a legal mention, a count. Distinct from `setIntro()`, not a replacement for it |
| `addParagraph(text, options?)` | `text` - Text to display<br>`options` - `{size, bold, italic}` | `this` | Adds displayed text among the fields. Not an input: no value, never submitted, skipped by validation |
| `secondaryButton(text, url, options?)` | `text` - Button label<br>`url` - Destination<br>`options` - `{mode, method, validate, confirmMessage}` | `this` | Adds a second action under the submit button |
| `belongsToProcess(processId, options?)` | `processId` - Process ID<br>`options` - Process options (processName, currentStep, totalSteps, stepName, canGoBack, canSkip) | `this` | Associates form with a multi-step process workflow |
| `addField(fieldType, fieldId, fieldLabel, params?)` | `fieldType` - Field type<br>`fieldId` - Unique field ID<br>`fieldLabel` - Display label<br>`params` - Field parameters | `this` | Adds a field with validation |
| `submitButton(text, method?, confirmMessage?)` | `text` - Button text<br>`method` - HTTP method (default: POST)<br>`confirmMessage` - Optional confirmation | `this` | Defines the submit button |
| `updateButton(text, confirmMessage?)` | `text` - Button text<br>`confirmMessage` - Optional confirmation | `this` | Convenience method for PUT operations |
| `deleteButton(text, confirmMessage?)` | `text` - Button text<br>`confirmMessage` - Confirmation message | `this` | Convenience method for DELETE operations |
| `addTextField(fieldId, fieldLabel, isRequired?, maxLength?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`maxLength` - Max length | `this` | Adds a text input field |
| `addEmailField(fieldId, fieldLabel, isRequired?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag | `this` | Adds an email input field |
| `addPasswordField(fieldId, fieldLabel, minLength?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`minLength` - Minimum length (default: 8) | `this` | Adds a password field |
| `addNumberField(fieldId, fieldLabel, isRequired?, minVal?, maxVal?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`minVal` - Minimum value<br>`maxVal` - Maximum value | `this` | Adds a number input field |
| `addDateField(fieldId, fieldLabel, isRequired?, minDate?, maxDate?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`minDate` - Min date (YYYY-MM-DD)<br>`maxDate` - Max date (YYYY-MM-DD) | `this` | Adds a date input field |
| `addSelectField(fieldId, fieldLabel, isRequired?, options, display?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`options` - Array of {label, value}<br>`display` - `'dropdown'` (default) or `'radio'` | `this` | One choice among several. `display` is a presentation preference, not a different field: `radio` lays every option flat in the form, `dropdown` opens a selection sheet. A client that does not know the key falls back to the sheet |
| `addPhotoField(fieldId, fieldLabel, isRequired?, formats?, live?, options?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`formats` - Accepted formats (default: ['jpeg', 'png'])<br>`live` - Live updates<br>`options` - `{multiple, maxCount, source}` | `this` | Adds a photo upload field |
| `addFileField(fieldId, fieldLabel, isRequired?, formats, options?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`formats` - MIME types array<br>`options` - `{multiple, maxCount}` | `this` | Adds a file upload field |
| `addAudioField(fieldId, fieldLabel, isRequired?, options?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`options` - `{maxDuration, minDuration, source, multiple, maxCount, maxSize, formats}` | `this` | Adds a voice-recording field |
| `addVideoField(fieldId, fieldLabel, isRequired?, options)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`options` - `{maxDuration (required), minDuration, quality, source, multiple, maxCount, maxSize, formats}` | `this` | Adds a video-recording field |
| `addGPSField(fieldId, fieldLabel, isRequired?, liveData?, config?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`liveData` - Live updates<br>`config` - GPS config (altitude, precision) | `this` | Adds a GPS location field |
| `addPlusCodeField(fieldId, fieldLabel, isRequired?, liveData?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`liveData` - Live updates | `this` | Adds a Plus Code field |
| `addHiddenField(fieldId, fieldLabel, value)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`value` - Field value | `this` | Adds a hidden field |
| `addTextAreaField(fieldId, fieldLabel, isRequired?, minLength?, maxLength?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag<br>`minLength` - Min length<br>`maxLength` - Max length | `this` | Adds a textarea field |
| `addPhoneField(fieldId, fieldLabel, isRequired?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag | `this` | Adds a phone number field |
| `addURLField(fieldId, fieldLabel, isRequired?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag | `this` | Adds a URL field |
| `addCheckboxField(fieldId, fieldLabel, isRequired?)` | `fieldId` - Field ID<br>`fieldLabel` - Label<br>`isRequired` - Required flag | `this` | Adds a checkbox field |
| `addSpacer(size?)` | `size` - `'sm'`, `'md'` (default) or `'lg'` | `this` | Adds blank vertical space between fields — nothing is drawn |
| `addSeparator(fieldId?)` | `fieldId` - Optional field ID (auto-generated if not provided) | `this` | Adds a visual separator to group form fields (rendered as gap or line) |
| `injectData(data)` | `data` - Object with fieldId-value pairs | `Result<void, string[]>` | Injects data into existing fields (handles select options automatically) |
| `setFieldValue(fieldId, value)` | `fieldId` - Field ID<br>`value` - Value to set | `this` | Sets the value of a specific field |
| `validateFormData(formData)` | `formData` - Form data object | `ValidationResult` | Validates form data against field validations |
| `getField(fieldId)` | `fieldId` - Field ID | `FormField \| undefined` | Gets a field by ID |
| `removeField(fieldId)` | `fieldId` - Field ID | `Result<void, string>` | Removes a field by ID |
| `updateField(fieldId, updates)` | `fieldId` - Field ID<br>`updates` - Partial field updates | `Result<void, string>` | Updates an existing field |
| `getFields()` | - | `FormField[]` | Gets all fields |
| `getFieldCount(excludeSeparators?)` | `excludeSeparators` - Exclude separator fields (default: false) | `number` | Gets the number of fields (optionally excluding separators) |
| `hasRequiredFields()` | - | `boolean` | Checks if form has required fields |
| `getRequiredFields()` | - | `string[]` | Gets array of required field IDs |
| `serve()` | - | `Record<string, unknown>` | Serves the view with validation (inherited from BaseView) |
| `toJSON()` | - | `Record<string, unknown>` | Returns JSON representation (inherited from BaseView) |
| `setState(key, value)` | `key` - State key<br>`value` - State value | `void` | Sets view state (inherited from BaseView) |
| `getState(key)` | `key` - State key | `unknown` | Gets view state (inherited from BaseView) |
| `setNext(url)` | `url` - URL or path of the next view | `this` | Forward control of a paginated sequence, drawn by the client — see the Navigation reference on the docs site |
| `setPrev(url)` | `url` - URL or path of the previous view | `this` | Backward control of the same sequence. NOT where the back gesture leads — see the Navigation reference on the docs site |
| `setEntry(entry)` | `entry` - `'push'`, `'replace'`, or an integer <= 1 | `this` | How this view enters the client's navigation stack (default: `push`) — see the Navigation reference on the docs site |
| `setPage(current, total?)` | `current` - 1-based position<br>`total` - sequence length, when known | `this` | Where this view sits in its sequence; the client draws the indicator — see the Navigation reference on the docs site |
| `setProcess(processId, context?)` | `processId` - Process ID<br>`context` - Process context | `this` | Sets process context (inherited from BaseView) |

## JavaScript Sample Code

### Basic Form

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const form = yeriaApp
    .createFormView('user-registration', 'User Registration')
    .setIntro('Please fill in all required fields')
    .addTextField('firstName', 'First Name', true, 50)
    .addTextField('lastName', 'Last Name', true, 50)
    .addEmailField('email', 'Email Address', true)
    .addPhoneField('phone', 'Phone Number', false)
    .submitButton('Create Account', 'POST');

const response = yeriaApp.serve(form);
```

### Form with Select Field

```javascript
const form = yeriaApp
    .createFormView('survey', 'Customer Survey')
    .addSelectField('country', 'Country', true, [
        { label: 'France', value: 'FR' },
        { label: 'Canada', value: 'CA' },
        { label: 'Belgium', value: 'BE' }
    ])
    .addSelectField('rating', 'Rating', true, [
        { label: 'Excellent', value: 5 },
        { label: 'Good', value: 4 },
        { label: 'Average', value: 3 },
        { label: 'Poor', value: 2 },
        { label: 'Very Poor', value: 1 }
    ])
    .submitButton('Submit Survey', 'POST');
```

### Form with File Upload

```javascript
const form = yeriaApp
    .createFormView('document-upload', 'Upload Document')
    .addFileField('document', 'Document', true, [
        'application/pdf',
        'image/jpeg',
        'image/png'
    ])
    .addPhotoField('photo', 'Profile Photo', false, ['jpeg', 'png'], true)
    .submitButton('Upload', 'POST');
```

### Form with Voice and Video Recording

```javascript
const form = yeriaApp
    .createFormView('incident-report', 'Report an Incident')
    .addTextField('summary', 'What happened', true, 200)
    .addAudioField('statement', 'Spoken statement', false, {
        maxDuration: 120,      // seconds
        minDuration: 2,        // rejects an accidental tap-and-release
        source: 'record'       // microphone only — no picking an old file
    })
    .addVideoField('evidence', 'Video evidence', false, {
        maxDuration: 30,       // REQUIRED — this is what bounds the upload size
        quality: 'low',        // ~480p; ~7 MB per minute
        source: 'both',        // record now, or pick from the gallery
        maxSize: 15 * 1024 * 1024
    })
    .submitButton('Send report', 'POST');
```

#### How the recording reaches the provider

There is no separate upload endpoint. The captured file rides the **normal form
submission**: the client sends `multipart/form-data` to the same validated
service URL that returned the form, with the recording as a file part named
after its `fieldId` (`fieldId_0`, `fieldId_1`, … when `multiple` is set), and
every other field as a regular form part.

Sizing is the provider's responsibility. `maxDuration` × `quality` is what
bounds the payload:

| `quality` | Approx. resolution / bitrate | Per minute |
|-----------|------------------------------|-----------|
| `low` | 480p / ~1 Mbps | ~7 MB |
| `medium` (default) | 720p / ~2.5 Mbps | ~19 MB |
| `high` | 1080p / ~4 Mbps | ~30 MB |

Audio is far smaller — voice at the renderer's default encoding runs roughly
0.5 MB per minute. Figures are typical mobile-encoder output, not a guarantee:
set the service's request body limit above what the declared constraints imply,
with headroom. Use `maxSize` to make the client refuse an oversized file before
it starts uploading, rather than failing mid-request.

`maxDuration` is mandatory on `video` — building the view throws without it.

#### What a capture actually produces

`accept` declares what the field will *take*. What the renderer *captures* is
narrower, and a provider that stores or re-serves the file should plan for it:

| | Captured as |
|---|---|
| `audio` | AAC, mono, ~64 kbps, in an MP4 container (`.m4a`) |
| `video` | H.264 in an MP4 container (`.mp4`), at the `quality` resolution |
| orientation | Whichever way the phone was held. Portrait and landscape are both possible |

**Video orientation travels as MP4 rotation metadata, not as rotated pixels.**
The stored frames are in sensor orientation and the container carries the
rotation to apply; that is how every phone camera writes video. A player that
honours the metadata shows it upright, and one that ignores it shows it on its
side. If the service re-encodes, thumbnails, or streams the clip, it has to
carry that rotation through — dropping it is the usual reason a clip that
looked right on the phone appears sideways afterwards.

A file chosen from the library instead of recorded can be anything `accept`
allows — any orientation, any duration.

#### Validate everything again on the server

The renderer enforces `maxDuration` by stopping the recorder, and refuses a
capture that violates `minDuration` or `maxSize`. None of that is a guarantee:

- `minDuration` is checked only against a **recorded** take. A file picked from
  the library has no measured duration, so the rule is skipped rather than
  enforced on no evidence.
- Every constraint lives in a payload the client could ignore.

Treat the declared constraints as the contract you asked for, and re-check
duration, size and type on arrival.

### Form with GPS Field

```javascript
const form = yeriaApp
    .createFormView('location-form', 'Record Location')
    .addGPSField('location', 'Your Location', true, true, {
        altitude: true,
        precision: true
    })
    .addPlusCodeField('pluscode', 'Plus Code', false, true)
    .submitButton('Save Location', 'POST');
```

### Form with Date Field

```javascript
const form = yeriaApp
    .createFormView('appointment', 'Schedule Appointment')
    .addDateField('appointmentDate', 'Appointment Date', true, '2025-01-01', '2025-12-31')
    .addTextField('notes', 'Additional Notes', false)
    .submitButton('Book Appointment', 'POST');
```

### Form with Pre-filled Data

```javascript
const form = yeriaApp
    .createFormView('edit-profile', 'Edit Profile')
    .addTextField('name', 'Full Name', true)
    .addEmailField('email', 'Email', true)
    .addSelectField('country', 'Country', false, [
        { label: 'France', value: 'FR' },
        { label: 'Canada', value: 'CA' }
    ]);

// Inject pre-filled data
form.injectData({
    name: 'John Doe',
    email: 'john@example.com',
    country: 'FR'  // Automatically selects the option with value 'FR'
});

form.submitButton('Update Profile', 'PUT');
```

### Form with Validation

```javascript
const form = yeriaApp
    .createFormView('registration', 'Register')
    .addPasswordField('password', 'Password', true, 8)
    .addTextField('username', 'Username', true)
    .addField('text', 'username', 'Username', {
        required: true,
        minLength: 3,
        maxLength: 20,
        pattern: /^[a-zA-Z0-9_]+$/
    })
    .submitButton('Register', 'POST');
```

### Form with Separators

```javascript
const form = yeriaApp
    .createFormView('registration', 'User Registration')
    .addTextField('firstName', 'First Name', true)
    .addTextField('lastName', 'Last Name', true)
    .addSeparator()  // Visual separator between sections
    .addEmailField('email', 'Email', true)
    .addPhoneField('phone', 'Phone', false)
    .addSeparator('billing-separator')  // With explicit ID
    .addTextField('address', 'Address', true)
    .addTextField('city', 'City', true)
    .submitButton('Register', 'POST');
```

**Note:** Separators are visual elements only and don't collect data. They are excluded from "at least one field" validation, so a form must have at least one non-separator field.

### Spacers

A separator draws a rule and says "a new group starts here". A spacer draws
nothing and simply lets a group breathe:

```javascript
form.addTextField('street', 'Street')
    .addSpacer('sm')
    .addTextField('city', 'City')
    .addSpacer('lg')
    .addTextField('comment', 'Anything to add?');
```

Three steps only — `sm`, `md` (default), `lg` — and no number: you ask for a
gap, the client decides what it measures. A size outside them is refused when
you build the view, not silently normalised.

Like separators, spacers carry no value, are skipped by validation, never reach
the submission, and do not count towards "at least one field".

### Displayed Text Between Fields

`addParagraph` puts text among the fields — a heading, an instruction, or the
data the user has to read in order to answer. It is not an input: it holds no
value, is never submitted, and validation skips it.

The four sizes are **sizes, not roles**. Nothing here says a block is a
heading; what a size means is the provider's call. Bold and italic are separate,
explicit choices.

```javascript
form
  .addParagraph('Pieces to provide', { size: 'xl' })
  .addParagraph('A valid ID and a proof of address, both less than three months old.')
  .addParagraph('Scans are accepted; photographs must be legible.', { size: 'sm', italic: true })
  .addSeparator()
  .addTextField('id_number', 'ID number', true);
```

| size | rendering |
|------|-----------|
| `xl` | 24 px |
| `lg` | 18 px |
| `md` | 14 px — default |
| `sm` | 12 px |

### A Second Action

A form has one submit. `secondaryButton` adds a second action under it, in the
same footer bar and at secondary weight — Skip, Cancel, Save as draft.

`mode` says what happens to what the user typed, and it is explicit on purpose:

```javascript
// 'navigate' — calls the URL and renders what comes back.
// What the user typed is DISCARDED. This is Skip / Cancel.
form.secondaryButton('Skip', 'items/42/skip');

// 'submit' — sends the current values to a SECOND destination.
form.secondaryButton('Save as draft', 'drafts', {
  mode: 'submit',
  method: 'PUT',
  confirmMessage: 'Save and come back later?'
});
```

`validate` decides whether the form must be valid first. It defaults to `false`
in `navigate` mode — a Skip blocked by an empty required field would be
absurd — and to `true` in `submit` mode.

### Read-only and Disabled Fields

Both are field states, and they are not interchangeable:

| | Editable | Visible | Submitted |
|---|---|---|---|
| `readonly` | no | yes, at full legibility | **yes** |
| `disabled` | no | yes, dimmed | **no** |

```javascript
form
  // Fixed by the provider, and part of what the server receives back.
  .addField('text', 'campaign', 'Campaign', { value: 'Adele-2026', readonly: true })
  // Shown for context, deliberately left out of the payload.
  .addField('text', 'quota', 'Remaining quota', { value: '12', disabled: true });
```

### Serving Stored Media

A media field can show a file the provider **already holds** instead of asking
for a new capture. Set `value` to the file's path and `readonly` to `true`: the
player works, the add and delete controls disappear.

```javascript
form
  .addAudioField('previous_take', 'Your previous take', false, {
    value: 'api/media/take-42.m4a',
    readonly: true
  })
  .addPhotoField('documents', 'Documents on file', false, ['jpeg'], false, {
    multiple: true,
    value: ['api/media/id-front.jpg', 'api/media/id-back.jpg'],
    readonly: true
  });
```

**The path must be relative to your service base.** This is the platform's
asset policy, not a convention: `http(s)://`, `//host`, `file://` and `data:`
are refused by the renderer and nothing is displayed. To serve from a CDN,
answer the relative URL with a redirect — the player follows the 3xx to your
signed URL transparently.

### Form in Process Workflow

```javascript
const form = yeriaApp
    .createFormView('step-1', 'Personal Information')
    .belongsToProcess('onboarding', {
        processName: 'User Onboarding',
        currentStep: 1,
        totalSteps: 3,
        stepName: 'Personal Info',
        canGoBack: false,
        canSkip: false
    })
    .addTextField('firstName', 'First Name', true)
    .addTextField('lastName', 'Last Name', true)
    .submitButton('Next', 'POST');
```

## Complete JSON Example

```json
{
  "id": "user-registration",
  "type": "Form",
  "content": {
    "title": "User Registration",
    "intro": "Please fill in your information to create an account",
    "submit": {
      "text": "Register",
      "method": "POST",
      "confirmMessage": "Are you sure you want to submit?"
    },
    "fields": [
      {
        "fieldType": "text",
        "fieldId": "firstName",
        "fieldLabel": "First Name",
        "required": true,
        "placeholder": "Enter your first name",
        "maxLength": 50,
        "helpText": "Your legal first name"
      },
      {
        "fieldType": "text",
        "fieldId": "lastName",
        "fieldLabel": "Last Name",
        "required": true,
        "placeholder": "Enter your last name",
        "maxLength": 50
      },
      {
        "fieldType": "separator",
        "fieldId": "separator-1234567890-1234",
        "fieldLabel": ""
      },
      {
        "fieldType": "email",
        "fieldId": "email",
        "fieldLabel": "Email Address",
        "required": true,
        "placeholder": "you@example.com",
        "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
      },
      {
        "fieldType": "phone",
        "fieldId": "phone",
        "fieldLabel": "Phone Number",
        "required": false,
        "placeholder": "+1234567890"
      },
      {
        "fieldType": "select",
        "fieldId": "country",
        "fieldLabel": "Country",
        "required": true,
        "options": [
          {
            "label": "France",
            "value": "FR",
            "selected": false
          },
          {
            "label": "United States",
            "value": "US",
            "selected": true
          },
          {
            "label": "Canada",
            "value": "CA",
            "selected": false
          }
        ]
      },
      {
        "fieldType": "date",
        "fieldId": "birthDate",
        "fieldLabel": "Date of Birth",
        "required": true,
        "minDate": "1900-01-01",
        "maxDate": "2010-12-31"
      },
      {
        "fieldType": "number",
        "fieldId": "age",
        "fieldLabel": "Age",
        "required": false,
        "min": 18,
        "max": 120,
        "value": 25
      },
      {
        "fieldType": "audio",
        "fieldId": "statement",
        "fieldLabel": "Spoken statement",
        "required": false,
        "accept": ["audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"],
        "maxDuration": 120,
        "minDuration": 2,
        "source": "record"
      },
      {
        "fieldType": "video",
        "fieldId": "evidence",
        "fieldLabel": "Video evidence",
        "required": false,
        "accept": ["video/mp4", "video/quicktime", "video/webm"],
        "maxDuration": 30,
        "quality": "low",
        "source": "both",
        "maxSize": 15728640
      }
    ]
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```
