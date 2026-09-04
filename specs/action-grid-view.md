# ActionGridView Component Specification

## Description

The `ActionGridView` component displays actions in a grid layout, ideal for dashboards, feature grids, or icon-based navigation. It supports configurable columns (1-6) and spacing between items.

When an action is selected, the mobile app POSTs the action code to `{service.baseUrl}/{viewId}` with the action code in the request body.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the action grid view |
| `type` | `string` | Yes | Always `"ActionGrid"` |
| `content` | `ActionGridContent` | Yes | Action grid content object |
| `content.title` | `string` | No | Optional title displayed above the action grid |
| `content.intro` | `string` | No | Optional introduction text displayed before the action grid |
| `content.actions` | `ActionConfig[]` | Yes | Array of actions (at least one required) |
| `content.actions[].code` | `string` | Yes | Unique action code (used in submission) |
| `content.actions[].title` | `string` | Yes | Action title displayed to user |
| `content.actions[].desc` | `string` | No | Optional description/subtitle |
| `content.actions[].thumbnail` | `string` | No | Optional thumbnail image URL |
| `content.actions[].disabled` | `boolean` | No | Whether the action is disabled (default: false) |
| `content.actions[].metadata` | `Record<string, unknown>` | No | Optional metadata for the action |
| `content.columns` | `number` | No | Number of columns (1-6, default: 2) |
| `content.spacing` | `number` | No | Spacing between items in pixels (default: 16) |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setTitle(title)` | `title` - Title text | `this` | Sets the title displayed above the action grid |
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the introduction text displayed before the action grid |
| `setColumns(columns)` | `columns` - Number of columns (1-6) | `this` | Sets the number of columns in the grid |
| `setSpacing(spacing)` | `spacing` - Spacing in pixels (>= 0) | `this` | Sets the spacing between grid items |
| `getColumns()` | - | `number` | Gets the current number of columns |
| `getSpacing()` | - | `number` | Gets the current spacing value |
| `addAction(code, title, description?, thumbnail?, disabled?, metadata?)` | `code` - Action code<br>`title` - Action title<br>`description` - Optional description<br>`thumbnail` - Optional image URL<br>`disabled` - Disabled flag<br>`metadata` - Optional metadata | `this` | Adds an action to the grid |
| `addActions(actions)` | `actions` - Array of action objects | `this` | Adds multiple actions at once |
| `removeAction(actionCode)` | `actionCode` - Action code to remove | `boolean` | Removes an action by code |
| `updateAction(actionCode, updates)` | `actionCode` - Action code<br>`updates` - Partial action updates | `boolean` | Updates an existing action |
| `getAction(actionCode)` | `actionCode` - Action code | `ActionConfig \| undefined` | Gets an action by code (inherited from BaseActionView) |
| `getActions()` | - | `ActionConfig[]` | Gets all actions (inherited from BaseActionView) |
| `getActiveActions()` | - | `ActionConfig[]` | Gets only active (non-disabled) actions (inherited from BaseActionView) |
| `getActionCount()` | - | `number` | Gets the number of actions (inherited from BaseActionView) |
| `hasAction(actionCode)` | `actionCode` - Action code | `boolean` | Checks if action exists (inherited from BaseActionView) |
| `hasActions()` | - | `boolean` | Checks if the grid has any actions |
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

### Basic Action Grid

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const actionGrid = yeriaApp
    .createActionGridView('dashboard', 'Dashboard')
    .setIntro('Choose an action from the grid below')
    .setColumns(2)
    .addAction('analytics', 'Analytics', 'View your statistics', 'analytics.png')
    .addAction('reports', 'Reports', 'Generate PDF reports', 'reports.png')
    .addAction('users', 'Users', 'Manage access', 'users.png')
    .addAction('payments', 'Payments', 'Track payments', 'payments.png');

const response = yeriaApp.serve(actionGrid);
```

### Action Grid with Custom Columns

```javascript
const actionGrid = yeriaApp
    .createActionGridView('features', 'Features')
    .setColumns(3)  // 3 columns
    .setSpacing(24)  // 24px spacing
    .addAction('feature-1', 'Feature 1', 'Description 1', 'feature1.png')
    .addAction('feature-2', 'Feature 2', 'Description 2', 'feature2.png')
    .addAction('feature-3', 'Feature 3', 'Description 3', 'feature3.png')
    .addAction('feature-4', 'Feature 4', 'Description 4', 'feature4.png')
    .addAction('feature-5', 'Feature 5', 'Description 5', 'feature5.png')
    .addAction('feature-6', 'Feature 6', 'Description 6', 'feature6.png');
```

### Single Column Grid

```javascript
const actionGrid = yeriaApp
    .createActionGridView('menu', 'Menu')
    .setColumns(1)  // Single column (vertical list)
    .addAction('item-1', 'Item 1', 'Description 1')
    .addAction('item-2', 'Item 2', 'Description 2')
    .addAction('item-3', 'Item 3', 'Description 3');
```

### Action Grid with Metadata

```javascript
const actionGrid = yeriaApp
    .createActionGridView('services', 'Services')
    .setColumns(2)
    .addAction(
        'service-1',
        'Service 1',
        'Premium service',
        'service1.png',
        false,
        { badge: 'Popular', price: '$99' }
    )
    .addAction(
        'service-2',
        'Service 2',
        'Basic service',
        'service2.png',
        false,
        { price: '$49' }
    );
```

### Action Grid with Disabled Actions

```javascript
const actionGrid = yeriaApp
    .createActionGridView('features', 'Features')
    .setColumns(2)
    .addAction('feature-1', 'Feature 1', 'Available', 'feature1.png')
    .addAction('feature-2', 'Feature 2', 'Coming soon', 'feature2.png', true)
    .addAction('feature-3', 'Feature 3', 'Available', 'feature3.png')
    .addAction('feature-4', 'Feature 4', 'Coming soon', 'feature4.png', true);
```

### Dynamic Action Grid Management

```javascript
const actionGrid = yeriaApp
    .createActionGridView('dashboard', 'Dashboard')
    .setColumns(2)
    .addAction('item-1', 'Item 1', 'Description 1')
    .addAction('item-2', 'Item 2', 'Description 2')
    .addAction('item-3', 'Item 3', 'Description 3');

// Get current columns
const columns = actionGrid.getColumns();  // Returns 2

// Get current spacing
const spacing = actionGrid.getSpacing();  // Returns 16

// Update an action
actionGrid.updateAction('item-2', {
    title: 'Updated Item 2',
    desc: 'Updated description',
    disabled: true
});

// Remove an action
actionGrid.removeAction('item-3');

// Check if has actions
const hasActions = actionGrid.hasActions();  // Returns true
```

### Action Grid with Multiple Actions

```javascript
const actionGrid = yeriaApp
    .createActionGridView('services', 'Our Services')
    .setColumns(3)
    .addActions([
        {
            code: 'service-1',
            title: 'Service 1',
            description: 'Description 1',
            thumbnail: 'service1.png'
        },
        {
            code: 'service-2',
            title: 'Service 2',
            description: 'Description 2',
            thumbnail: 'service2.png'
        },
        {
            code: 'service-3',
            title: 'Service 3',
            description: 'Description 3',
            thumbnail: 'service3.png'
        },
        {
            code: 'service-4',
            title: 'Service 4',
            description: 'Description 4',
            thumbnail: 'service4.png'
        }
    ]);
```

### Action Grid in Process Workflow

```javascript
const actionGrid = yeriaApp
    .createActionGridView('onboarding-options', 'Get Started')
    .setProcess('onboarding', {
        processName: 'User Onboarding',
        currentStep: 1,
        totalSteps: 3
    })
    .setColumns(2)
    .addAction('quick-start', 'Quick Start', 'Get started quickly')
    .addAction('guided-tour', 'Guided Tour', 'Take a guided tour')
    .addAction('custom-setup', 'Custom Setup', 'Customize your setup')
    .addAction('skip', 'Skip', 'Skip for now');
```

## Complete JSON Example

```json
{
  "id": "dashboard",
  "type": "ActionGrid",
  "content": {
    "title": "Dashboard",
    "intro": "Choose an action to get started",
    "actions": [
      {
        "code": "analytics",
        "title": "Analytics",
        "desc": "View your statistics",
        "thumbnail": "https://example.com/icons/analytics.png",
        "disabled": false,
        "metadata": {
          "category": "reports"
        }
      },
      {
        "code": "reports",
        "title": "Reports",
        "desc": "Generate PDF reports",
        "thumbnail": "https://example.com/icons/reports.png",
        "disabled": false,
        "metadata": {
          "category": "reports"
        }
      },
      {
        "code": "users",
        "title": "Users",
        "desc": "Manage access",
        "thumbnail": "https://example.com/icons/users.png",
        "disabled": false,
        "metadata": {
          "category": "management"
        }
      },
      {
        "code": "payments",
        "title": "Payments",
        "desc": "Track payments",
        "thumbnail": "https://example.com/icons/payments.png",
        "disabled": true,
        "metadata": {
          "category": "finance"
        }
      }
    ],
    "columns": 2,
    "spacing": 16
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

