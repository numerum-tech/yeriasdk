# Provider integration

How a provider plugs its backend into Yeria, end to end: keys, authentication,
user profiles. Two language sketches; same protocol.

The SDK ships **helpers, not middleware**. Wire them into your own auth layer
(Express middleware, FastAPI dependency, Total.js handler, …). There is no
`YeriaApp.authMiddleware()` and there never will be — framework integration is
your call.

---

## Where your backend sits

Yeria is a **registry and an identity provider**, not a proxy. Once the mobile
app has resolved your service, it talks to **your URL directly**. Yeria never
sees that traffic.

```
[Mobile] ── discovers service ──> [Yeria]        (catalog, review, signing keys)
[Mobile] ── mints service JWT ──> [Yeria]        (POST /user/service-token)
[Mobile] ── Bearer <serviceJWT> ─> [Your backend]  ← all real traffic
```

So your backend must be reachable over HTTPS from user devices, and it must
verify every inbound token itself. That is what this page covers.

---

## The two key systems

| Key | Algorithm | Who owns it | What it does |
|---|---|---|---|
| Yeria platform key | RSA (**RS256**) | Yeria | Signs the user tokens you receive. You only **verify** with it; the SDK fetches and caches it by `kid`. |
| Your service key | **Ed25519** | You | Signs the view envelopes you return and your provider→Yeria calls. Public half registered on your Yeria service; private half never leaves your backend. |

Generating an RSA keypair for your service is **wrong** — the registry rejects
anything that is not Ed25519.

---

## 1. Generate your service keypair

```bash
# Private key — PKCS#8 PEM. Keep it out of git.
openssl genpkey -algorithm ed25519 -out service_private.pem

# Public key — SPKI PEM. This is what you paste into Yeria.
openssl pkey -in service_private.pem -pubout -out service_public.pem
```

Node, if you prefer:

```javascript
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem  = publicKey.export({ type: 'spki', format: 'pem' });
```

The public key looks like this — one short base64 line, because Ed25519 keys
are 32 bytes:

```
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA14UIHuc98YQOnlD+EB8BIT2zbEzPJipRvXtcQifZ+jE=
-----END PUBLIC KEY-----
```

> **The private key is your service's identity.** Never commit it, never send
> it to Yeria, never put it in a mobile build. Anyone holding it can sign views
> and provider calls as you. If it leaks, rotate immediately.

## 2. Register the public key

Paste the **public** PEM into your service's *Provider public key* field in the
Yeria provider dashboard (Services → your service → Edit). Yeria stores it in
its key registry and uses it to verify everything you sign.

On a service that has already been approved by a Yeria review, changing the key
is a registry edit: it is staged into a draft and applied when the review is
approved. Emergency rotation is separate — see *Key rotation* below.

## 3. Configure your backend

| Env var | Purpose |
|---|---|
| `YERIA_BASE_URL` | e.g. `https://yeria.app`. Trailing slash optional. |
| `YERIA_APP_ID` | Your application identifier; carried inside every signed payload. |
| `YERIA_SERVICE_ID` | Your service's id in Yeria. Used to pin the token audience. |
| `SERVICE_ED25519_PRIVATE_KEY` | PEM of the private key from step 1. |

---

## Request lifecycle

```
[Mobile] -- Bearer <serviceJWT> --> [Provider backend]
                                          |
                                          | 1. app.verifyUserToken(bearer, SERVICE_ID)
                                          |    (signature math; key cached after first hit)
                                          |
                                          | 2. cache miss? app.fetchUserDetails(...)
                                          |    (signs an envelope, POSTs to Yeria)
                                          |
                                          | 3. your handler logic
                                          v
                                  [YeriaUI builds a view → app.serve(view)]
```

Step 1 is the hot path: no network once the signing key is cached. Step 2 fires
on the first hit per user, then never again — persist the profile by `sub` and
serve it locally afterwards.

---

## JavaScript / TypeScript

```ts
import express from 'express';
import {
  YeriaUI,
  YeriaApp,
  SignatureVerificationError,
  ViewExpiredError,
  YeriaPlatformUnreachableError,
} from '@numerum-tech/yeriasdk';

const SERVICE_ID = process.env.YERIA_SERVICE_ID!;

// One instance: it signs views, verifies inbound tokens, and talks to Yeria.
// The public key is derived from the private key — no need to pass it.
const app = new YeriaApp({
  appId: process.env.YERIA_APP_ID!,
  baseUrl: process.env.YERIA_BASE_URL!,
  privateKey: process.env.SERVICE_ED25519_PRIVATE_KEY!,
});

// Your own middleware — NOT shipped by the SDK.
async function requireYeriaUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const auth = req.headers.authorization ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return res.status(401).json({ error: 'missing token' });

  try {
    // Resolves the token's `kid` against Yeria through an internal cached
    // key store, enforces iss='yeria', exp > now, and aud = our service.
    (req as any).yeriaUser = await app.verifyUserToken(bearer, SERVICE_ID);
    (req as any).yeriaToken = bearer;
    next();
  } catch (err) {
    if (err instanceof ViewExpiredError) return res.status(401).json({ error: 'token expired' });
    if (err instanceof SignatureVerificationError) return res.status(401).json({ error: 'invalid token' });
    // Yeria unreachable — the token may well be fine. Do not 401.
    if (err instanceof YeriaPlatformUnreachableError) return res.status(503).json({ error: 'yeria unreachable' });
    return res.status(500).json({ error: 'auth error' });
  }
}

const server = express();
server.use('/secure', requireYeriaUser);

server.get('/secure/home', async (req, res) => {
  const claims = (req as any).yeriaUser;

  // Cache miss → fetch from Yeria once, persist locally.
  let user = await db.users.findByYeriaSub(claims.sub);
  if (!user) {
    const details = await app.fetchUserDetails({
      userServiceToken: (req as any).yeriaToken,
    });
    user = await db.users.insert({ yeria_sub: claims.sub, ...details });
  }

  const view = YeriaUI.createReaderView('home', `Bonjour ${user.first_name}`)
    .addParagraph('Votre espace personnel.');

  res.json(app.serve(view));
});
```

## Python

```python
import os
from yeriasdk import YeriaApp, YeriaAppConfig, YeriaUI
from yeriasdk.errors.exceptions import SignatureVerificationError, ViewExpiredError

SERVICE_ID = os.environ["YERIA_SERVICE_ID"]

app = YeriaApp(YeriaAppConfig(
    app_id=os.environ["YERIA_APP_ID"],
    base_url=os.environ["YERIA_BASE_URL"],
    private_key=os.environ["SERVICE_ED25519_PRIVATE_KEY"],
))

# FastAPI dependency — written by you, NOT shipped by the SDK.
from fastapi import Depends, Header, HTTPException

async def require_yeria_user(authorization: str = Header(default="")):
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing token")
    bearer = authorization[7:].strip()
    try:
        claims = app.verify_user_token(bearer, SERVICE_ID)
        return claims, bearer
    except ViewExpiredError:
        raise HTTPException(401, "token expired")
    except SignatureVerificationError:
        raise HTTPException(401, "invalid token")

@app.get("/secure/home")
async def home(auth = Depends(require_yeria_user)):
    claims, bearer = auth

    user = db.users.find_by_yeria_sub(claims.sub)
    if user is None:
        details = app.fetch_user_details(user_service_token=bearer)
        user = db.users.insert(yeria_sub=claims.sub, **dataclasses.asdict(details))

    view = (YeriaUI.create_reader_view("home", f"Bonjour {user.first_name}")
            .add_paragraph("Votre espace personnel."))
    return app.serve(view)
```

---

## Persistence model

Mirror Yeria's `sub` into your own `users` table. It is stable for the lifetime
of the user's Yeria account and is the only field guaranteed to be present in
every per-service token.

```sql
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    yeria_sub     TEXT UNIQUE NOT NULL,
    first_name    TEXT,
    last_name     TEXT,
    country_code  CHAR(2),
    email         TEXT,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- your own provider-specific fields below
    ...
);
CREATE INDEX users_yeria_sub_idx ON users (yeria_sub);
```

Refresh policy is yours: a TTL on `fetched_at`, or an explicit "refresh from
Yeria" action in your own settings screen.

---

## Key rotation

**Yeria's key** rotates on its own schedule. The retired key stays valid for a
short grace window, then stops resolving. The SDK's internal key store follows
the `kid` in each token header and fetches the new PEM on first encounter — you
do not restart anything, and you do not manage PEMs.

**Your key** rotates when you call `app.rotateKey(...)`, or through the service
edit form. The previous key keeps verifying for a 5-minute grace window so
in-flight requests survive the swap.

---

## What is NOT in the body

Provider-signed calls (`fetchUserDetails`, key rotation) **never** carry a
bearer token in the body. The credential is the Ed25519 signature over the
envelope, made with your registered private key. Yeria already holds every
active public key for your service, so the body does not nominate which key
signed — Yeria tries the registered keys and accepts any match. This keeps the
wire shape minimal and avoids leaking bearer tokens into logs of signed
payloads.

---

## Errors quick reference

| SDK error | Likely cause | Right HTTP response |
|---|---|---|
| `SignatureVerificationError` | Wrong key, tampered token, or a key Yeria no longer trusts | `401` |
| `ViewExpiredError` | `exp` is in the past | `401` |
| `YeriaPlatformUnreachableError` | Yeria is down or unreachable — the token itself may be valid | `503` |
| Profile fetch failed | Misconfigured service id, replayed envelope, or a key Yeria rejected | `502` / `503` |
| Unexpected response shape | Yeria upgraded the wire format and your SDK is older | Upgrade the SDK |

Return errors to the mobile through `app.serveError({ code, message, status })`
so they arrive **signed** — see [YeriaUI & YeriaApp](yeria-app.md).

---

## See also

- [YeriaUI & YeriaApp](yeria-app.md) — the full API surface
- [Component specifications](readme.md) — every view type
- [Notifications](notification.md) — subscription rules and delivery errors
