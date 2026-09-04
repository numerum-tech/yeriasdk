# MediaView Component Specification

## Description

The `MediaView` component groups audio and video resources in a consistent playlist for mobile playback. It supports multiple media items with sources, posters, and playback controls.

## Rendering Notes

A MediaView is a **player with an optional playlist** — NOT a carousel/pager.
Renderers should:

- Show **one player** for the currently selected item (poster + native playback
  controls; full-screen for video, inline/controls for audio).
- When `content.items` has **more than one** item, show a **playlist** (a
  selectable list of the items) so the user can load any item into the player.
  With a single item, show only the player.
- Do **not** present items as swipeable full-screen pages (that is `CarouselView`).

`content.title` is the playlist title; each `items[]` entry is an independently
playable resource described by its `sources`, `poster`, and playback flags.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the media view |
| `type` | `string` | Yes | Always `"Media"` |
| `content` | `MediaContent` | Yes | Media content object |
| `content.title` | `string` | Yes | Media playlist title |
| `content.intro` | `string` | No | Introduction text displayed before media items |
| `content.items` | `MediaItem[]` | Yes | Array of media items (at least one required) |
| `content.items[].id` | `string` | Yes | Unique identifier for the media item |
| `content.items[].kind` | `string` | Yes | Media type: `"audio"` or `"video"` |
| `content.items[].title` | `string` | No | Media title |
| `content.items[].description` | `string` | No | Media description |
| `content.items[].poster` | `string` | No | Poster image URL (for video) |
| `content.items[].autoplay` | `boolean` | No | Auto-play media (default: false) |
| `content.items[].loop` | `boolean` | No | Loop media (default: false) |
| `content.items[].controls` | `boolean` | No | Show playback controls (default: true) |
| `content.items[].selected` | `boolean` | No | Marks the entry shown first in the player. Set via `setSelectedItem(id)` (which clears any other) — never set manually on multiple items. Defaults to the first item. Combine with `autoplay` to start playback on open. |
| `content.items[].sources` | `MediaSource[]` | Yes | Array of media sources (at least one required) |
| `content.items[].sources[].src` | `string` | Yes | Media source URL |
| `content.items[].sources[].type` | `string` | No | MIME type (e.g., "video/mp4", "audio/mpeg") |
| `content.items[].meta` | `Record<string, unknown>` | No | Optional metadata |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the introduction text displayed before media items |
| `addMediaItem(item)` | `item` - MediaItem object | `this` | Adds a ready-to-play media entry (`selected` is ignored here — use `setSelectedItem`) |
| `setSelectedItem(id)` (py: `set_selected_item`) | `id` - media item id | `this` | Marks that entry as the one shown first; clears `selected` on all others so only one is ever selected |
| `createMedia(id, kind, src, options?)` | `id` - Media ID<br>`kind` - Media type ('audio' or 'video')<br>`src` - Media source URL<br>`options` - Media options (type, title, description, poster, autoplay, loop, controls) | `MediaItem` | Creates a media item object (does not add it) |
| `clearItems()` | - | `this` | Removes all media items |
| `getContent()` | - | `MediaContent` | Returns the complete media content object |
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

### Basic Media View

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const mediaView = yeriaApp
    .createMediaView('media-library', 'Tutorials')
    .setIntro('Learn in a few minutes')
    .addMediaItem(
        mediaView.createMedia('video-intro', 'video', 'https://example.com/videos/intro.mp4', {
            type: 'video/mp4',
            title: 'Introduction Video',
            poster: 'https://example.com/posters/intro.jpg'
        })
    );

const response = yeriaApp.serve(mediaView);
```

### Media View with Audio

```javascript
const mediaView = yeriaApp
    .createMediaView('audio-library', 'Audio Guides')
    .setIntro('Listen to our audio guides')
    .addMediaItem({
        id: 'audio-guide',
        kind: 'audio',
        title: 'Getting Started Guide',
        description: 'Learn the basics in 5 minutes',
        sources: [
            { src: 'https://example.com/audio/guide.mp3', type: 'audio/mpeg' }
        ],
        controls: true
    });
```

### Media View with Multiple Sources

```javascript
const mediaView = yeriaApp
    .createMediaView('video-library', 'Video Tutorials')
    .setIntro('Watch our video tutorials')
    .addMediaItem({
        id: 'tutorial-1',
        kind: 'video',
        title: 'Tutorial 1',
        description: 'First tutorial video',
        poster: 'https://example.com/posters/tutorial1.jpg',
        sources: [
            { src: 'https://example.com/videos/tutorial1.mp4', type: 'video/mp4' },
            { src: 'https://example.com/videos/tutorial1.webm', type: 'video/webm' }
        ],
        controls: true,
        autoplay: false,
        loop: false
    });
```

### Media View with Autoplay

```javascript
const mediaView = yeriaApp
    .createMediaView('promo-videos', 'Promotional Videos')
    .setIntro('Watch our promotional content')
    .addMediaItem(
        mediaView.createMedia('promo-1', 'video', 'https://example.com/videos/promo.mp4', {
            type: 'video/mp4',
            title: 'Promotional Video',
            poster: 'https://example.com/posters/promo.jpg',
            autoplay: true,
            loop: true,
            controls: true
        })
    );
```

### Media View with Multiple Items

```javascript
const mediaView = yeriaApp
    .createMediaView('playlist', 'Media Playlist')
    .setIntro('Browse our media collection')
    .addMediaItem(
        mediaView.createMedia('video-1', 'video', 'https://example.com/videos/video1.mp4', {
            type: 'video/mp4',
            title: 'Video 1',
            poster: 'https://example.com/posters/video1.jpg'
        })
    )
    .addMediaItem(
        mediaView.createMedia('audio-1', 'audio', 'https://example.com/audio/audio1.mp3', {
            type: 'audio/mpeg',
            title: 'Audio 1'
        })
    )
    .addMediaItem({
        id: 'video-2',
        kind: 'video',
        title: 'Video 2',
        description: 'Second video',
        poster: 'https://example.com/posters/video2.jpg',
        sources: [
            { src: 'https://example.com/videos/video2.mp4', type: 'video/mp4' }
        ]
    });
```

### Media View Clearing Items

```javascript
const mediaView = yeriaApp
    .createMediaView('dynamic-media', 'Dynamic Media')
    .setIntro('Dynamic media playlist')
    .addMediaItem(
        mediaView.createMedia('item-1', 'video', 'https://example.com/video1.mp4', {
            type: 'video/mp4'
        })
    );

// Clear all items
mediaView.clearItems();

// Add new items
mediaView.addMediaItem(
    mediaView.createMedia('new-item-1', 'video', 'https://example.com/new-video.mp4', {
        type: 'video/mp4',
        title: 'New Video'
    })
);
```

### Media View in Process Workflow

```javascript
const mediaView = yeriaApp
    .createMediaView('onboarding-media', 'Onboarding Tutorials')
    .setProcess('onboarding', {
        processName: 'User Onboarding',
        currentStep: 2,
        totalSteps: 3
    })
    .setIntro('Watch these tutorials to get started')
    .addMediaItem(
        mediaView.createMedia('intro-video', 'video', 'https://example.com/intro.mp4', {
            type: 'video/mp4',
            title: 'Introduction',
            poster: 'https://example.com/intro-poster.jpg',
            controls: true
        })
    )
    .addMediaItem({
        id: 'guide-audio',
        kind: 'audio',
        title: 'Quick Guide',
        description: '5-minute audio guide',
        sources: [
            { src: 'https://example.com/guide.mp3', type: 'audio/mpeg' }
        ]
    });
```

## Complete JSON Example

```json
{
  "id": "tutorial-playlist",
  "type": "Media",
  "content": {
    "title": "Tutorials",
    "intro": "Learn in a few minutes",
    "items": [
      {
        "id": "intro-video",
        "kind": "video",
        "title": "Introduction Video",
        "description": "Get started with our platform",
        "poster": "https://example.com/posters/intro.jpg",
        "autoplay": false,
        "loop": false,
        "controls": true,
        "sources": [
          {
            "src": "https://example.com/videos/intro.mp4",
            "type": "video/mp4"
          },
          {
            "src": "https://example.com/videos/intro.webm",
            "type": "video/webm"
          }
        ],
        "meta": {
          "duration": 300,
          "views": 1250
        }
      },
      {
        "id": "guide-audio",
        "kind": "audio",
        "title": "Quick Guide",
        "description": "5-minute audio guide",
        "autoplay": false,
        "loop": false,
        "controls": true,
        "sources": [
          {
            "src": "https://example.com/audio/guide.mp3",
            "type": "audio/mpeg"
          }
        ],
        "meta": {
          "duration": 300
        }
      },
      {
        "id": "advanced-tutorial",
        "kind": "video",
        "title": "Advanced Tutorial",
        "description": "Learn advanced features",
        "poster": "https://example.com/posters/advanced.jpg",
        "autoplay": false,
        "loop": false,
        "controls": true,
        "sources": [
          {
            "src": "https://example.com/videos/advanced.mp4",
            "type": "video/mp4"
          }
        ]
      }
    ]
  },
  "process": {
    "processId": "onboarding",
    "processName": "User Onboarding",
    "currentStep": 2,
    "totalSteps": 3
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

