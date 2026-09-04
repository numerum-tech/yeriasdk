# YeriaUI & YeriaApp — SDK entry points

## Description

The SDK exposes **two** objects to providers. The split is by secret ownership.

| Object | Holds a key? | Role |
|---|---|---|
| `YeriaUI` | No | View **factory**. Builds typed views. Pure, stateless, never instantiated — used like `Math` or `JSON`. |
| `YeriaApp` | Yes (Ed25519) | Everything that needs the private key: **signing** views, verifying inbound user tokens, notifications, key rotation. |

Building is keyless; signing is not. You build a view with `YeriaUI`, then hand
it to `app.serve(view)` — a role handoff, not a round-trip on one object.

Everything else (`YeriaSigner`, `YeriaPublicKeys`, the platform client, the
verifiers) is **internal**. It is not exported and you should not reach for it.

```javascript
import { YeriaUI, YeriaApp } from '@numerum-tech/yeriasdk';

const app = new YeriaApp({
    appId: process.env.YERIA_APP_ID,
    baseUrl: process.env.YERIA_BASE_URL,
    privateKey: process.env.SERVICE_ED25519_PRIVATE_KEY,
});

const view = YeriaUI.createFormView('registration', 'User Registration')
    .addTextField('name', 'Name', true)
    .submitButton('Register', 'POST');

return app.serve(view);   // → { payload, signature }
```

---

## The two key systems

Do not confuse them. They serve different directions of traffic.

| Key | Algorithm | Who owns it | What it does |
|---|---|---|---|
| Yeria platform key | RSA (**RS256**) | Yeria | Signs the user tokens your backend receives. You only ever **verify** with it — the SDK fetches and caches it for you. |
| Your service key | **Ed25519** | You | Signs the view envelopes you return, and the provider→Yeria calls. Registered as a public key on your service; the private half never leaves your backend. |

`app.verifyUserToken()` rejects any token whose header `alg` is not `RS256`.
View envelopes and provider-signed envelopes are always Ed25519.

---

## YeriaUI — the view factory

Keyless. Import and use directly; there is no constructor.

### Factory methods

Each returns a fresh typed view builder.

- `createFormView(formId: string, title: string, processId?: string): FormView`
- `createReaderView(viewId: string, title: string, processId?: string): ReaderView`
- `createActionListView(viewId: string, title: string, processId?: string): ActionListView`
- `createActionGridView(viewId: string, title: string, processId?: string): ActionGridView`
- `createIconGridView(viewId: string, title: string, processId?: string): IconGridView`
- `createQRScanView(viewId: string, title: string, processId?: string): QRScanView`
- `createQRDisplayView(viewId: string, title: string, processId?: string): QRDisplayView`
- `createMessageView(viewId: string, title: string, processId?: string): MessageView`
- `createCardView(viewId: string, title: string, processId?: string): CardView`
- `createCarouselView(viewId: string, title: string, processId?: string): CarouselView`
- `createTimelineView(viewId: string, title: string, processId?: string): TimelineView`
- `createMediaView(viewId: string, title: string, processId?: string): MediaView`
- `createMapView(viewId: string, title: string, processId?: string): MapView`

### Rehydrating a stored view

```javascript
fromJson(json: Record<string, unknown>): BaseView
```

Turns wire JSON (a static template, or a view you persisted in your own DB)
back into a typed, validated view instance. Use it when you store screens as
JSON rather than rebuilding them field by field:

```javascript
const view = YeriaUI.fromJson(await db.screens.get('home'));
return app.serve(view);
```

### Unsigned error body

```javascript
error(spec: ProviderErrorSpec): ProviderErrorBody
```

Builds an error body byte-identical to the platform's own error shape, without
a signature. Use it when you have no key at hand (startup failure, config
error). When you *do* have a key, prefer `app.serveError()` — a signed error
is one the mobile can trust.

---

## YeriaApp — the key holder

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `appId` | `string` | Yes | Unique application identifier. Carried inside every signed payload. |
| `privateKey` | `string` | No | Ed25519 private key, PEM (PKCS#8). Generated on the fly if omitted — fine for tests, never for production. |
| `publicKey` | `string` | No | Ed25519 public key, PEM (SPKI). Derived from `privateKey` when omitted. |
| `baseUrl` | `string` | No | Yeria base URL, e.g. `https://yeria.app`. Required for `verifyUserToken`, `notify`, `fetchUserDetails`, `rotateKey`. |
| `allowedDomains` | `string[]` | No | Allowed domains for view serving (default `[]`). |
| `viewExpirationMinutes` | `number` | No | View lifetime used by `verifyIntegrity` (default `60`). |
| `notificationTimeout` | `number` | No | HTTP timeout in ms for platform calls (default `5000`). |

### Serving views

```javascript
serve(view: BaseView): SignedEnvelope
```

Signs a view into a v3 envelope. This is the **single** signing path — send the
result as-is:

```javascript
res.json(app.serve(view));
```

```javascript
serveError(spec: ProviderErrorSpec): SignedEnvelope
```

Same envelope, carrying an error instead of a view. The mobile verifies the
signature before showing anything, so a signed error cannot be spoofed by a
network attacker. The `status` field is advisory — the mobile does not rely on
the HTTP status code.

### SignedEnvelope

```javascript
{
  payload: string,     // JSON string: {"appId":…,"timestamp":…,"view":{…}}
  signature: string    // Ed25519 signature over the payload STRING BYTES, base64
}
```

The signature covers the exact bytes of `payload`. A verifier must check those
bytes **before** parsing the JSON — re-serializing first would change the bytes
and break the signature.

### Verification & keys

| Method | Returns | Description |
|---|---|---|
| `verifyIntegrity(envelope: SignedEnvelope)` | `boolean` | Verifies an envelope this app signed. Throws when the appId mismatches, the view has expired, or the signature is invalid. |
| `getServicePublicKey()` | `string` | Your service's Ed25519 public key (PEM). This is the value you register on your Yeria service. |

### Inbound user tokens

```javascript
async verifyUserToken(
    bearerToken: string,
    expectedAudience?: string | number,
): Promise<YeriaTokenClaims>
```

Verifies a Yeria-issued user token (RS256). Resolves the token's `kid` against
Yeria's public keys through an internal, TTL-cached key store — you never wire
a resolver or hold PEMs yourself. Enforces `iss='yeria'` and `exp > now`; pass
`expectedAudience` to pin the token to your service id.

Throws `YeriaPlatformUnreachableError` when Yeria cannot be reached (surface
`503` — the token might be fine). An unknown or expired key surfaces as a
verification error (surface `401`).

### User details

```javascript
async fetchUserDetails(opts: {
    userServiceToken: string;
    fetch?: typeof fetch;
}): Promise<UserDetails>
```

Fetches a Yeria user's profile, **authorized by the user's own live service
token** — not by your notification preferences and not by a bearer token in the
body. The credential on the wire is the Ed25519 signature over the envelope.

### Notifications

| Method | Returns | Description |
|---|---|---|
| `signNotification(notification: Notification)` | `SecureNotificationResponse` | Signs without sending. |
| `async notify(notification: Notification)` | `Promise<void>` | Signs and POSTs to Yeria. |

See [Notifications](notification.md) for delivery rules and subscription errors.

### Key rotation

```javascript
async rotateKey(...)
```

Registers a new Ed25519 public key for your service. The retired key stays
valid for a short grace window so in-flight requests do not break.

### Static escape hatches

Prefer the instance methods. These exist for the rare case where you already
hold the exact PEM, or want no network at all.

| Method | Description |
|---|---|
| `static verifySignature(publicKey, payload, signature, onError?)` | Raw Ed25519 verify over a payload string against a PEM. |
| `static signView(view, appId, privateKey, timestamp?)` | Sign a view into a `SignedEnvelope` from a one-off key. |
| `static verifyYeriaToken(jwt, yeriaPublicKey, expectedAudience?)` | Verify a user token against a known PEM. Pure, no network. |
| `static async verifyYeriaTokenWithResolver(jwt, resolver, expectedAudience?)` | Same, but you supply the `kid` resolver. |

---

## Complete example

```javascript
import express from 'express';
import { YeriaUI, YeriaApp } from '@numerum-tech/yeriasdk';

const app = new YeriaApp({
    appId: process.env.YERIA_APP_ID,
    baseUrl: process.env.YERIA_BASE_URL,
    privateKey: process.env.SERVICE_ED25519_PRIVATE_KEY,
});

const server = express();

server.get('/screens/registration', async (req, res) => {
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /i, '');

    try {
        const claims = await app.verifyUserToken(bearer, process.env.YERIA_SERVICE_ID);

        const form = YeriaUI.createFormView('registration', 'User Registration')
            .setIntro(`Welcome, ${claims.sub}`)
            .addTextField('name', 'Name', true)
            .addEmailField('email', 'Email', true)
            .submitButton('Register', 'POST');

        return res.json(app.serve(form));
    } catch (err) {
        return res.status(401).json(app.serveError({
            code: 'auth.invalid_token',
            message: 'Session expirée, reconnectez-vous.',
            status: 401,
        }));
    }
});
```

The payload the mobile receives:

```json
{
  "payload": "{\"appId\":\"my-app\",\"timestamp\":1706443200000,\"view\":{\"id\":\"registration\",\"type\":\"Form\",\"content\":{…}}}",
  "signature": "MEUCIQD…"
}
```

---

## See also

- [Provider integration](provider-integration.md) — keys, authentication, user profiles, end to end
- [Component specifications](readme.md) — every view type
