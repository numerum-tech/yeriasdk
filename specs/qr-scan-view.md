# QRScanView Component Specification

## Description

The `QRScanView` component provides a QR code scanner interface. The mobile app handles all scanner implementation (camera, torch, focus, formats, UI), while the view only describes what to scan and where to submit.

**Key Design Principles:**
- Mobile app handles ALL scanner implementation
- View only describes what to scan and where to submit
- Field name is ALWAYS "qrData" (not configurable)
- Auto-submit by default: scan → immediately POST `{ qrData: "scanned-value" }`
- Submit button disables auto-submit for manual confirmation workflows
- The preview is **read-only**: a value the user could retype would let anything be posted as if it had been scanned

**Submission Convention:**
- Auto-submit: POST `{service.baseUrl}/{viewId}` with `{ qrData: "scanned-value" }`
- With button: User scans, previews (if enabled), clicks button to submit

**Client behaviour contract**

The renderer resolves the three flags in this order — the first one that applies wins:

1. `submit` is set → a button is shown, auto-submission is off (the SDK also forces `autoSubmit: false`)
2. `preview.enabled` is true → the scanned value is echoed and submission waits for the tap
3. otherwise `autoSubmit` (default true) → a valid scan is posted immediately

**Rejected scans:** when a scanned value fails `validation`, the client **stops the scanner** and shows a failure panel carrying `validation.errorMessage`. It does not silently keep scanning — a code that fails the rules would fail them again on every frame — and it never echoes the refused value back to the user. Two consequences for the provider:

- Write `errorMessage` so it states the rule ("must start with PROD- followed by 6 to 12 digits"), not just "invalid code": it is the only thing the user sees.
- The user's only way forward is to scan again or leave the view.

**Confirmation message.** `submit.confirmMessage` is rendered as **help text on the scan result screen**, next to the scanned value — not as a modal dialog. On a QRScan the tap on the submit button (with the value in front of the user) already IS the confirmation step, so a dialog would ask the same question twice. Use it for what the user should check before tapping ("compare the reference with the one printed on the label"). The field keeps its name for consistency with `SubmitAction` across views; only its QRScan rendering differs.

**When to enable the preview.** It echoes the raw scanned value, so it is only useful when that value means something to the user: a ticket reference, an invoice number printed next to the code, or a batch of codes physically close enough that the camera may read the wrong one. For opaque payloads (signed blobs, UUIDs, URLs), leave it off and auto-submit — then return a view describing what the code resolved to, and let the user confirm meaning rather than a string. Displaying an opaque or sensitive payload is a shoulder-surfing risk with no upside.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the QR scan view |
| `type` | `string` | Yes | Always `"QRScan"` |
| `content` | `QRScanContent` | Yes | QR scan content object |
| `content.title` | `string` | Yes | View title displayed to the user |
| `content.intro` | `string` | No | Instructional text (e.g., "Point camera at the QR code") |
| `content.autoSubmit` | `boolean` | No | Auto-submit after scan (default: true) |
| `content.submit` | `QRScanSubmitAction` | No | Submit button configuration (disables autoSubmit when set) |
| `content.submit.text` | `string` | Yes* | Button text (required if submit is set) |
| `content.submit.method` | `HttpMethod` | No | HTTP method (always POST for QRScan) |
| `content.submit.confirmMessage` | `string` | No | Rendered as **help text next to the scanned value**, not as a dialog — see "Confirmation message" below |
| `content.validation` | `object` | No | Validation rules for scanned data |
| `content.validation.format` | `string` | No | Data format: `"text"`, `"number"`, `"url"`, `"email"` |
| `content.validation.startsWith` | `string` | No | Required prefix (exempt from format validation) |
| `content.validation.minLength` | `number` | No | Minimum length (includes prefix if startsWith is set) |
| `content.validation.maxLength` | `number` | No | Maximum length (includes prefix if startsWith is set) |
| `content.validation.errorMessage` | `string` | Yes* | Error message shown on validation failure (required if validation is set) |
| `content.preview` | `object` | No | Preview configuration before submission |
| `content.preview.enabled` | `boolean` | No | Echo the scanned value, read-only, before submission (default: false) |
| `content.preview.label` | `string` | No | Field label in preview (default: "Scanned Code") |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

**Note:** Server MUST re-validate scanned data for security, even if client-side validation is performed. The client-side rules are a UX affordance — they save a round trip, they guarantee nothing.

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Instructional text | `this` | Sets instructional text shown to the user |
| `submitButton(text, confirmMessage?)` | `text` - Button text<br>`confirmMessage` - Optional message shown as help text with the scanned value | `this` | Configures submit button (disables autoSubmit) |
| `setValidation(errorMessage, format?, minLength?, maxLength?, startsWith?)` | `errorMessage` - Error message<br>`format` - Data format ('text', 'number', 'url', 'email')<br>`minLength` - Minimum length<br>`maxLength` - Maximum length<br>`startsWith` - Required prefix | `this` | Sets validation rules for scanned data |
| `enablePreview(label?)` | `label` - Field label (default: "Scanned Code") | `this` | Echoes the scanned value read-only before submission |
| `disablePreview()` | - | `this` | Disables preview mode |
| `setAutoSubmit(enabled?)` | `enabled` - Enable flag (default: true) | `this` | Explicitly enables or disables auto-submit |
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

### Simple Auto-Submit QR Scan

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const qrScan = yeriaApp
    .createQRScanView('scan-ticket', 'Scan Your Ticket')
    .setIntro('Point camera at the QR code on your ticket');
// → Scans, immediately POSTs { qrData: "ABC123" } to {baseUrl}/scan-ticket

const response = yeriaApp.serve(qrScan);
```

### QR Scan with Manual Confirmation

```javascript
const qrScan = yeriaApp
    .createQRScanView('verify-product', 'Verify Product')
    .setIntro('Scan the product barcode')
    .enablePreview('Product Code')
    .submitButton('Verify Product');
// → Scans, shows the code read-only, user clicks "Verify Product" to submit
```

### QR Scan with Validation

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-invoice', 'Scan Invoice')
    .setIntro('Scan the invoice QR code')
    .setValidation(
        'Invalid invoice format',
        'number',      // Format: digits only
        10,            // minLength
        15,            // maxLength
        'INV-'         // startsWith prefix
    )
    .submitButton('Process Invoice');
// → Accepts: "INV-123456" (10-15 chars total, digits after INV-)
```

### QR Scan with Numeric Code Validation

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-code', 'Scan Code')
    .setIntro('Scan the 6-digit code')
    .setValidation(
        'Code must be 6 digits',
        'number',  // Format: digits only
        6,         // minLength
        6          // maxLength
    );
// → Accepts: "123456", "000001"
```

### QR Scan with Email Format Validation

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-email', 'Scan Email QR')
    .setIntro('Scan the email QR code')
    .setValidation(
        'Invalid email format',
        'email'  // Simple check: has @ and .
    )
    .submitButton('Submit Email');
// → Accepts: "user@example.com"
```

### QR Scan with URL Format Validation

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-url', 'Scan URL')
    .setIntro('Scan the URL QR code')
    .setValidation(
        'Invalid URL',
        'url'  // Starts with http:// or https://
    )
    .submitButton('Open URL');
// → Accepts: "https://example.com"
```

### QR Scan with Prefix Validation

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-ticket', 'Scan Ticket')
    .setIntro('Scan your ticket QR code')
    .setValidation(
        'Must start with TICKET-',
        undefined,      // No format restriction
        undefined,      // No minLength
        undefined,      // No maxLength
        'TICKET-'       // Required prefix
    )
    .submitButton('Confirm Ticket');
// → Accepts: "TICKET-ABC123", "TICKET-XYZ"
```

### QR Scan with Length Range Validation

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-code', 'Scan Code')
    .setIntro('Scan the code')
    .setValidation(
        'Code must be 8-20 characters',
        undefined,  // No format restriction
        8,          // minLength
        20          // maxLength
    )
    .submitButton('Submit Code');
```

### QR Scan with Preview and a Confirmation Message

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-confirm', 'Scan Code')
    .setIntro('Scan the code on the parcel')
    .enablePreview('Parcel Code')
    .submitButton('Confirm', 'Check the code against the label before validating.');
// → Shows the scanned code read-only, with the message rendered as help text
//   next to it, and submits on the tap. The preview is never editable.
```

### QR Scan Disabling Auto-Submit

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-review', 'Scan Code')
    .setIntro('Scan the code')
    .setAutoSubmit(false)  // Explicitly disable auto-submit
    .submitButton('Review and Submit');
// → Requires button click to submit
```

### QR Scan in Process Workflow

```javascript
const qrScan = yeriaApp
    .createQRScanView('scan-step-2', 'Scan Verification Code')
    .setProcess('verification', {
        processName: 'Account Verification',
        currentStep: 2,
        totalSteps: 3,
        stepName: 'Scan Code'
    })
    .setIntro('Scan the verification code sent to your email')
    .setValidation(
        'Invalid verification code',
        'number',
        6,
        6
    )
    .submitButton('Verify');
```

## Complete JSON Example

```json
{
  "id": "scan-verification",
  "type": "QRScan",
  "content": {
    "title": "Scan Verification Code",
    "intro": "Scan the verification code sent to your email",
    "autoSubmit": true,
    "submit": {
      "text": "Verify",
      "method": "POST"
    },
    "validation": {
      "errorMessage": "Invalid verification code",
      "format": "number",
      "minLength": 6,
      "maxLength": 6
    },
    "preview": {
      "enabled": true,
      "label": "Scanned Code"
    }
  },
  "process": {
    "processId": "verification",
    "processName": "Account Verification",
    "currentStep": 2,
    "totalSteps": 3,
    "stepName": "Scan Code"
  },
  "metadata": {
    "version": "2.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

