# CardView Component Specification

## Description

The `CardView` component is a compact "product sheet" view that highlights a single item with stats, sections, and actions. It's ideal for displaying product information, user profiles, event details, or any single entity that needs rich presentation.

The card includes:
- Title and intro
- Description
- Badge (optional)
- Hero image (optional)
- Stats (key-value pairs)
- Sections (heading + body text)
- Action buttons
- Custom metadata

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the card view |
| `type` | `string` | Yes | Always `"Card"` |
| `content` | `CardContent` | Yes | Card content object |
| `content.title` | `string` | Yes | Card title (set in constructor) |
| `content.intro` | `string` | No | Line of context under the title — same role as `intro` on every other view. Formerly named `subtitle`. |
| `content.description` | `string` | No | Long-form description |
| `content.badge` | `string` | No | Badge text (e.g., "New", "Popular") |
| `content.image` | `CardImage` | No | Hero image |
| `content.image.url` | `string` | Yes* | Image URL (required if image is set) |
| `content.image.alt` | `string` | No | Alt text for image |
| `content.statsHeading` | `string` | No | Heading of the stats block. Absent means no heading — the client draws no title of its own. |
| `content.stats` | `CardStat[]` | No | Array of key-value statistics |
| `content.stats[].label` | `string` | Yes | Stat label |
| `content.stats[].value` | `string` | Yes | Stat value |
| `content.sections` | `CardSection[]` | No | Array of descriptive sections |
| `content.sections[].heading` | `string` | Yes | Section heading |
| `content.sections[].body` | `string` | Yes | Section body text |
| `content.actions` | `CardAction[]` | No | Array of action buttons |
| `content.actions[].text` | `string` | Yes | Button text |
| `content.actions[].method` | `HttpMethod` | No | HTTP method (default: POST) |
| `content.actions[].confirmMessage` | `string` | No | Optional confirmation dialog |
| `content.actions[].href` | `string` | No | Optional link URL |
| `content.actions[].icon` | `string` | No | Optional icon identifier |
| `content.actions[].variant` | `string` | No | Button variant: `"primary"`, `"secondary"`, `"link"` |
| `content.meta` | `Record<string, unknown>` | No | Optional metadata |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

**Note:** Card view requires at least a description, stat, or section to be valid.

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the line of context displayed under the main title. Refuses a blank value |
| `setSubtitle(subtitle)` | `subtitle` - Introduction text | `this` | Historical name of `setIntro`, kept. Writes the same key |
| `setDescription(description)` | `description` - Description text | `this` | Sets the long-form description for the card body |
| `setBadge(badge)` | `badge` - Badge text or undefined | `this` | Sets a badge displayed above the title |
| `setImage(url, alt?)` | `url` - Image URL<br>`alt` - Alt text | `this` | Sets the hero image for the card |
| `clearImage()` | - | `this` | Removes the card image |
| `setStatsHeading(heading)` | `heading` - Heading text | `this` | Names the stats block. Optional; refuses a blank value |
| `addStat(label, value)` | `label` - Stat label<br>`value` - Stat value | `this` | Adds a key-value statistic |
| `clearStats()` | - | `this` | Removes all statistics |
| `addSection(heading, body)` | `heading` - Section heading<br>`body` - Section body text | `this` | Adds a descriptive section |
| `clearSections()` | - | `this` | Removes all sections |
| `addAction(text, method?, options?)` | `text` - Button text<br>`method` - HTTP method (default: POST)<br>`options` - Action options (confirmMessage, href, icon, variant) | `this` | Adds an action button |
| `clearActions()` | - | `this` | Removes all actions |
| `setMetadata(meta)` | `meta` - Metadata object | `this` | Sets custom metadata |
| `getContent()` | - | `CardContent` | Returns the complete card content object |
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

### Basic Card

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const card = yeriaApp
    .createCardView('product-card', 'Super Gadget')
    .setIntro('Boost your day')
    .setDescription('A compact companion to organize your tasks and automate your daily routines.')
    .addStat('Price', '49 €')
    .addSection('Key Points', 'Voice assistant, 48h battery life, multi-device sync.')
    .addAction('Buy Now', 'POST', { confirmMessage: 'Confirm your purchase?' });

const response = yeriaApp.serve(card);
```

### Card with Image

```javascript
const card = yeriaApp
    .createCardView('product', 'Product Name')
    .setIntro('Product Category')
    .setDescription('Product description goes here.')
    .setImage('https://example.com/product.jpg', 'Product Image')
    .addStat('Price', '$99')
    .addStat('Rating', '4.5/5')
    .addAction('View Details', 'GET', { href: '/products/123' });
```

### Card with Badge

```javascript
const card = yeriaApp
    .createCardView('featured-product', 'Featured Product')
    .setBadge('New')
    .setIntro('Limited Edition')
    .setDescription('Exclusive product available for a limited time.')
    .setImage('https://example.com/product.jpg', 'Product')
    .addStat('Price', '$199')
    .addStat('Stock', 'Only 5 left')
    .addAction('Purchase', 'POST');
```

### Card with Multiple Stats

```javascript
const card = yeriaApp
    .createCardView('user-profile', 'John Doe')
    .setIntro('Premium Member')
    .setDescription('Active user since 2020')
    .addStat('Posts', '125')
    .addStat('Followers', '1.2K')
    .addStat('Following', '450')
    .addStat('Rating', '4.8/5')
    .addAction('View Profile', 'GET', { href: '/users/john-doe' });
```

### Card with Multiple Sections

```javascript
const card = yeriaApp
    .createCardView('event', 'Tech Conference 2025')
    .setIntro('March 15-17, 2025')
    .setDescription('Join us for the biggest tech conference of the year.')
    .addStat('Date', 'March 15-17')
    .addStat('Location', 'San Francisco')
    .addStat('Price', '$299')
    .addSection('About', 'Three days of talks, workshops, and networking.')
    .addSection('Speakers', 'Industry leaders from Google, Apple, and Microsoft.')
    .addSection('Schedule', 'Day 1: Keynotes, Day 2: Workshops, Day 3: Networking')
    .addAction('Register', 'POST')
    .addAction('View Schedule', 'GET', { href: '/events/schedule' });
```

### Card with Multiple Actions

```javascript
const card = yeriaApp
    .createCardView('item', 'Item Name')
    .setDescription('Item description')
    .addStat('Price', '$49')
    .addAction('Buy Now', 'POST', { 
        confirmMessage: 'Confirm purchase?',
        variant: 'primary'
    })
    .addAction('Add to Cart', 'POST', { variant: 'secondary' })
    .addAction('View Details', 'GET', { 
        href: '/items/123',
        variant: 'link'
    });
```

### Card with Action Variants

```javascript
const card = yeriaApp
    .createCardView('article', 'Article Title')
    .setDescription('Article description')
    .addStat('Views', '1.2K')
    .addStat('Likes', '89')
    .addAction('Read More', 'GET', { 
        href: '/articles/123',
        variant: 'primary'
    })
    .addAction('Share', 'POST', { variant: 'secondary' })
    .addAction('Bookmark', 'POST', { variant: 'link' });
```

### Card with Metadata

```javascript
const card = yeriaApp
    .createCardView('custom-card', 'Custom Card')
    .setDescription('Card with custom metadata')
    .addStat('Value', '100')
    .setMetadata({
        category: 'premium',
        tags: ['featured', 'popular'],
        createdAt: new Date().toISOString()
    })
    .addAction('View', 'GET');
```

### Card Clearing Elements

```javascript
const card = yeriaApp
    .createCardView('dynamic-card', 'Dynamic Card')
    .setDescription('Card with dynamic content')
    .addStat('Stat 1', 'Value 1')
    .addStat('Stat 2', 'Value 2')
    .addSection('Section 1', 'Body 1')
    .addAction('Action 1', 'POST');

// Clear stats
card.clearStats();

// Clear sections
card.clearSections();

// Clear actions
card.clearActions();

// Clear image
card.clearImage();
```

### Card in Process Workflow

```javascript
const card = yeriaApp
    .createCardView('step-summary', 'Step Summary')
    .setProcess('onboarding', {
        processName: 'User Onboarding',
        currentStep: 2,
        totalSteps: 3
    })
    .setDescription('Review your information before proceeding')
    .addStat('Completed', 'Step 1')
    .addStat('Current', 'Step 2')
    .addStat('Remaining', 'Step 3')
    .addAction('Continue', 'POST');
```

### Complex Card Example

```javascript
const card = yeriaApp
    .createCardView('product-detail', 'Premium Headphones')
    .setBadge('Best Seller')
    .setIntro('Wireless Audio')
    .setDescription('High-quality wireless headphones with noise cancellation and 30-hour battery life.')
    .setImage('https://example.com/headphones.jpg', 'Premium Headphones')
    .addStat('Price', '$299')
    .addStat('Rating', '4.8/5')
    .addStat('Reviews', '1,234')
    .addStat('In Stock', 'Yes')
    .addSection('Features', 'Noise cancellation, 30h battery, wireless charging, premium materials.')
    .addSection('Specifications', 'Driver: 40mm, Frequency: 20Hz-20kHz, Weight: 250g.')
    .addSection('Warranty', '2-year manufacturer warranty included.')
    .addAction('Add to Cart', 'POST', { 
        confirmMessage: 'Add to cart?',
        variant: 'primary'
    })
    .addAction('Buy Now', 'POST', { variant: 'primary' })
    .addAction('Compare', 'GET', { href: '/compare', variant: 'secondary' })
    .addAction('Share', 'POST', { variant: 'link' });
```

## Complete JSON Example

```json
{
  "id": "product-detail",
  "type": "Card",
  "content": {
    "title": "Premium Headphones",
    "badge": "Best Seller",
    "intro": "Wireless Audio",
    "description": "High-quality wireless headphones with noise cancellation and 30-hour battery life.",
    "image": {
      "url": "https://example.com/headphones.jpg",
      "alt": "Premium Headphones"
    },
    "stats": [
      {
        "label": "Price",
        "value": "$299"
      },
      {
        "label": "Rating",
        "value": "4.8/5"
      },
      {
        "label": "Reviews",
        "value": "1,234"
      },
      {
        "label": "In Stock",
        "value": "Yes"
      }
    ],
    "sections": [
      {
        "title": "Features",
        "content": "Noise cancellation, 30h battery, wireless charging, premium materials."
      },
      {
        "title": "Specifications",
        "content": "Driver: 40mm, Frequency: 20Hz-20kHz, Weight: 250g."
      },
      {
        "title": "Warranty",
        "content": "2-year manufacturer warranty included."
      }
    ],
    "actions": [
      {
        "code": "add-to-cart",
        "title": "Add to Cart",
        "method": "POST",
        "confirmMessage": "Add to cart?",
        "variant": "primary"
      },
      {
        "code": "buy-now",
        "title": "Buy Now",
        "method": "POST",
        "variant": "primary"
      },
      {
        "code": "compare",
        "title": "Compare",
        "method": "GET",
        "href": "/compare",
        "variant": "secondary"
      },
      {
        "code": "share",
        "title": "Share",
        "method": "POST",
        "variant": "link"
      }
    ]
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

