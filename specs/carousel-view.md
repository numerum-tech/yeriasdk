# CarouselView Component Specification

## Description

The `CarouselView` component organizes multiple spotlight slides for mobile hero banners or promotional decks. It's ideal for showcasing featured content, announcements, promotions, or any collection of items that should be displayed in a swipeable carousel format.

Each slide can have:
- Title and description
- Badge (optional)
- Image (optional)
- Action buttons

The carousel supports autoplay, looping, and configurable display settings.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the carousel view |
| `type` | `string` | Yes | Always `"Carousel"` |
| `content` | `CarouselContent` | Yes | Carousel content object |
| `content.title` | `string` | Yes | Carousel title (set in constructor) |
| `content.intro` | `string` | No | Optional line of context under the title. Formerly named `subtitle`. |
| `content.slides` | `CarouselSlide[]` | Yes | Array of slides (at least one required) |
| `content.slides[].id` | `string` | Yes | Unique identifier for the slide |
| `content.slides[].title` | `string` | Yes | Slide title |
| `content.slides[].description` | `string` | No | Slide description |
| `content.slides[].badge` | `string` | No | Badge text (e.g., "New", "Featured") |
| `content.slides[].image` | `CardImage` | No | Slide image |
| `content.slides[].image.url` | `string` | Yes* | Image URL (required if image is set) |
| `content.slides[].image.alt` | `string` | No | Alt text for image |
| `content.slides[].actions` | `CardAction[]` | No | Array of action buttons for the slide |
| `content.slides[].actions[].text` | `string` | Yes | Button text |
| `content.slides[].actions[].method` | `HttpMethod` | No | HTTP method (default: POST) |
| `content.slides[].actions[].confirmMessage` | `string` | No | Optional confirmation dialog |
| `content.slides[].actions[].href` | `string` | No | Optional link URL |
| `content.slides[].actions[].icon` | `string` | No | Optional icon identifier |
| `content.slides[].actions[].variant` | `string` | No | Button variant: `"primary"`, `"secondary"`, `"link"` |
| `content.slides[].meta` | `Record<string, unknown>` | No | Optional metadata for the slide |
| `content.settings` | `CarouselSettings` | No | Carousel display settings |
| `content.settings.autoplay` | `boolean` | No | Enable autoplay (default: false) |
| `content.settings.intervalMs` | `number` | No | Autoplay interval in milliseconds (default: 6000) |
| `content.settings.loop` | `boolean` | No | Enable looping (default: true) |
| `content.settings.showIndicators` | `boolean` | No | Show slide indicators (default: true) |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the line of context shown beneath the carousel heading. Refuses a blank value |
| `setSubtitle(subtitle)` | `subtitle` - Introduction text | `this` | Historical name of `setIntro`, kept. Writes the same key |
| `setSettings(settings)` | `settings` - CarouselSettings object | `this` | Overrides default autoplay and indicator behavior |
| `addSlide(slide)` | `slide` - CarouselSlide object | `this` | Adds a prepared slide to the carousel |
| `createSlide(id, title, description?, options?)` | `id` - Slide ID<br>`title` - Slide title<br>`description` - Optional description<br>`options` - Slide options (imageUrl, imageAlt, badge) | `CarouselSlide` | Creates a slide object (does not add it) |
| `addSlideAction(slideId, text, method?, options?)` | `slideId` - Slide ID<br>`text` - Button text<br>`method` - HTTP method (default: POST)<br>`options` - Action options (confirmMessage, href, icon, variant) | `this` | Adds an action button to a specific slide |
| `clearSlides()` | - | `this` | Removes all slides from the carousel |
| `getContent()` | - | `CarouselContent` | Returns the complete carousel content object |
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

### Basic Carousel

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const carousel = yeriaApp
    .createCarouselView('home-carousel', 'Featured')
    .addSlide(
        carousel.createSlide('release-2-0', 'Version 2.0', 'Discover new features', {
            imageUrl: 'https://example.com/banners/release.jpg',
            badge: 'New'
        })
    )
    .addSlide(
        carousel.createSlide('case-study', 'Case Study', 'How ACME doubled productivity', {
            imageUrl: 'https://example.com/banners/case-study.jpg'
        })
    );

const response = yeriaApp.serve(carousel);
```

### Carousel with Autoplay

```javascript
const carousel = yeriaApp
    .createCarouselView('promotions', 'Special Offers')
    .setIntro('Limited time offers')
    .addSlide(
        carousel.createSlide('offer-1', 'Offer 1', 'Description 1', {
            imageUrl: 'https://example.com/offer1.jpg',
            badge: '50% Off'
        })
    )
    .addSlide(
        carousel.createSlide('offer-2', 'Offer 2', 'Description 2', {
            imageUrl: 'https://example.com/offer2.jpg'
        })
    )
    .setSettings({
        autoplay: true,
        intervalMs: 5000,  // 5 seconds
        loop: true,
        showIndicators: true
    });
```

### Carousel with Actions

```javascript
const carousel = yeriaApp
    .createCarouselView('featured', 'Featured Content')
    .addSlide(
        carousel.createSlide('article-1', 'Article 1', 'Read our latest article', {
            imageUrl: 'https://example.com/article1.jpg'
        })
    )
    .addSlide(
        carousel.createSlide('article-2', 'Article 2', 'Another great read', {
            imageUrl: 'https://example.com/article2.jpg'
        })
    )
    .addSlideAction('article-1', 'Read More', 'GET', { 
        href: '/articles/1',
        variant: 'primary'
    })
    .addSlideAction('article-2', 'Read More', 'GET', { 
        href: '/articles/2',
        variant: 'primary'
    });
```

### Carousel with Multiple Actions per Slide

```javascript
const carousel = yeriaApp
    .createCarouselView('products', 'Featured Products')
    .addSlide(
        carousel.createSlide('product-1', 'Product 1', 'Amazing product', {
            imageUrl: 'https://example.com/product1.jpg',
            badge: 'Popular'
        })
    );

carousel
    .addSlideAction('product-1', 'Buy Now', 'POST', { 
        confirmMessage: 'Add to cart?',
        variant: 'primary'
    })
    .addSlideAction('product-1', 'View Details', 'GET', { 
        href: '/products/1',
        variant: 'secondary'
    })
    .addSlideAction('product-1', 'Share', 'POST', { variant: 'link' });
```

### Carousel with Full Slide Object

```javascript
const carousel = yeriaApp
    .createCarouselView('announcements', 'Announcements')
    .addSlide({
        id: 'announcement-1',
        title: 'New Feature',
        description: 'We\'ve added a new feature',
        badge: 'New',
        image: {
            url: 'https://example.com/announcement1.jpg',
            alt: 'Announcement 1'
        },
        actions: [
            {
                text: 'Learn More',
                method: 'GET',
                href: '/features/new',
                variant: 'primary'
            }
        ],
        meta: {
            category: 'feature',
            priority: 'high'
        }
    });
```

### Carousel with Custom Settings

```javascript
const carousel = yeriaApp
    .createCarouselView('banner', 'Banner')
    .setIntro('Scroll through our content')
    .addSlide(
        carousel.createSlide('slide-1', 'Slide 1', 'First slide')
    )
    .addSlide(
        carousel.createSlide('slide-2', 'Slide 2', 'Second slide')
    )
    .addSlide(
        carousel.createSlide('slide-3', 'Slide 3', 'Third slide')
    )
    .setSettings({
        autoplay: false,      // Manual navigation only
        loop: false,          // Don't loop (stop at end)
        showIndicators: true  // Show dots
    });
```

### Carousel Clearing Slides

```javascript
const carousel = yeriaApp
    .createCarouselView('dynamic-carousel', 'Dynamic Carousel')
    .addSlide(
        carousel.createSlide('slide-1', 'Slide 1', 'Description 1')
    )
    .addSlide(
        carousel.createSlide('slide-2', 'Slide 2', 'Description 2')
    );

// Clear all slides
carousel.clearSlides();

// Add new slides
carousel
    .addSlide(
        carousel.createSlide('new-slide-1', 'New Slide 1', 'New description 1')
    )
    .addSlide(
        carousel.createSlide('new-slide-2', 'New Slide 2', 'New description 2')
    );
```

### Carousel in Process Workflow

```javascript
const carousel = yeriaApp
    .createCarouselView('onboarding-steps', 'Get Started')
    .setProcess('onboarding', {
        processName: 'User Onboarding',
        currentStep: 1,
        totalSteps: 3
    })
    .setIntro('Learn about our features')
    .addSlide(
        carousel.createSlide('step-1', 'Step 1', 'Create your account', {
            imageUrl: 'https://example.com/step1.jpg'
        })
    )
    .addSlide(
        carousel.createSlide('step-2', 'Step 2', 'Complete your profile', {
            imageUrl: 'https://example.com/step2.jpg'
        })
    )
    .addSlide(
        carousel.createSlide('step-3', 'Step 3', 'Start using the app', {
            imageUrl: 'https://example.com/step3.jpg'
        })
    )
    .setSettings({
        autoplay: true,
        intervalMs: 4000,
        loop: true,
        showIndicators: true
    });
```

### Complex Carousel Example

```javascript
const carousel = yeriaApp
    .createCarouselView('homepage-hero', 'Welcome')
    .setIntro('Discover what we offer')
    .addSlide(
        carousel.createSlide('feature-1', 'Feature 1', 'Amazing feature description', {
            imageUrl: 'https://example.com/feature1.jpg',
            badge: 'New'
        })
    )
    .addSlide(
        carousel.createSlide('feature-2', 'Feature 2', 'Another great feature', {
            imageUrl: 'https://example.com/feature2.jpg'
        })
    )
    .addSlide(
        carousel.createSlide('feature-3', 'Feature 3', 'Yet another feature', {
            imageUrl: 'https://example.com/feature3.jpg',
            badge: 'Popular'
        })
    )
    .addSlideAction('feature-1', 'Try Now', 'POST', { variant: 'primary' })
    .addSlideAction('feature-1', 'Learn More', 'GET', { 
        href: '/features/1',
        variant: 'secondary'
    })
    .addSlideAction('feature-2', 'Get Started', 'POST', { variant: 'primary' })
    .addSlideAction('feature-3', 'Explore', 'GET', { 
        href: '/features/3',
        variant: 'primary'
    })
    .setSettings({
        autoplay: true,
        intervalMs: 5000,
        loop: true,
        showIndicators: true
    });
```

## Complete JSON Example

```json
{
  "id": "home-carousel",
  "type": "Carousel",
  "content": {
    "title": "Featured Content",
    "intro": "Scroll through our highlights",
    "slides": [
      {
        "id": "release-2-0",
        "title": "Version 2.0",
        "description": "Discover the new features",
        "image": {
          "url": "https://cdn.example.com/banners/release.jpg",
          "alt": "Version 2.0 Release"
        },
        "badge": "New",
        "actions": [
          {
            "code": "read-more",
            "title": "Read More",
            "method": "GET",
            "href": "/blog/version-2-0",
            "variant": "link"
          }
        ]
      },
      {
        "id": "case-study",
        "title": "Case Study",
        "description": "How ACME doubled productivity",
        "image": {
          "url": "https://cdn.example.com/banners/case-study.jpg",
          "alt": "Case Study"
        },
        "actions": [
          {
            "code": "view-case-study",
            "title": "View Case Study",
            "method": "GET",
            "href": "/case-studies/acme",
            "variant": "primary"
          }
        ]
      },
      {
        "id": "tutorial",
        "title": "Tutorial",
        "description": "Learn the basics in 5 minutes",
        "image": {
          "url": "https://cdn.example.com/banners/tutorial.jpg",
          "alt": "Tutorial"
        },
        "actions": [
          {
            "code": "start-tutorial",
            "title": "Start Tutorial",
            "method": "POST",
            "variant": "primary"
          }
        ]
      }
    ],
    "settings": {
      "autoplay": true,
      "intervalMs": 5000,
      "loop": true,
      "showIndicators": true
    }
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

