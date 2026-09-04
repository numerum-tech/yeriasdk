# ReaderView Component Specification

## Description

The `ReaderView` component is used to display rich, structured content for reading. It supports various content elements including paragraphs, images, markdown content, lists, links, tables, code blocks, quotes, and custom elements. All HTML content is sanitized to prevent XSS attacks.

## Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the reader view |
| `type` | `string` | Yes | Always `"Reader"` |
| `content` | `ReaderContent` | Yes | Reader content object |
| `content.title` | `string` | Yes | Title of the reader view |
| `content.intro` | `string` | No | Introduction text displayed before elements |
| `content.elements` | `ReaderElement[]` | Yes | Array of content elements (at least one required) |
| `content.elements[].type` | `string` | Yes | Element type: `"paragraph"`, `"subtitle"`, `"image"`, `"markdown"`, `"list"`, `"link"`, `"table"`, `"code"`, `"quote"`, `"separator"`, `"custom"` |
| `content.elements[].text` | `string` | Yes* | Text content (for paragraph, subtitle) |
| `content.elements[].url` | `string` | Yes* | URL (for image, link) |
| `content.elements[].alt` | `string` | No | Alt text for images |
| `content.elements[].caption` | `string` | No | Caption for images |
| `content.elements[].pages` | `MarkdownPage[]` | Yes* | Markdown pages (for markdown type) |
| `content.elements[].pages[].content` | `string` | Yes | Sanitized HTML content |
| `content.elements[].pages[].raw` | `string` | Yes | Original markdown text |
| `content.elements[].pages[].sanitized` | `boolean` | Yes | Whether content was sanitized |
| `content.elements[].items` | `string[]` | Yes* | List items (for list type) |
| `content.elements[].ordered` | `boolean` | No | Whether list is ordered (default: false) |
| `content.elements[].description` | `string` | No | Description for links |
| `content.elements[].headers` | `string[]` | Yes* | Table headers (for table type) |
| `content.elements[].rows` | `string[][]` | Yes* | Table rows (for table type) |
| `content.elements[].code` | `string` | Yes* | Code content (for code type) |
| `content.elements[].language` | `string` | No | Programming language for code blocks |
| `content.elements[].author` | `string` | No | Quote author |
| `content.elements[].source` | `string` | No | Quote source |
| `content.elements[].kind` | `string` | Yes* | Custom element kind (for custom type) |
| `content.elements[].data` | `Record<string, unknown>` | Yes* | Custom element data (for custom type) |
| `processId` | `string` | No | Process identifier for multi-step workflows |
| `metadata` | `object` | No | View metadata (version, createdAt, author, tags) |

## Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `setIntro(intro)` | `intro` - Introduction text | `this` | Sets the introduction text displayed before elements |
| `addParagraph(text)` | `text` - Paragraph text | `this` | Adds a paragraph element |
| `addSubTitle(text)` | `text` - Subtitle text | `this` | Adds a subtitle element |
| `addImage(url, alt?, caption?)` | `url` - Image URL<br>`alt` - Alt text<br>`caption` - Image caption | `this` | Adds an image element |
| `addMarkdown(markdownText, options?)` | `markdownText` - Markdown content<br>`options` - Options (sanitize) | `this` | Adds markdown content (sanitized by default) |
| `addListField(items, ordered?)` | `items` - Array of strings<br>`ordered` - Ordered list flag | `this` | Adds a list element (ordered or unordered) |
| `addLink(url, text, description?)` | `url` - Link URL<br>`text` - Link text<br>`description` - Optional description | `this` | Adds a link element |
| `addTable(headers, rows)` | `headers` - Array of header strings<br>`rows` - Array of row arrays | `this` | Adds a table element |
| `addCodeBlock(code, language?)` | `code` - Code content<br>`language` - Programming language | `this` | Adds a code block element |
| `addQuote(text, author?, source?)` | `text` - Quote text<br>`author` - Quote author<br>`source` - Quote source | `this` | Adds a quote element |
| `addSeparator()` | - | `this` | Adds a separator element |
| `addCustomElement(type, data)` | `type` - Element type<br>`data` - Element data object | `this` | Adds a custom element |
| `getElementsByType(type)` | `type` - Element type | `ReaderElement[]` | Gets all elements of a specific type |
| `removeElement(index)` | `index` - Element index | `boolean` | Removes an element by index |
| `insertElement(index, element)` | `index` - Insert position<br>`element` - ReaderElement | `boolean` | Inserts an element at a specific index |
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

### Basic Reader View

```javascript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const reader = yeriaApp
    .createReaderView('welcome', 'Welcome to Our App')
    .setIntro('Discover our key features')
    .addParagraph('YeriaApp allows you to generate dynamic screens from the backend.')
    .addSubTitle('Key Features')
    .addListField([
        'Dynamic forms with validation',
        'Rich reading views',
        'Ed25519 signatures for integrity'
    ]);

const response = yeriaApp.serve(reader);
```

### Reader View with Images

```javascript
const reader = yeriaApp
    .createReaderView('product-info', 'Product Information')
    .setIntro('Learn about our featured product')
    .addImage('https://example.com/product.jpg', 'Product Image', 'Our featured product')
    .addParagraph('This product features advanced technology and modern design.')
    .addSubTitle('Specifications')
    .addListField([
        'High-performance processor',
        'Long battery life',
        'Modern design'
    ], true);
```

### Reader View with Markdown

```javascript
const reader = yeriaApp
    .createReaderView('article', 'Article Title')
    .setIntro('Read our latest article')
    .addMarkdown(`
# Introduction

This is a **markdown** article with *formatting*.

## Features

- Feature 1
- Feature 2
- Feature 3

[Learn more](https://example.com)
    `, { sanitize: true });
```

### Reader View with Table

```javascript
const reader = yeriaApp
    .createReaderView('pricing', 'Pricing Plans')
    .setIntro('Choose the plan that fits your needs')
    .addTable(
        ['Plan', 'Price', 'Features'],
        [
            ['Basic', '$9/month', '5 projects'],
            ['Pro', '$29/month', 'Unlimited projects'],
            ['Enterprise', 'Custom', 'Custom features']
        ]
    );
```

### Reader View with Code Block

```javascript
const reader = yeriaApp
    .createReaderView('tutorial', 'Code Tutorial')
    .setIntro('Learn how to use our API')
    .addCodeBlock(
        `function greet(name) {
    return \`Hello, \${name}!\`;
}`,
        'javascript'
    )
    .addParagraph('This function greets a user by name.');
```

### Reader View with Quote

```javascript
const reader = yeriaApp
    .createReaderView('testimonial', 'Customer Testimonial')
    .setIntro('What our customers say')
    .addQuote(
        'This product has transformed how we work.',
        'John Doe',
        'CEO, Company Inc.'
    );
```

### Reader View with Links

```javascript
const reader = yeriaApp
    .createReaderView('resources', 'Helpful Resources')
    .setIntro('External resources you might find useful')
    .addLink('https://example.com/docs', 'Documentation', 'Complete API documentation')
    .addLink('https://example.com/support', 'Support', 'Get help from our team')
    .addSeparator()
    .addParagraph('For more information, contact us.');
```

### Reader View with Custom Elements

```javascript
const reader = yeriaApp
    .createReaderView('custom-content', 'Custom Content')
    .setIntro('Custom content display')
    .addCustomElement('chart', {
        type: 'bar',
        data: [10, 20, 30, 40],
        labels: ['Q1', 'Q2', 'Q3', 'Q4']
    })
    .addCustomElement('widget', {
        widgetId: 'weather',
        location: 'Paris'
    });
```

### Complex Reader View

```javascript
const reader = yeriaApp
    .createReaderView('guide', 'User Guide')
    .setIntro('Welcome to our comprehensive guide')
    .addSubTitle('Getting Started')
    .addParagraph('Follow these steps to get started.')
    .addListField([
        'Create an account',
        'Verify your email',
        'Complete your profile'
    ])
    .addSeparator()
    .addSubTitle('Advanced Features')
    .addMarkdown(`
### Feature 1

Description of feature 1.

### Feature 2

Description of feature 2.
    `)
    .addImage('https://example.com/diagram.png', 'Architecture Diagram')
    .addSeparator()
    .addLink('https://example.com/contact', 'Need Help?', 'Contact our support team');
```

## Complete JSON Example

```json
{
  "id": "user-guide",
  "type": "Reader",
  "content": {
    "title": "User Guide",
    "intro": "Welcome to our comprehensive guide",
    "elements": [
      {
        "type": "subtitle",
        "text": "Getting Started"
      },
      {
        "type": "paragraph",
        "text": "Follow these steps to get started with our application."
      },
      {
        "type": "list",
        "items": [
          "Create an account",
          "Verify your email",
          "Complete your profile",
          "Start using the app"
        ],
        "ordered": false
      },
      {
        "type": "separator"
      },
      {
        "type": "subtitle",
        "text": "Advanced Features"
      },
      {
        "type": "markdown",
        "content": "### Feature 1\n\nDescription of feature 1.\n\n### Feature 2\n\nDescription of feature 2."
      },
      {
        "type": "image",
        "src": "https://example.com/diagram.png",
        "alt": "Architecture Diagram",
        "caption": "System Architecture"
      },
      {
        "type": "table",
        "headers": ["Feature", "Status", "Version"],
        "rows": [
          ["Feature A", "Active", "1.0"],
          ["Feature B", "Beta", "0.9"],
          ["Feature C", "Planned", "TBD"]
        ]
      },
      {
        "type": "code",
        "language": "javascript",
        "code": "function example() {\n  return 'Hello World';\n}"
      },
      {
        "type": "quote",
        "text": "This is an important quote",
        "author": "John Doe"
      },
      {
        "type": "link",
        "href": "https://example.com/contact",
        "text": "Need Help?",
        "description": "Contact our support team"
      }
    ]
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2025-01-28T10:00:00.000Z"
  }
}
```

