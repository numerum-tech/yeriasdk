# MessageView Component Specification

## Description

The `MessageView` component displays messages, notifications, alerts, or confirmations to users. It supports different severity levels (info, success, warning, error) and can include primary and secondary actions. The buttons say everything: a box always has exactly one way out, and when none of the declared actions closes, the user has to choose — a stray tap on the backdrop cannot swallow the decision.

Common use cases include:
- Success messages after form submission
- Error notifications
- Information alerts
- Confirmation dialogs
- Welcome messages

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the message view |
| `type` | `string` | Yes | Always `"Message"` |
| `content` | `MessageContent` | Yes | Message content object |
| `content.title` | `string` | Yes | Names the window — the bar above the box |
| `content.intro` | `string` | No | The first line of the box, under the title — a subtitle |
| `content.body` | `string` | Yes | What the message says. Required: a message with no body has nothing to say |
| `content.severity` | `string` | No | Message severity: `"info"`, `"success"`, `"warning"`, `"error"` (default: `"info"`) |
| `content.actions` | `MessageAction[]` | No | The buttons, in order. Two at most; none is valid — the client then draws a single close button, so a box always has exactly one way out |
| `content.actions[].label` | `string` | Yes | Button text |
| `content.actions[].go` | `string` | No | Path or URL of the view this button loads. Absent, and with no `back`, the button simply closes |
| `content.actions[].method` | `HttpMethod` | No | Only alongside `go` (default: GET) |
| `content.actions[].back` | `number \| 'root'` | No | Steps back that many screens, loading nothing — the target is already in the stack. `'root'` returns to your base view. Mutually exclusive with `go` |
| `content.meta` | `Record<string, unknown>` | No | Optional metadata |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the introduction text displayed before body |
| `setBody(body)` | `body` - Message body text | `this` | Sets the main message body (required if intro not provided) |
| `setSeverity(severity)` | `severity` - Severity level ('info', 'success', 'warning', 'error') | `this` | Sets the message severity level |
| `addAction(label, options?)` | `label` - Button text<br>`options.go` - Path or URL to load<br>`options.method` - HTTP method, with `go` only<br>`options.back` - Screens to step back, or `'root'` | `this` | Adds a button. Two at most. With neither `go` nor `back`, it simply closes |
| `clearActions()` | - | `this` | Removes every action |
| `setPrimaryAction(text, method?, confirmMessage?)` | see `addAction` | `this` | Historical name. `confirmMessage` was the destination and maps onto `go` |
| `setSecondaryAction(text, method?, confirmMessage?)` | see `addAction` | `this` | Historical name: adds the second button |
| `submitButton(text, method?, confirmMessage?)` | see `addAction` | `this` | Historical name of `addAction` |
| `clearSecondaryAction()` | - | `this` | Keeps only the first action |
| `setMetadata(metadata)` | `metadata` - Metadata object | `this` | Sets custom metadata |
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

### A notice, with nothing to decide

Declare no action and the client draws a single close button. A box always has exactly one way out.

```javascript
const message = YeriaUI
    .createMessageView('saved', 'Données reçues')
    .setSeverity('success')
    .setBody('Your answers have been recorded.');
```

### A notice, with a way on

`back` returns to a screen already in the stack, loading nothing — it keeps the state the user left there. The second button closes and leaves them where they are.

```javascript
const message = YeriaUI
    .createMessageView('saved', 'Données reçues')
    .setSeverity('success')
    .setBody('Your answers have been recorded.')
    .addAction('Back to the list', { back: 1 })
    .addAction('Stay here');
```

### A decision

Two actions, each with its outcome. With none of them closing, the box cannot be dismissed by a stray tap: the user has to choose.

```javascript
const message = YeriaUI
    .createMessageView('confirm-delete', 'Delete for good?')
    .setSeverity('warning')
    .setBody('This cannot be undone.')
    .addAction('Delete', { go: '/items/4718/delete', method: 'DELETE' })
    .addAction('Cancel');
```

### Ending a journey

`'root'` returns to the view served by your base URL, whatever path the user took to get here — the only position you know for sure.

```javascript
const message = YeriaUI
    .createMessageView('order-placed', 'Order confirmed')
    .setSeverity('success')
    .setBody('Order 4718 has been recorded.')
    .addAction('Back to home', { back: 'root' });
```

## Complete JSON Example

```json
{
  "id": "welcome-message",
  "type": "Message",
  "content": {
    "title": "Welcome!",
    "intro": "Thank you for joining us",
    "body": "We're excited to have you on board. Get started by completing your profile.",
    "severity": "info",
    "actions": [
      { "label": "Get Started", "go": "/profile", "method": "GET" },
      { "label": "Maybe Later" }
    ],
    "meta": {
      "campaign": "onboarding-2025"
    }
  },
  "process": {
    "processId": "onboarding",
    "processName": "User Onboarding",
    "currentStep": 1,
    "totalSteps": 3,
    "stepName": "Welcome"
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

