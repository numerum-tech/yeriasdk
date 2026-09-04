# TimelineView Component Specification

## Description

The `TimelineView` component captures chronological progress such as onboarding steps, activity feeds, or process tracking. It displays a series of events in chronological order with status indicators (pending, active, completed, error).

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the timeline view |
| `type` | `string` | Yes | Always `"Timeline"` |
| `content` | `TimelineContent` | Yes | Timeline content object |
| `content.title` | `string` | Yes | Timeline title |
| `content.intro` | `string` | No | Introduction text displayed before timeline items |
| `content.items` | `TimelineItem[]` | Yes | Array of timeline items (at least one required) |
| `content.items[].id` | `string` | Yes | Unique identifier for the timeline item |
| `content.items[].title` | `string` | Yes | Item title |
| `content.items[].timestamp` | `string` | Yes | Timestamp (ISO 8601 format recommended) |
| `content.items[].description` | `string` | No | Optional description |
| `content.items[].status` | `string` | No | Status: `"pending"`, `"active"`, `"completed"`, `"error"` |
| `content.items[].icon` | `string` | No | Optional icon identifier |
| `content.items[].meta` | `Record<string, unknown>` | No | Optional metadata |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the introduction text displayed before timeline items |
| `addItem(item)` | `item` - TimelineItem object | `this` | Adds a fully configured timeline entry |
| `addEvent(id, title, timestamp, options?)` | `id` - Event ID<br>`title` - Event title<br>`timestamp` - ISO timestamp<br>`options` - Event options (description, status, icon) | `this` | Convenience method to add an event |
| `setItems(items)` | `items` - Array of TimelineItem objects | `this` | Replaces all timeline items |
| `clearItems()` | - | `this` | Removes all timeline items |
| `getContent()` | - | `TimelineContent` | Returns the complete timeline content object |
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

### Basic Timeline

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const timeline = yeriaApp
    .createTimelineView('onboarding', 'Your Progress')
    .setIntro('Follow the validation steps')
    .addEvent('step-1', 'Account Created', new Date().toISOString(), { status: 'completed' })
    .addEvent('step-2', 'Documents Sent', '2025-01-15T12:00:00Z', { status: 'active' })
    .addEvent('step-3', 'Final Validation', '2025-01-20T09:00:00Z', { status: 'pending' });

const response = yeriaApp.serve(timeline);
```

### Timeline with Full Item Objects

```javascript
const timeline = yeriaApp
    .createTimelineView('activity', 'Activity Feed')
    .setIntro('Recent activity')
    .addItem({
        id: 'event-1',
        title: 'Order Placed',
        timestamp: '2025-01-15T10:00:00Z',
        description: 'Your order #12345 has been placed',
        status: 'completed',
        icon: 'check'
    })
    .addItem({
        id: 'event-2',
        title: 'Order Shipped',
        timestamp: '2025-01-16T14:30:00Z',
        description: 'Your order has been shipped',
        status: 'completed',
        icon: 'truck'
    })
    .addItem({
        id: 'event-3',
        title: 'Out for Delivery',
        timestamp: '2025-01-17T08:00:00Z',
        description: 'Your order is out for delivery',
        status: 'active',
        icon: 'delivery'
    });
```

### Timeline with Different Statuses

```javascript
const timeline = yeriaApp
    .createTimelineView('process', 'Process Status')
    .setIntro('Track your process')
    .addEvent('step-1', 'Step 1', '2025-01-01T00:00:00Z', { 
        status: 'completed',
        description: 'Step 1 completed successfully'
    })
    .addEvent('step-2', 'Step 2', '2025-01-02T00:00:00Z', { 
        status: 'active',
        description: 'Currently processing step 2'
    })
    .addEvent('step-3', 'Step 3', '2025-01-03T00:00:00Z', { 
        status: 'pending',
        description: 'Waiting to start step 3'
    })
    .addEvent('step-4', 'Step 4', '2025-01-04T00:00:00Z', { 
        status: 'error',
        description: 'Error occurred in step 4'
    });
```

### Timeline Clearing and Replacing Items

```javascript
const timeline = yeriaApp
    .createTimelineView('dynamic-timeline', 'Dynamic Timeline')
    .addEvent('event-1', 'Event 1', '2025-01-01T00:00:00Z')
    .addEvent('event-2', 'Event 2', '2025-01-02T00:00:00Z');

// Clear all items
timeline.clearItems();

// Set new items
timeline.setItems([
    {
        id: 'new-event-1',
        title: 'New Event 1',
        timestamp: '2025-01-10T00:00:00Z',
        status: 'completed'
    },
    {
        id: 'new-event-2',
        title: 'New Event 2',
        timestamp: '2025-01-11T00:00:00Z',
        status: 'active'
    }
]);
```

### Timeline in Process Workflow

```javascript
const timeline = yeriaApp
    .createTimelineView('onboarding-timeline', 'Onboarding Progress')
    .setProcess('onboarding', {
        processName: 'User Onboarding',
        currentStep: 2,
        totalSteps: 4
    })
    .setIntro('Complete these steps to get started')
    .addEvent('profile', 'Complete Profile', '2025-01-01T00:00:00Z', { 
        status: 'completed',
        description: 'Profile information completed'
    })
    .addEvent('verification', 'Verify Email', '2025-01-02T00:00:00Z', { 
        status: 'active',
        description: 'Please verify your email address'
    })
    .addEvent('preferences', 'Set Preferences', '2025-01-03T00:00:00Z', { 
        status: 'pending',
        description: 'Customize your preferences'
    })
    .addEvent('tutorial', 'Complete Tutorial', '2025-01-04T00:00:00Z', { 
        status: 'pending',
        description: 'Learn how to use the app'
    });
```

## Complete JSON Example

```json
{
  "id": "onboarding-progress",
  "type": "Timeline",
  "content": {
    "title": "Onboarding Progress",
    "intro": "Complete these steps to get started",
    "items": [
      {
        "id": "profile",
        "title": "Complete Profile",
        "timestamp": "2025-01-01T00:00:00Z",
        "description": "Profile information completed",
        "status": "completed",
        "icon": "check",
        "meta": {
          "completedAt": "2025-01-01T10:30:00Z"
        }
      },
      {
        "id": "verification",
        "title": "Verify Email",
        "timestamp": "2025-01-02T00:00:00Z",
        "description": "Please verify your email address",
        "status": "active",
        "icon": "mail"
      },
      {
        "id": "preferences",
        "title": "Set Preferences",
        "timestamp": "2025-01-03T00:00:00Z",
        "description": "Customize your preferences",
        "status": "pending",
        "icon": "settings"
      },
      {
        "id": "tutorial",
        "title": "Complete Tutorial",
        "timestamp": "2025-01-04T00:00:00Z",
        "description": "Learn how to use the app",
        "status": "pending",
        "icon": "book"
      }
    ]
  },
  "process": {
    "processId": "onboarding",
    "processName": "User Onboarding",
    "currentStep": 2,
    "totalSteps": 4
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

