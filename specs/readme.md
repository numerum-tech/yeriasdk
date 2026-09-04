# Yeria SDK Specifications

Reference for the Yeria SDK, available for **JavaScript/TypeScript**
(`@numerum-tech/yeriasdk`) and **Python** (`yeriasdk`). Both implementations
sign byte-identically, so a view built in one verifies in the other.

Each component specification includes:

- **Component Description**: Purpose, use cases, and design principles
- **Fields Description Table**: Complete field reference with types, requirements, and descriptions
- **Sample Code**: Practical examples demonstrating component usage

## Start here

- **[Provider integration](provider-integration.md)** — end to end: generate your Ed25519 keypair, register it, verify inbound user tokens, fetch user profiles. Read this first.
- **[YeriaUI & YeriaApp](yeria-app.md)** — the two SDK entry points. `YeriaUI` builds views (keyless); `YeriaApp` holds your key and signs.

## View Components

### Form Components

- **[FormView](form-view.md)** - Dynamic forms with various field types, validation rules, and submission actions. Supports text, email, password, number, date, select, file uploads, GPS coordinates, and more.

### Content Display Components

- **[ReaderView](reader-view.md)** - Rich content display for reading. Supports paragraphs, images, markdown content, lists, links, tables, code blocks, quotes, and custom elements.

- **[CardView](card-view.md)** - Compact "product sheet" view highlighting a single item with stats, sections, and actions. Ideal for product information, user profiles, or event details.

- **[CarouselView](carousel-view.md)** - Carousel/slideshow component for showcasing featured content, announcements, or promotions. Supports autoplay, looping, and configurable display settings.

- **[TimelineView](timeline-view.md)** - Chronological timeline display for tracking progress, onboarding steps, or activity feeds. Supports status indicators (pending, active, completed, error).

- **[MediaView](media-view.md)** - Audio and video playlist component for media playback. Supports multiple sources, posters, and playback controls.

- **[MapView](map-view.md)** - Geographic map display with markers, viewport configuration, controls, and overlays. Backend provides data while renderer handles styling and interactions.

### Action Components

- **[ActionListView](action-list-view.md)** - Vertical list of action items for navigation menus, feature lists, or command centers. Each action can have title, description, thumbnail, and metadata.

- **[ActionGridView](action-grid-view.md)** - Grid layout of action items for dashboards or icon-based navigation. Supports configurable columns (1-6) and spacing.

- **[IconGridView](icon-grid-view.md)** - Compact icon grid for dense, icon-first navigation.

### QR Code Components

- **[QRScanView](qr-scan-view.md)** - QR code scanner interface. Mobile app handles scanner implementation while view describes what to scan and where to submit. Supports auto-submit, validation, and preview modes.

- **[QRDisplayView](qr-display-view.md)** - QR code display component for sharing access codes, tickets, or payment information. Supports multiple QR codes with individual titles, descriptions, and configuration options.

### Message Components

- **[MessageView](message-view.md)** - Message, notification, and alert display component. Supports different severity levels (info, success, warning, error) with primary and secondary actions. Can be dismissible or require user interaction.

### Header Text

Every view carries a short line of context under its title, set with `setIntro(text)` and carried by the `intro` key. CardView adds `setDescription(text)` for its long-form body paragraph, which is a different role. On CardView and CarouselView the key used to be named `subtitle`: `setSubtitle(text)` is kept as an alias of `setIntro` and writes the same key. All header texts share one contract:

- The text is trimmed, and an empty or blank value is refused with an `InvalidParameterError`. A header line is set or it does not exist — there is no "empty" state.
- A setter you never call emits no key at all. The client draws nothing for a key it does not receive, so an unset intro costs no vertical space.

## Usage

Each specification document provides:

1. **Complete field reference** - All available fields with their types, requirements, and descriptions
2. **Practical examples** - Real-world code samples showing how to use each component
3. **Best practices** - Design principles and conventions for each component type

## Quick Start

Building a view needs no key; signing it does. That is why the two steps sit on
two different objects.

```javascript
import { YeriaUI, YeriaApp } from '@numerum-tech/yeriasdk';

// Holds your Ed25519 private key — signs, verifies, talks to Yeria.
const app = new YeriaApp({
    appId: 'my-app',
    baseUrl: process.env.YERIA_BASE_URL,
    privateKey: process.env.SERVICE_ED25519_PRIVATE_KEY,
});

// Keyless factory — never instantiated, used like Math or JSON.
const form = YeriaUI.createFormView('registration', 'User Registration')
    .addTextField('name', 'Name', true)
    .submitButton('Register', 'POST');

// Sign it into a v3 envelope: { payload, signature }
res.json(app.serve(form));
```

Python, same protocol:

```python
from yeriasdk import YeriaApp, YeriaAppConfig, YeriaUI

app = YeriaApp(YeriaAppConfig(
    app_id="my-app",
    base_url=os.environ["YERIA_BASE_URL"],
    private_key=os.environ["SERVICE_ED25519_PRIVATE_KEY"],
))

form = (YeriaUI.create_form_view("registration", "User Registration")
        .add_text_field("name", "Name", True)
        .submit_button("Register", "POST"))

envelope = app.serve(form)
```

For detailed information about each component, refer to the individual specification documents listed above.

