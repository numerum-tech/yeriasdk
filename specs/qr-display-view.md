# QRDisplayView Component Specification

## Description

The `QRDisplayView` component displays a single QR code for users to scan with their devices. Common use cases include sharing access codes, tickets, payment information, or any data that needs to be transferred via QR code.

The QR code can be provided as an image URL or base64-encoded data URI. The component supports a single QR code with title, description, and configuration options.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the QR display view |
| `type` | `string` | Yes | Always `"QRDisplay"` |
| `content` | `QRDisplayContent` | Yes | QR display content object |
| `content.title` | `string` | Yes | View title displayed to the user |
| `content.intro` | `string` | No | Introduction text displayed before the QR code |
| `content.submit` | `SubmitAction` | No | Optional submit button for actions (e.g., Share, Export) |
| `content.submit.text` | `string` | Yes* | Button text (required if submit is set) |
| `content.submit.method` | `HttpMethod` | No | HTTP method (default: POST) |
| `content.qrImage` | `string` | Yes | QR code image URL or base64 data URI |
| `content.qrTitle` | `string` | Yes | Title for the QR code |
| `content.qrDescription` | `string` | Yes | Description text for the QR code |
| `content.qrConfig` | `QRConfig` | No | QR code display configuration |
| `content.qrConfig.size` | `number` | No | QR code size in pixels |
| `content.qrConfig.errorCorrection` | `string` | No | Error correction level: `"L"`, `"M"`, `"Q"`, `"H"` |
| `content.qrConfig.margin` | `number` | No | Margin around QR code |
| `content.qrConfig.color` | `object` | No | Color configuration |
| `content.qrConfig.color.dark` | `string` | No | Dark color (foreground) |
| `content.qrConfig.color.light` | `string` | No | Light color (background) |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the introduction text displayed before the QR code |
| `submitButton(text, method?)` | `text` - Button text<br>`method` - HTTP method (default: POST) | `this` | Defines submit button for QR display actions |
| `setQRCode(qrImage, title, description, config?)` | `qrImage` - QR image URL or base64<br>`title` - QR code title<br>`description` - QR code description<br>`config` - QRConfig options | `this` | Sets the QR code to display (replaces any existing QR code) |
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

### Basic QR Display

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const qrDisplay = yeriaApp
    .createQRDisplayView('qrcode', 'Your QR Code')
    .setIntro('This code gives you access to premium services')
    .setQRCode(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'Subscription Code',
        'Scan this code to activate your subscription',
        { size: 200, errorCorrection: 'Q' }
    );

const response = yeriaApp.serve(qrDisplay);
```

### QR Display with URL

```javascript
const qrDisplay = yeriaApp
    .createQRDisplayView('ticket-qr', 'Your Ticket')
    .setIntro('Present this QR code at the venue')
    .setQRCode(
        'https://example.com/qr/ticket-12345.png',
        'Event Ticket',
        'Scan this QR code for entry',
        {
            size: 250,
            errorCorrection: 'H',
            margin: 4
        }
    );
```

### QR Display with Custom Colors

```javascript
const qrDisplay = yeriaApp
    .createQRDisplayView('branded-qr', 'Branded QR Code')
    .setIntro('Scan our branded QR code')
    .setQRCode(
        'https://example.com/qr/branded.png',
        'Brand QR',
        'Scan to visit our website',
        {
            size: 220,
            errorCorrection: 'Q',
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        }
    );
```

### QR Display with Submit Button

```javascript
const qrDisplay = yeriaApp
    .createQRDisplayView('share-qr', 'Share QR Code')
    .setIntro('Share this QR code with others')
    .setQRCode(
        'https://example.com/qr/share.png',
        'Share Code',
        'Scan to share access',
        { size: 200 }
    )
    .submitButton('Share', 'POST');
```

### QR Display with High Error Correction

```javascript
const qrDisplay = yeriaApp
    .createQRDisplayView('durable-qr', 'Durable QR Code')
    .setIntro('This QR code can handle damage')
    .setQRCode(
        'https://example.com/qr/durable.png',
        'Durable Code',
        'High error correction for damaged codes',
        {
            size: 300,
            errorCorrection: 'H',  // Highest error correction
            margin: 4
        }
    );
```

### QR Display in Process Workflow

```javascript
const qrDisplay = yeriaApp
    .createQRDisplayView('verification-qr', 'Verification QR')
    .setProcess('verification', {
        processName: 'Account Verification',
        currentStep: 3,
        totalSteps: 3,
        stepName: 'Display QR'
    })
    .setIntro('Scan this QR code to complete verification')
    .setQRCode(
        'https://example.com/qr/verify.png',
        'Verification Code',
        'Scan to verify your account',
        { size: 250, errorCorrection: 'Q' }
    )
    .submitButton('Complete Verification', 'POST');
```

## Complete JSON Example

```json
{
  "id": "ticket-qr",
  "type": "QRDisplay",
  "content": {
    "title": "Your Ticket",
    "intro": "Present this QR code at the venue",
    "submit": {
      "text": "Share",
      "method": "POST"
    },
    "qrImage": "https://example.com/qr/ticket-12345.png",
    "qrTitle": "Event Ticket",
    "qrDescription": "Scan this QR code for entry",
    "qrConfig": {
      "size": 250,
      "errorCorrection": "H",
      "margin": 4,
      "color": {
        "dark": "#000000",
        "light": "#FFFFFF"
      }
    }
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

