# Yeria SDK Demo Application

A comprehensive demonstration application showcasing all features of the Yeria SDK - a modern TypeScript SDK for generating dynamic JSON interfaces.

## 🚀 Features Demonstrated

### 📝 Forms
- **User Registration** - All field types (text, email, password, date, select, etc.)
- **Contact Form** - Simple validation and multiline text
- **Survey Form** - Multiple choice and rating fields
- **Payment Form** - Secure input with patterns and validation
- **Profile Update** - Pre-filled forms with existing data
- **Advanced Validation** - Complex validation rules and dependencies
- **File Upload** - Multiple file types with size limits
- **Location Capture** - GPS coordinates and address fields

### 📖 Data Readers
- **User Profile** - Display user information in read-only format
- **Product Details** - Structured product information
- **Invoice Reader** - Financial document display
- **Report Viewer** - Business metrics and KPIs
- **Settings Display** - Configuration overview
- **Transaction Details** - Payment history display

### 🎯 Actions
- **Main Menu** - Navigation list with icons
- **Dashboard Grid** - Icon grid layout for quick access
- **Services Catalog** - Product/service showcase
- **Quick Actions** - Compact action buttons
- **Admin Panel** - Advanced actions with metadata
- **App Launcher** - Application grid interface

### 📱 QR Codes
- **QR Scanner** - Scan QR codes for data retrieval
- **QR Display** - Generate and display QR codes
- **Product Scanner** - Inventory and shopping features
- **Ticket Display** - Event tickets and boarding passes
- **Multi Scanner** - Sequential QR code scanning
- **Batch Display** - Multiple QR codes at once

### 💬 Messages
- **Welcome Messages** - Onboarding and introduction
- **Notifications** - Success, info, warning, error types
- **Alert Messages** - Critical alerts requiring action
- **Tutorial Guide** - Step-by-step instructions
- **Terms & Conditions** - Legal documents and agreements
- **Feedback Request** - User feedback collection

### 📊 Data Views
- **Analytics Dashboard** - Charts, metrics, and KPIs
- **Financial Report** - Tables and financial data
- **User Profile Card** - Rich profile visualization
- **Statistics View** - Complex data with charts
- **Activity Timeline** - Chronological event display
- **Comparison Chart** - Side-by-side comparisons

### 🔒 Security Features
- **Signed Forms** - Ed25519 cryptographic signatures
- **Signature Verification** - Verify data authenticity
- **Encrypted Data** - Secure data handling
- **Audit Logs** - Security event tracking
- **Security Config** - Configuration management
- **Public Key Info** - Key management and rotation

## 🛠️ Installation

### Prerequisites
- Node.js 16+ 
- npm or yarn
- TypeScript 5+

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yeria/demo-app.git
cd demo-app
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Build the TypeScript code:
```bash
npm run build
```

5. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### Forms
- `GET /api/forms` - List all form demos
- `GET /api/forms/:formId` - Get specific form JSON
- `POST /api/forms/submit/:formId` - Submit form data

#### Readers
- `GET /api/readers` - List all reader demos
- `GET /api/readers/:readerId` - Get specific reader JSON

#### Actions
- `GET /api/actions` - List all action demos
- `GET /api/actions/:actionId` - Get specific action JSON
- `POST /api/actions/execute/:actionId` - Execute action

#### QR Codes
- `GET /api/qr` - List all QR demos
- `GET /api/qr/scan/auto` - QRScanView with auto-submission (no preview, no button)
- `POST /api/qr/scan/auto` - Handles the auto-submitted scan
- `GET /api/qr/scan/preview` - QRScanView with a read-only preview and a confirm button
- `POST /api/qr/scan/preview` - Handles the confirmed scan
- `GET /api/qr/display` - QRDisplayView with a QR code served as base64 PNG

#### Messages
- `GET /api/messages` - List all message demos
- `GET /api/messages/:messageId` - Get specific message JSON
- `POST /api/messages/acknowledge/:messageId` - Acknowledge message

#### Data Views
- `GET /api/data` - List all data view demos
- `GET /api/data/:dataId` - Get specific data view JSON
- `GET /api/data/export/:dataId` - Export data

#### Security
- `GET /api/secure` - List all security demos
- `GET /api/secure/:featureId` - Get specific security feature
- `POST /api/secure/verify` - Verify signatures

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## 🏗️ Project Structure

```
demo-app/
├── src/
│   ├── server.ts           # Express server setup
│   ├── routes/
│   │   ├── forms.ts        # Form demonstrations
│   │   ├── readers.ts      # Reader demonstrations
│   │   ├── actions.ts      # Action demonstrations
│   │   ├── qr.ts          # QR code demonstrations
│   │   ├── messages.ts    # Message demonstrations
│   │   ├── data.ts        # Data view demonstrations
│   │   └── secure.ts      # Security demonstrations
│   └── utils/             # Utility functions
├── public/
│   ├── index.html         # Web interface
│   ├── css/              # Stylesheets
│   └── js/               # Client scripts
├── tests/                # Test files
├── package.json
├── tsconfig.json
└── README.md
```

## 💡 Usage Examples

### Creating a Form

```typescript
import { FormBuilder } from '@numerum-tech/yeriasdk';

const form = new FormBuilder('my-form', 'My Form')
  .addTextField('name', 'Full Name', true, 100)
  .addEmailField('email', 'Email', true)
  .submission('Submit', 'POST', '/api/submit')
  .build();

console.log(form.toJSON());
```

### Creating an Action Grid

```typescript
import { ActionGridBuilder } from '@numerum-tech/yeriasdk';

const grid = new ActionGridBuilder('dashboard', 'Dashboard')
  .setColumns(3)
  .addAction('users', 'Users', 'Manage users', '👥')
  .addAction('settings', 'Settings', 'Configure app', '⚙️')
  .build();

console.log(grid.toJSON());
```

### Creating a Secure View

```typescript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const app = new YeriaApp({
  appId: 'my-app',
  enableAudit: true
});

const form = app.createFormView('secure-form', 'Secure Form');
const signed = app.getSignedView(form);

console.log(signed); // Includes Ed25519 signature
```

## 🔧 Configuration

### Environment Variables

```env
PORT=3000
NODE_ENV=development
API_BASE_URL=http://localhost:3000
ENABLE_CORS=true
LOG_LEVEL=debug
YERIA_ID=demo-app
```

### SDK Configuration

```typescript
const config = {
  appId: 'demo-app',
  allowedDomains: ['localhost'],
  maxViewsPerRequest: 100,
  viewExpirationMinutes: 60,
  enableAudit: true
};
```

## 📝 License

Apache License 2.0 - see the LICENSE and NOTICE files for details. Copyright 2026 Numerum.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## 🆘 Support

- Documentation: [https://docs.yeria.io](https://docs.yeria.io)
- Issues: [GitHub Issues](https://github.com/yeria/demo-app/issues)
- Discord: [Join our community](https://discord.gg/yeria)

## 🙏 Acknowledgments

Built with:
- [Yeria SDK](https://github.com/yeria-app/yeriasdk)
- [Express.js](https://expressjs.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

Made with ❤️ by Numerum