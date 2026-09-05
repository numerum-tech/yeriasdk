# Yeria Python SDK

> **Note**: This is the Python port of the Yeria SDK. This repository is a monorepo containing multiple language implementations. See the [root README](../README.md) for an overview.

A stateless backend library for building views that are sent to renderers (mobile or web). This is the Python port of the TypeScript Yeria SDK.

🌐 Website: [yeria.app](https://yeria.app)
📱 Android app: [Yeria on Google Play](https://play.google.com/store/apps/details?id=com.numerum.yeria.app) — the renderer these views are built for.

## Features

- **Stateless Architecture**: No internal state, perfect for serverless and microservices
- **Ed25519 Signing**: Secure view signing and verification using Ed25519 cryptography
- **12 View Types**: Form, Reader, ActionList, ActionGrid, QRScan, QRDisplay, Message, Card, Carousel, Timeline, Media, Map
- **Notifications**: Send signed notifications to users via the Yeria platform
- **Type Safety**: Full type definitions using Python dataclasses and type hints
- **Validation**: Built-in field and form validation
- **Security**: XSS protection, URL validation, input sanitization

## Installation

```bash
pip install yeriasdk
```

## Quick Start

```python
from yeriasdk import YeriaApp, YeriaAppConfig
from yeriasdk.views import FormView

# Initialize YeriaApp
config = YeriaAppConfig(
    app_id="my-app",
    view_expiration_minutes=60,
)
app = YeriaApp(config)

# Create a form view
form = app.create_form_view("registration", "User Registration")
form.add_text_field("name", "Full Name", is_required=True)
form.add_email_field("email", "Email", is_required=True)
form.submit_button("Register")

# Serve with signature
response = app.serve(form)
print(response.view)  # The view JSON
print(response.signature)  # Ed25519 signature
```

## Notifications

```python
from yeriasdk import YeriaApp, YeriaAppConfig, Notification

app = YeriaApp(YeriaAppConfig(
    app_id="my-backend-service",
    private_key=private_key_pem,
    base_url="https://yeria.app",
))

app.notify(Notification("user-123", "Bienvenue !", "Merci d'avoir rejoint Yeria"))
```

`POST {base_url}/api/v1/provider/services/{app_id}/notifications`. L'appel ne
porte aucun jeton : la signature Ed25519 du service l'authentifie.

### Depuis un déploiement de développement

Le tableau de bord fournisseur rend un identifiant `devkey_...` après
l'enregistrement de l'URL et de la clé publique de votre déploiement de travail.
Reportez-le dans `dev_key_id` :

```python
app = YeriaApp(YeriaAppConfig(
    app_id="my-backend-service",
    private_key=dev_private_key_pem,   # la clé de développement
    base_url="https://yeria.app",
    dev_key_id="devkey_a3f9c81e04b2d675",
))
```

Sa présence indique à Yeria que l'appel vient de votre déploiement de travail,
sa valeur désigne la ligne qui vérifie la signature. Vaut pour `notify` et
`fetch_user_details` ; la rotation de clé est refusée (403). Le réglage expire
seul — 30 jours par défaut, 90 au maximum. **À laisser vide en production.**

## Yeria Links

`YeriaLink` generates canonical links without making a network request. HTTPS
is the default so the same link can be displayed on a website or inside an
application.

```python
from yeriasdk import CardView, ReaderView, YeriaLink

chat_url = YeriaLink.chat("catalog-service")
# https://yeria.app/dl/c/catalog-service

component_url = YeriaLink.component(
    "catalog-service",
    "/orders?mode=edit",
)

reader = ReaderView("links", "Useful links")
reader.add_link(chat_url, "Open chat")

card = CardView("order", "Order").set_description("Order details")
card.add_action("Edit", "GET", href=component_url)

# For an application that already knows Yeria is installed:
compact_url = YeriaLink.pin("catalog-service", format="yeria")
# yeria://dl/p/catalog-service
```

Available methods are `service`, `component`, `chat`, `pin`, and `subscribe`.
Service IDs are URL-safe strings and component paths must remain relative to
the service.

## Static JSON Views

```python
from yeriasdk import YeriaApp, YeriaAppConfig

app = YeriaApp(YeriaAppConfig(app_id="my-app"))

envelope = app.serve_raw_view(
    {
        "id": "home-static",
        "type": "Reader",
        "content": {
            "title": "Bienvenue",
            "body": [
                {"type": "paragraph", "text": "Cette vue vient d'un bloc JSON."}
            ],
        },
    }
)
print(envelope.payload)
print(envelope.signature)
```

## View Types

### FormView
Create forms with various field types (text, email, password, select, file, GPS, etc.)

### ReaderView
Display rich content with paragraphs, images, markdown, tables, code blocks, etc.

### ActionListView / ActionGridView
Display lists or grids of actions

### QRScanView / QRDisplayView
QR code scanning and display

### MessageView
Display messages with actions

### CardView
Display card-based content with stats and sections

### CarouselView
Display carousel slides

### TimelineView
Display chronological events

### MediaView
Display audio and video playlists

### MapView
Display geographic data on maps

## API Parity

The Python SDK maintains API parity with the TypeScript version:

- Same factory methods: `app.create_form_view()`, `app.create_reader_view()`, etc.
- Same fluent API: `view.add_field().set_intro().submit_button()` (or `set_note()` for backward compatibility)
- Same validation and security features
- Same Ed25519 signing and verification

## Examples

See `examples/basic_usage.py` for a complete example.

## Requirements

- Python 3.10+
- cryptography (for Ed25519)
- markdown (for ReaderView markdown support)
- bleach (for HTML sanitization)
- requests (for sending notifications)

## Status

✅ Core classes (BaseView, YeriaApp)  
✅ All 12 view types  
✅ Type definitions  
✅ Error handling  
✅ Validation utilities  
✅ Ed25519 signing/verification  
✅ Examples  


## License

Ce projet est sous licence Apache 2.0. Voir les fichiers `LICENSE` et `NOTICE` pour plus de détails. Copyright 2026 Numerum.
