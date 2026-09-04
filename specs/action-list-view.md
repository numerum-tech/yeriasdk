# ActionListView Component Specification

## Description

The `ActionListView` component displays a vertical list of action items. Each action can have a title, description, thumbnail image, and optional metadata. Actions are typically used for navigation menus, feature lists, or command centers.

When an action is selected, the mobile app POSTs the action code to `{service.baseUrl}/{viewId}` with the action code in the request body.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the action list view |
| `type` | `string` | Yes | Always `"ActionList"` |
| `content` | `ActionListContent` | Yes | Action list content object |
| `content.title` | `string` | No | Optional title displayed above the action list |
| `content.intro` | `string` | No | Optional introduction text displayed before the action list |
| `content.actions` | `ActionConfig[]` | Yes | Array of actions (at least one required) |
| `content.actions[].code` | `string` | Yes | Unique action code (used in submission) |
| `content.actions[].title` | `string` | Yes | Action title displayed to user |
| `content.actions[].desc` | `string` | No | Optional description/subtitle |
| `content.actions[].thumbnail` | `string` | No | Optional thumbnail image URL |
| `content.actions[].disabled` | `boolean` | No | Whether the action is disabled (default: false) |
| `content.actions[].metadata` | `Record<string, unknown>` | No | Optional metadata for the action |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setTitle(title)` | `title` - Title text | `this` | Sets the title displayed above the action list |
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the introduction text displayed before the action list |
| `addAction(code, title, description?, thumbnail?, disabled?, metadata?)` | `code` - Action code<br>`title` - Action title<br>`description` - Optional description<br>`thumbnail` - Optional image URL<br>`disabled` - Disabled flag<br>`metadata` - Optional metadata | `this` | Adds an action to the list |
| `addActions(actions)` | `actions` - Array of action objects | `this` | Adds multiple actions at once |
| `removeAction(actionCode)` | `actionCode` - Action code to remove | `boolean` | Removes an action by code |
| `updateAction(actionCode, updates)` | `actionCode` - Action code<br>`updates` - Partial action updates | `boolean` | Updates an existing action |
| `getAction(actionCode)` | `actionCode` - Action code | `ActionConfig \| undefined` | Gets an action by code (inherited from BaseActionView) |
| `getActions()` | - | `ActionConfig[]` | Gets all actions (inherited from BaseActionView) |
| `getActiveActions()` | - | `ActionConfig[]` | Gets only active (non-disabled) actions (inherited from BaseActionView) |
| `getActionCount()` | - | `number` | Gets the number of actions (inherited from BaseActionView) |
| `hasAction(actionCode)` | `actionCode` - Action code | `boolean` | Checks if action exists (inherited from BaseActionView) |
| `hasActions()` | - | `boolean` | Checks if the list has any actions |
| `filterActions(predicate)` | `predicate` - Filter function | `ActionConfig[]` | Filters actions by predicate (inherited from BaseActionView) |
| `sortActions(compareFn)` | `compareFn` - Comparison function | `this` | Sorts actions by custom function (inherited from BaseActionView) |
| `sortByTitle(ascending?)` | `ascending` - Sort order (default: true) | `this` | Sorts actions alphabetically by title (inherited from BaseActionView) |
| `disableAllActions()` | - | `this` | Disables all actions (inherited from BaseActionView) |
| `enableAllActions()` | - | `this` | Enables all actions (inherited from BaseActionView) |
| `clearActions()` | - | `void` | Removes all actions (inherited from BaseActionView) |
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

### Basic Action List

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const actionList = yeriaApp
    .createActionListView('main-menu', 'Main Menu')
    .setIntro('Select an option from the menu below')
    .addAction('profile', 'My Profile', 'View your personal information', 'profile-icon.png')
    .addAction('settings', 'Settings', 'Configure the application', 'settings-icon.png')
    .addAction('support', 'Support', 'Contact us', 'support-icon.png');

const response = yeriaApp.serve(actionList);
```

### Action List with Metadata

```javascript
const actionList = yeriaApp
    .createActionListView('dashboard', 'Dashboard')
    .addAction(
        'analytics',
        'Analytics',
        'View your statistics',
        'analytics.png',
        false,
        { badge: 'New', category: 'reports' }
    )
    .addAction(
        'reports',
        'Reports',
        'Generate PDF reports',
        'reports.png',
        false,
        { category: 'reports' }
    )
    .addAction(
        'users',
        'Users',
        'Manage access',
        'users.png',
        false,
        { category: 'administration' }
    );
```

### Action List with Disabled Actions

```javascript
const actionList = yeriaApp
    .createActionListView('features', 'Features')
    .addAction('feature-1', 'Feature 1', 'Available feature')
    .addAction('feature-2', 'Feature 2', 'Coming soon', undefined, true)
    .addAction('feature-3', 'Feature 3', 'Available feature');
```

### Dynamic Action List Management

```javascript
const actionList = yeriaApp
    .createActionListView('menu', 'Menu')
    .addAction('item-1', 'Item 1', 'Description 1')
    .addAction('item-2', 'Item 2', 'Description 2')
    .addAction('item-3', 'Item 3', 'Description 3');

// Update an action
actionList.updateAction('item-2', {
    title: 'Updated Item 2',
    desc: 'Updated description',
    disabled: true
});

// Remove an action
actionList.removeAction('item-3');

// Get actions
const actions = actionList.getActions();
const activeActions = actionList.getActiveActions();
```

### Action List with Multiple Actions

```javascript
const actionList = yeriaApp
    .createActionListView('services', 'Our Services')
    .addActions([
        {
            code: 'service-1',
            title: 'Service 1',
            description: 'Description of service 1',
            thumbnail: 'service1.png'
        },
        {
            code: 'service-2',
            title: 'Service 2',
            description: 'Description of service 2',
            thumbnail: 'service2.png'
        },
        {
            code: 'service-3',
            title: 'Service 3',
            description: 'Description of service 3',
            thumbnail: 'service3.png'
        }
    ]);
```

### Action List in Process Workflow

```javascript
const actionList = yeriaApp
    .createActionListView('onboarding-menu', 'Get Started')
    .setProcess('onboarding', {
        processName: 'User Onboarding',
        currentStep: 1,
        totalSteps: 3
    })
    .addAction('step-1', 'Complete Profile', 'Fill in your personal information')
    .addAction('step-2', 'Verify Email', 'Confirm your email address')
    .addAction('step-3', 'Set Preferences', 'Customize your experience');
```

### Sorted Action List

```javascript
const actionList = yeriaApp
    .createActionListView('alphabetical-menu', 'Menu')
    .addAction('zebra', 'Zebra', 'Z item')
    .addAction('apple', 'Apple', 'A item')
    .addAction('banana', 'Banana', 'B item')
    .sortByTitle(true);  // Sort alphabetically
```

## Complete JSON Example

```json
{
  "id": "main-menu",
  "type": "ActionList",
  "content": {
    "title": "Main Menu",
    "intro": "Select an option from the menu below",
    "actions": [
      {
        "code": "profile",
        "title": "My Profile",
        "desc": "View your personal information",
        "thumbnail": "https://example.com/icons/profile.png",
        "disabled": false,
        "metadata": {
          "category": "account"
        }
      },
      {
        "code": "settings",
        "title": "Settings",
        "desc": "Configure the application",
        "thumbnail": "https://example.com/icons/settings.png",
        "disabled": false,
        "metadata": {
          "category": "preferences"
        }
      },
      {
        "code": "support",
        "title": "Support",
        "desc": "Contact us for help",
        "thumbnail": "https://example.com/icons/support.png",
        "disabled": false,
        "metadata": {
          "category": "help"
        }
      }
    ]
  },
  "process": {
    "processId": "onboarding",
    "processName": "User Onboarding",
    "currentStep": 1,
    "totalSteps": 3,
    "stepName": "Main Menu",
    "canGoBack": false,
    "canSkip": false
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

