> **Note**: This is the JavaScript/TypeScript port of the Yeria SDK. This repository is a monorepo containing multiple language implementations. See the [root README](../README.md) for an overview.


Un SDK TypeScript moderne et optimisé pour générer des interfaces JSON dynamiques, avec support avancé pour les formulaires, la lecture de données, les actions, les QR codes, les messages et l'affichage de données.

🌐 Site web : [yeria.app](https://yeria.app)
📱 Application Android : [Yeria sur Google Play](https://play.google.com/store/apps/details?id=com.numerum.yeria.app) — le client qui affiche ces vues.

## 🚀 Fonctionnalités

- **Formulaires dynamiques** avec validation avancée
- **Lecteurs de données** pour afficher des informations
- **Listes d'actions** pour les menus et navigation
- **Grilles d'actions** pour les tableaux de bord
- **Scanner de QR codes** avec configuration flexible
- **Affichage de QR codes** avec validation d'images
- **Messages** pour les notifications et guides
- **Vues de données** pour l'affichage de contenu structuré
- **Cartes détaillées** pour présenter des fiches produit
- **Carrousels** pour mettre en avant plusieurs contenus
- **Timelines** pour les historiques ou étapes
- **Médias** audio/vidéo intégrés
- **Cartes interactives** pour localiser des points clés
- **Notifications** pour envoyer des messages signés aux utilisateurs via la plateforme Yeria
- **API fluide** grâce au chaînage des méthodes
- **Validation robuste** avec règles personnalisables
- **Logging structuré** pour le débogage
- **TypeScript strict** pour la sécurité des types
- **Tests complets** avec Jest

## 📦 Installation

```bash
npm install @numerum-tech/yeriasdk
```

## 🎯 Utilisation Rapide

> **⚠️ Note Importante** :
> - **FormView** : Pour créer des formulaires interactifs avec collecte de données
> - **ReaderView** : Pour afficher du contenu riche en lecture seule (articles, guides, etc.)
> - Ces deux types de vues ont des API complètement différentes !

### Liens vers Yeria

`YeriaLink` génère uniquement des liens canoniques. Le format HTTPS est
recommandé par défaut : il fonctionne sur le web et ouvre l’application lorsque
les App Links / Universal Links sont configurés.

```typescript
import { CardView, ReaderView, YeriaLink } from '@numerum-tech/yeriasdk';

const chatUrl = YeriaLink.chat('catalog-service');
// https://yeria.app/dl/c/catalog-service

const componentUrl = YeriaLink.component(
  'catalog-service',
  '/orders?mode=edit'
);

const reader = new ReaderView('links', 'Liens utiles')
  .addLink(chatUrl, 'Ouvrir le chat');

const card = new CardView('order', 'Commande')
  .setDescription('Consulter ou modifier cette commande')
  .addAction('Modifier', 'GET', { href: componentUrl });

// Pour une application qui sait déjà que Yeria est installée :
const compactUrl = YeriaLink.pin('catalog-service', { format: 'yeria' });
// yeria://dl/p/catalog-service
```

Méthodes disponibles : `service`, `component`, `chat`, `pin` et `subscribe`.
Les identifiants de service sont des chaînes URL-safe ; le chemin de composant
doit rester relatif au service.

### Formulaires

```typescript
import { FormView } from '@numerum-tech/yeriasdk';

// Le titre est passé au constructeur (id, title)
const form = new FormView('user-registration', 'User Registration')
  .setIntro('Please fill in your information')
  // addField() utilise l'ordre: fieldType, fieldId, fieldLabel, params
  .addField('text', 'name', 'Full Name', { required: true })
  .addField('email', 'email', 'Email Address', { required: true })
  .addField('tel', 'phone', 'Phone Number', { required: false })
  .submitButton('Register', 'POST');  // Convention: POST /api/forms/{formId}

console.log(form.toJSON());

// Formulaire avec navigation (ex: multi-étapes)
const step1 = new FormView('registration-step-1', 'Personal Information')
  .setIntro('Step 1 of 3')
  .addTextField('firstName', 'First Name', true)
  .addTextField('lastName', 'Last Name', true)
  .setNext('/api/forms/registration-step-2')  // Vue suivante
  .submitButton('Continue', 'POST');

// Méthodes helper recommandées (plus simples et plus claires)
const formSimple = new FormView('user-registration', 'User Registration')
  .setIntro('Please fill in your information')
  .addTextField('name', 'Full Name', true)
  .addEmailField('email', 'Email Address', true)
  .addPhoneField('phone', 'Phone Number', false)
  .submitButton('Register', 'POST');
```

### Vue JSON Statique

```typescript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({ appId: 'my-app' });

const envelope = yeriaApp.serveRawView({
  id: 'home-static',
  type: 'Reader',
  content: {
    title: 'Bienvenue',
    body: [
      { type: 'paragraph', text: 'Cette vue est servie depuis un bloc JSON.' }
    ]
  }
});
```

### Injection de Données (Formulaires d'Édition)

```typescript
import { FormView } from '@numerum-tech/yeriasdk';

// Méthode 1: injectData() - Injection Globale (RECOMMANDÉ)
// Parfait pour formulaires d'édition avec données depuis API/DB
const userData = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  age: 30,
  country: 'FR'  // Pour select: met selected: true sur l'option 'FR'
};

const editForm = new FormView('edit-user', 'Edit User Profile')
  .addTextField('firstName', 'First Name', true)
  .addTextField('lastName', 'Last Name', true)
  .addEmailField('email', 'Email', true)
  .addNumberField('age', 'Age', false, 18, 120)
  .addSelectField('country', 'Country', false, [
    { label: 'France', value: 'FR' },
    { label: 'USA', value: 'US' },
    { label: 'Canada', value: 'CA' }
  ])
  .injectData(userData)  // ✅ Injecte toutes les valeurs en une fois
  .submitButton('Update Profile', 'PUT');

// JSON généré pour le select:
// {
//   "fieldType": "select",
//   "options": [
//     { "label": "France", "value": "FR", "selected": true },  // ✅ Automatique!
//     { "label": "USA", "value": "US", "selected": false },
//     { "label": "Canada", "value": "CA", "selected": false }
//   ]
// }

// Checkbox avec multi-sélection (value = array)
const preferencesData = {
  interests: ['sports', 'music']  // Array pour checkbox multi-sélection
};

const preferencesForm = new FormView('preferences', 'Preferences')
  .addCheckboxField('interests', 'Interests')  // Checkbox avec options
  .injectData(preferencesData);

// JSON généré pour checkbox:
// {
//   "fieldType": "checkbox",
//   "options": [
//     { "label": "Sports", "value": "sports", "selected": true },  // ✅ Dans l'array
//     { "label": "Music", "value": "music", "selected": true },    // ✅ Dans l'array
//     { "label": "Reading", "value": "reading", "selected": false }
//   ]
// }

// Méthode 2: setFieldValue() - Injection Individuelle
const form = new FormView('form', 'Form')
  .addTextField('name', 'Name', true)
  .setFieldValue('name', 'John Doe');  // ✅ Définit une valeur spécifique
```

### Lecteurs de Données (Contenu Riche)

```typescript
import { ReaderView } from '@numerum-tech/yeriasdk';

// ReaderView affiche du contenu riche (pas des formulaires)
// Le titre est passé au constructeur (id, title)
const reader = new ReaderView('user-profile', 'User Profile')
  .setIntro('Your profile information')
  .addParagraph('Welcome to your user profile. Here you can view your personal information.')
  .addSubTitle('Personal Information')
  .addListField([
    'Name: John Doe',
    'Email: john@example.com',
    'Phone: +1234567890'
  ])
  .addSeparator()
  .addSubTitle('Account Status')
  .addParagraph('Your account is active and in good standing.')
  .addImage('https://example.com/profile-picture.jpg', 'Profile Picture', 'Your profile photo');

console.log(reader.toJSON());

// Exemple avec Markdown
const readerMarkdown = new ReaderView('help-guide', 'Help Guide')
  .setIntro('Learn how to use our platform')
  .addMarkdown(`
## Getting Started

Welcome to our platform! Here's how to get started:

1. **Create an account** - Sign up with your email
2. **Complete your profile** - Add your information
3. **Explore features** - Discover what we offer

### Need Help?
Contact our support team at support@example.com
  `);

// ReaderView avec navigation (ex: tutoriel multi-pages)
const tutorial1 = new ReaderView('tutorial-1', 'Tutorial - Getting Started')
  .setIntro('Welcome to the tutorial!')
  .addParagraph('This tutorial will guide you through the basics.')
  .setNext('/api/readers/tutorial-2')  // Page suivante
  .setPrev('/api/readers/welcome');    // Page précédente
```

### Listes d'Actions

```typescript
import { ActionListView } from '@numerum-tech/yeriasdk';

// Le titre est passé au constructeur (viewId, viewTitle)
const actionList = new ActionListView('main-menu', 'Main Menu')
  .addAction('profile', 'View Profile', 'Access your profile information', 'profile-icon.png')
  .addAction('settings', 'Settings', 'Configure your preferences', 'settings-icon.png')
  .addAction('help', 'Help & Support', 'Get help and contact support', 'help-icon.png');

console.log(actionList.toJSON());
```

### Grilles d'Actions

```typescript
import { ActionGridView } from '@numerum-tech/yeriasdk';

// Le titre est passé au constructeur (viewId, viewTitle)
const actionGrid = new ActionGridView('dashboard', 'Dashboard')
  .setColumns(3)
  .setSpacing(20)
  .addAction('analytics', 'Analytics', 'View your analytics', 'analytics-icon.png')
  .addAction('reports', 'Reports', 'Generate reports', 'reports-icon.png')
  .addAction('users', 'Users', 'Manage users', 'users-icon.png');

console.log(actionGrid.toJSON());
```

### Scanner de QR Codes

**Note** : Version 2.0 - API simplifiée. Le rendu mobile gère toute l'implémentation du scanner (caméra, torche, mise au point, formats).

```typescript
import { QRScanView } from '@numerum-tech/yeriasdk';

// Auto-soumission simple (scan → POST immédiat)
const quickScan = new QRScanView('scan-ticket', 'Scan Your Ticket')
  .setIntro('Point your camera at the QR code on your ticket');
// → L'utilisateur scanne "ABC123" → POST immédiat { qrData: "ABC123" }

// Avec bouton de confirmation (désactive auto-soumission)
const confirmScan = new QRScanView('verify-product', 'Verify Product')
  .setIntro('Scan the product barcode')
  .enablePreview('Product Code')
  .submitButton('Verify Product', 'Comparez la référence avec l\'étiquette.');
// → Scanne → Aperçu en lecture seule (+ message rendu en texte d'aide) → clic → POST

// Avec validation : préfixe + format numérique + longueur
const invoiceScan = new QRScanView('scan-invoice', 'Scan Invoice')
  .setIntro('Scan the invoice QR code')
  .setValidation('Invalid invoice format', 'number', 10, 10, 'INV-')
  .submitButton('Process Invoice');
// → Scanne → Valide (préfixe INV-, chiffres, longueur 10) → clic → POST
// Accepte : "INV-123456" (10 caractères total)

// Exemple 4 : Code PIN numérique exact
const pinScan = new QRScanView('scan-pin', 'Scan PIN')
  .setIntro('Scan 6-digit PIN code')
  .setValidation('PIN must be 6 digits', 'number', 6, 6);
// → Auto-submit si valide (6 chiffres)

// Exemple 5 : Email
const emailScan = new QRScanView('scan-email', 'Scan Email QR')
  .setIntro('Scan email QR code')
  .setValidation('Invalid email format', 'email');
// → Validation simple (contient @ et .)

// Exemple 6 : URL
const urlScan = new QRScanView('scan-url', 'Scan URL')
  .setIntro('Scan URL QR code')
  .setValidation('Invalid URL', 'url');
// → Validation simple (commence par http:// ou https://)

console.log(quickScan.toJSON());
```

**Convention** : Le nom de champ est toujours `qrData` (non configurable). Données soumises : `{ qrData: "scanned-value" }`

**Formats de validation** :
- `'text'` : Aucune restriction
- `'number'` : Seulement chiffres (0-9)
- `'email'` : Validation simple (contient @ et .)
- `'url'` : Validation simple (http:// ou https://)

**IMPORTANT** : La validation mobile est **simple et permissive**. Le serveur **DOIT toujours re-valider** pour la sécurité.

### Affichage de QR Codes

```typescript
import { QRDisplayView } from '@numerum-tech/yeriasdk';

const qrDisplay = new QRDisplayView('qr-display', 'QR Code Display')
  .setIntro('Your QR codes are ready to scan')
  .addQRCodeReader(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'Product QR Code',
    'Scan this QR code to view product details',
    { size: 200, errorCorrection: 'M' }
  )
  .submitButton('Share QR Codes', 'POST');

console.log(qrDisplay.toJSON());
```

### Messages

```typescript
import { MessageView } from '@numerum-tech/yeriasdk';

const message = new MessageView('maintenance-alert', 'Scheduled maintenance')
  .setIntro('Heads up!')
  .setBody('The platform will be unavailable tonight from 1:00 to 2:00 UTC while we apply upgrades.')
  .setSeverity('warning')
  .setPrimaryAction('OK, thanks', 'POST')
  .setSecondaryAction('Remind me later', 'POST')
  .setDismissible(true);

console.log(message.toJSON());
```

### Cartes Produit (CardView)

```typescript
import { CardView } from '@numerum-tech/yeriasdk';

const productCard = new CardView('product-card', 'Super Gadget')
  .setSubtitle('Boostez votre journée')
  .setDescription('Un compagnon compact pour organiser vos tâches et automatiser vos routines quotidiennes.')
  .setImage('https://cdn.example.com/gadget.jpg', 'Super Gadget')
  .addStat('Prix', '49 €')
  .addStat('Stock', 'Disponible')
  .addSection('Points clés', 'Assistant vocal intégré, autonomie 48h, synchronisation multi-appareils.')
  .addAction('Acheter maintenant', 'POST', { confirmMessage: 'Confirmez-vous votre achat ?' })
  .addAction('Voir les détails', 'GET', { href: '/produits/super-gadget', variant: 'link' });

console.log(productCard.toJSON());
```

### Carrousels (CarouselView)

```typescript
import { CarouselView } from '@numerum-tech/yeriasdk';

const highlights = new CarouselView('home-carousel', 'Mises en avant')
  .addSlide(
    highlights.createSlide('release-2-0', 'Version 2.0', 'Découvrez les nouveautés', {
      imageUrl: 'https://cdn.example.com/banners/release.jpg',
      badge: 'Nouveau'
    })
  )
  .addSlide(
    highlights.createSlide('case-study', 'Étude client', 'Comment ACME a doublé sa productivité', {
      imageUrl: 'https://cdn.example.com/banners/case-study.jpg'
    })
  )
  .addSlideAction('release-2-0', 'Lire l’article', 'GET', { href: '/blog/version-2-0', variant: 'link' })
  .setSettings({ autoplay: true, intervalMs: 5000, loop: true });

console.log(highlights.toJSON());
```

### Timelines (TimelineView)

```typescript
import { TimelineView } from '@numerum-tech/yeriasdk';

const onboarding = new TimelineView('onboarding-flow', 'Votre progression')
  .setIntro('Suivez vos étapes de mise en service')
  .addEvent('step-1', 'Compte créé', new Date().toISOString(), { status: 'completed' })
  .addEvent('step-2', 'Télécharger vos documents', '2025-01-15T12:00:00Z', { status: 'active' })
  .addEvent('step-3', 'Validation', '2025-01-20T09:00:00Z', { status: 'pending' });

console.log(onboarding.toJSON());
```

### Médias (MediaView)

```typescript
import { MediaView } from '@numerum-tech/yeriasdk';

const tutorials = new MediaView('media-library', 'Tutoriels express')
  .setIntro('Apprenez en quelques minutes')
  .addMediaItem(
    tutorials.createMedia('video-intro', 'video', 'https://cdn.example.com/videos/intro.mp4', {
      type: 'video/mp4',
      poster: 'https://cdn.example.com/posters/intro.jpg'
    })
  )
  .addMediaItem({
    id: 'audio-guide',
    kind: 'audio',
    title: 'Guide audio',
    sources: [{ src: 'https://cdn.example.com/audio/guide.mp3', type: 'audio/mpeg' }]
  });

console.log(tutorials.toJSON());
```

### Cartes interactives (MapView)

```typescript
import { MapView } from '@numerum-tech/yeriasdk';

const storeMap = new MapView('stores-map', 'Boutiques partenaires')
  .setViewport({ lat: 48.8566, lon: 2.3522 }, { zoom: 12 })
  .addMarker({
    id: 'store-paris',
    title: 'Paris Centre',
    description: 'Ouvert de 9h à 19h',
    location: { lat: 48.8566, lon: 2.3522 }
  })
  .addMarker({
    id: 'store-lyon',
    title: 'Lyon République',
    location: { lat: 45.7640, lon: 4.8357 }
  })
  .setControls({ zoom: true, userLocation: true });

console.log(storeMap.toJSON());
```

### Notifications

Envoyer des notifications signées aux utilisateurs via la plateforme Yeria
(POST `{baseUrl}/api/v1/user/notifications`) :

```typescript
import { YeriaApp, Notification } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({
  appId: 'my-backend-service',
  baseUrl: 'https://yeria.app'
});

// Créer et envoyer une notification
const notification = new Notification('user-123', 'Bienvenue !', 'Merci d\'avoir rejoint Yeria')
  .setLink('/welcome');

await yeriaApp.sendNotification(notification);
```

### YeriaApp sécurisé

```typescript
import { YeriaApp } from '@numerum-tech/yeriasdk';

const yeriaApp = new YeriaApp({
  appId: 'my-backend-service',
  viewExpirationMinutes: 30
});

const form = yeriaApp
  .createFormView('user-registration', 'User Registration')
  .addTextField('email', 'Email', true)
  .addPasswordField('password', 'Password', 8)
  .submitButton('Register', 'POST');

const secureResponse = yeriaApp.serve(form);
console.log('Signature:', secureResponse.signature);
console.log('Integrity check:', yeriaApp.verifyIntegrity(secureResponse));
```

> ℹ️ **YeriaApp est stateless** : il ne conserve plus les vues créées. Gardez vos instances (ex: dans un tableau) si vous devez les servir plus tard.

Vous pouvez également signer une vue sans instancier YeriaApp grâce au helper statique :

```typescript
import { YeriaApp, FormView } from '@numerum-tech/yeriasdk';

const privateKey = process.env.PRIVATE_KEY!; // clé PEM Ed25519
const publicKey = process.env.PUBLIC_KEY!;

const manualForm = new FormView('manual', 'Manual Form')
  .addTextField('name', 'Name', true)
  .submitButton('Save', 'POST');

const payload = manualForm.toJSON();
const signed = YeriaApp.signView(payload, 'my-backend-service', privateKey);

console.log('Signature valide ?', YeriaApp.verifySignature(publicKey, signed));
```

## 🧭 Workflows Multi-Étapes (Process Context)

Le SDK supporte les processus multi-étapes avec suivi de progression via `belongsToProcess()`.

```typescript
import { FormView } from '@numerum-tech/yeriasdk';

// Étape 1 : Bienvenue
const step1 = new FormView('welcome', 'Welcome!', 'user-onboarding')
  .belongsToProcess('user-onboarding', {
    processName: 'User Onboarding',
    currentStep: 1,
    totalSteps: 4,
    stepName: 'Welcome',
    canGoBack: false,
    canSkip: false
  })
  .setIntro('Let\'s get you started')
  .addTextField('firstName', 'First Name', true, 50)
  .addTextField('lastName', 'Last Name', true, 50)
  .setNext('personal-info')  // Relative viewId (même processus)
  .submitButton('Continue');

// Étape 2 : Informations personnelles
const step2 = new FormView('personal-info', 'Personal Information', 'user-onboarding')
  .belongsToProcess('user-onboarding', {
    processName: 'User Onboarding',
    currentStep: 2,
    totalSteps: 4,
    stepName: 'Personal Info',
    canGoBack: true,
    canSkip: false
  })
  .setIntro('Tell us about yourself')
  .addEmailField('email', 'Email Address', true)
  .addPhoneField('phone', 'Phone Number', true)
  .setPrev('welcome')
  .setNext('address')
  .submitButton('Continue');

// Pattern d'URL : /api/processes/user-onboarding/views/welcome
// Soumission : POST /api/processes/user-onboarding/views/welcome
```

## 🔧 Configuration

### Logging

The SDK provides a **flexible, pluggable logging system** that is **silent by default** in production.

#### **Silent Mode (Default - Production)**

```typescript
import { YeriaApp } from '@numerum-tech/yeriasdk';

// No logger = SilentLogger (no logs in production)
const app = new YeriaApp({ appId: 'my-app' });
// Clean, professional - no console pollution
```

#### **Console Logger (Development)**

```typescript
import { YeriaApp, ConsoleLogger } from '@numerum-tech/yeriasdk';

// Opt-in to console logging for debugging
const app = new YeriaApp({
    appId: 'my-app',
    logger: new ConsoleLogger('info')  // 'debug' | 'info' | 'warn' | 'error'
});

// Logs appear for important operations:
// [2025-10-25T10:30:00.000Z] [YeriaApp INFO] YeriaApp initialized
// [2025-10-25T10:30:00.001Z] [YeriaApp INFO] View served securely
```

#### **Custom Logger (Integration with Existing Systems)**

```typescript
import { YeriaApp, ILogger } from '@numerum-tech/yeriasdk';

// Integrate with Sentry, Winston, Datadog, etc.
const customLogger: ILogger = {
    debug: (msg, ctx) => winston.debug(msg, ctx),
    info: (msg, ctx) => winston.info(msg, ctx),
    warn: (msg, ctx) => winston.warn(msg, ctx),
    error: (msg, ctx) => winston.error(msg, ctx)
};

const app = new YeriaApp({
    appId: 'my-app',
    logger: customLogger  // All SDK logs use your logger
});
```

#### **Environment-Based Logging**

```typescript
import { YeriaApp, ConsoleLogger, SilentLogger } from '@numerum-tech/yeriasdk';

const logger = process.env['NODE_ENV'] === 'development'
    ? new ConsoleLogger('debug')
    : new SilentLogger();

const app = new YeriaApp({ appId: 'my-app', logger });
```

#### **Legacy Logger (Backward Compatibility)**

```typescript
import { Logger } from '@numerum-tech/yeriasdk';

// Old API still works (deprecated)
Logger.getInstance().setLogLevel('info');
Logger.info('YeriaApp ready');
```

See [LOGGER_ARCHITECTURE.md](./LOGGER_ARCHITECTURE.md) for complete documentation.

### Validation

```typescript
import { FieldValidator, DataSanitizer } from '@numerum-tech/yeriasdk';

// Validation de configuration de champ
const fieldCheck = FieldValidator.validateField('email', 'email', 'Email', {
  required: true,
  value: 'test@example.com'
});

// Nettoyage d'entrée utilisateur
const safeValue = DataSanitizer.sanitizeInput('<script>alert(1)</script>');
```

## 📋 Types Supportés

### Champs de Formulaire
- `text` - Texte simple
- `email` - Adresse email
- `tel` - Numéro de téléphone
- `password` - Mot de passe
- `date` - Date
- `file` - Fichier
- `gps` - Coordonnées GPS
- `select` - Sélection
- `pluscode` - Code Plus

### Types de Vue
- `Form` - Formulaires
- `Reader` - Lecteurs de données
- `ActionList` - Listes d'actions
- `ActionGrid` - Grilles d'actions
- `QRScan` - Scanner de QR codes
- `QRDisplay` - Affichage de QR codes
- `Message` - Messages
- `Card` - Cartes produit/profil
- `Carousel` - Carrousels d'images
- `Timeline` - Lignes temporelles
- `Media` - Lecteurs audio/vidéo
- `Map` - Cartes interactives

## 🧪 Tests

```bash
# Exécuter tous les tests
npm test

# Tests en mode watch
npm run test:watch

# Tests avec couverture
npm run test:coverage

# Test du SDK complet
npm run test:sdk
```

## 📚 API Référence

### BaseView
Classe de base pour toutes les vues avec méthodes communes :
- `toJSON()` - Sérialisation en JSON
- `clone()` - Clonage de la vue
- `validate()` - Validation des données

### FormView
Gestion des formulaires avec validation avancée :
- `setIntro()` - Texte d'introduction du formulaire (recommandé)
- `setNote()` - Note introductive (déprécié, utilisez `setIntro()`)
- `addField()` - Ajout de champ générique
- `addTextField()`, `addEmailField()`, `addPhoneField()`, `addPasswordField()` - Champs texte
- `addNumberField()`, `addDateField()` - Champs numériques et date
- `addSelectField()`, `addCheckboxField()` - Sélections
- `addPhotoField()`, `addFileField()` - Upload de fichiers
- `addGPSField()`, `addPlusCodeField()` - Localisation
- `injectData()` - Injection de données pour formulaires d'édition
- `setFieldValue()` - Définir la valeur d'un champ
- `submitButton()`, `updateButton()`, `deleteButton()` - Boutons d'action
- `setNext()`, `setPrev()` - Navigation multi-étapes
- `belongsToProcess()` - Associer à un processus

### ReaderView
Affichage de contenu riche en lecture seule :
- `setIntro()` - Texte d'introduction
- `addParagraph()` - Ajout de paragraphes
- `addImage()` - Ajout d'images
- `addSubTitle()` - Ajout de sous-titres
- `addMarkdown()` - Ajout de contenu Markdown
- `addListField()` - Ajout de listes
- `addLink()` - Ajout de liens
- `addTable()` - Ajout de tableaux
- `addCodeBlock()` - Ajout de blocs de code
- `addQuote()` - Ajout de citations
- `addSeparator()` - Ajout de séparateurs
- `setNext()`, `setPrev()` - Navigation

### ActionListView/ActionGridView
Gestion des actions et navigation :
- `addAction()` - Ajout d'actions
- `removeAction()` - Suppression d'actions
- `getActiveActions()` - Actions actives

### QRScanView
Scanner de QR codes (v2.0 - API simplifiée) :
- `setIntro()` - Instructions pour l'utilisateur
- `submitButton(text, confirmMessage?)` - Bouton de confirmation (désactive auto-soumission) ; `confirmMessage` est rendu en texte d'aide à côté de la valeur scannée, PAS en boîte de dialogue (le tap sur le bouton est déjà la confirmation)
- `setValidation(errorMessage, format?, minLength?, maxLength?, startsWith?)` - Règles de validation
  - Formats : `'text'`, `'number'`, `'url'`, `'email'`
- `enablePreview(label?)` / `disablePreview()` - Aperçu **en lecture seule** de la valeur scannée (jamais éditable : une valeur re-saisissable permettrait d'envoyer n'importe quoi comme si elle avait été scannée)
- `setAutoSubmit()` - Activer/désactiver soumission automatique
- **Convention** : Nom de champ toujours `qrData`

### QRDisplayView
Affichage de QR codes :
- `setIntro()` - Texte d'introduction
- `addQRCodeReader(imageUrl, title, description?, options?)` - Affichage d'un QR code
- `submitButton()` - Bouton d'action (partage, etc.)

### MessageView
Gestion des messages et notifications :
- `setIntro()` - Texte d'introduction
- `setBody()` - Définition du message principal
- `setSeverity()` - Niveau d'alerte (`'info'`, `'success'`, `'warning'`, `'error'`)
- `setPrimaryAction()` - Bouton principal (OK, Valider…)
- `setSecondaryAction()` - Bouton secondaire (Annuler, Plus tard…)
- `setDismissible()` - Autoriser la fermeture sans action
- `submitButton()` - Alias de `setPrimaryAction()`

### CardView
Présenter des fiches riches :
- `setSubtitle()` - Sous-titre court
- `setDescription()` - Texte détaillé
- `addStat()` - Statistiques clés (prix, stock…)
- `addSection()` - Contenu structuré (atouts, détails)
- `addAction()` - Boutons d'action

### CarouselView
Mettre en avant plusieurs contenus :
- `createSlide()` / `addSlide()` - Gestion des slides
- `addSlideAction()` - Actions par slide
- `setSettings()` - Autoplay, boucle, indicateurs

### TimelineView
Suivre une progression :
- `setIntro()` - Contexte
- `addEvent()` / `addItem()` - Ajout d'étapes
- `setItems()` - Définir la timeline complète

### MediaView
Lecteurs audio/vidéo :
- `setIntro()` - Présentation
- `createMedia()` - Helper pour créer une ressource
- `addMediaItem()` - Ajouter vidéos ou podcasts
- `clearItems()` - Réinitialiser la playlist

### MapView
Afficher des emplacements :
- `setViewport()` - Définir centre et zoom
- `addMarker()` / `addMarkers()` - Ajouter des points d'intérêt
- `setControls()` - Activer zoom, boussole, localisation
- `addOverlay()` - Ajouter des zones personnalisées

## 🎨 Guide de Sélection de Vue

### Quand utiliser chaque type de vue ?

#### FormView
- ✅ **Collecte de données utilisateur** (inscription, connexion, profil)
- ✅ **Formulaires interactifs** avec validation
- ✅ **Soumission de données** vers un serveur
- **Méthodes** : `addTextField()`, `addEmailField()`, `addPasswordField()`, etc.

#### ReaderView
- ✅ **Affichage de contenu** (articles, guides, documentation)
- ✅ **Présentations riches** avec images, markdown, tableaux
- ✅ **Pages informatives** sans interaction
- **Méthodes** : `addParagraph()`, `addImage()`, `addMarkdown()`, `addTable()`, etc.

#### ActionListView / ActionGridView
- ✅ **Menus de navigation**
- ✅ **Listes d'options** cliquables
- ✅ **Dashboards** avec actions rapides

#### QRScanView
- ✅ **Scanner** des QR codes avec auto-soumission
- ✅ **Validation** des codes scannés (format, longueur)
- ✅ **Aperçu** en lecture seule avant soumission
- ✅ **Workflows de confirmation** avec boutons
- ✅ **Scan refusé** : le scanner s'arrête et affiche `validation.errorMessage` (la valeur refusée n'est jamais réaffichée)
- **Méthodes** : `setIntro()`, `submitButton()`, `setValidation()`, `enablePreview()`

#### QRDisplayView
- ✅ **Afficher** des QR codes
- ✅ **Partage** d'informations via QR

#### MessageView
- ✅ **Boîtes de dialogue** de confirmation
- ✅ **Messages informatifs** avec bouton OK et option Annuler
- ✅ **Alertes** (succès, avertissement, erreur) nécessitant une confirmation

#### CardView
- ✅ **Fiches produit** ou profils détaillés
- ✅ **Encarts de recommandations**
- ✅ **Résumé de compte** avec statistiques

#### CarouselView
- ✅ **Page d’accueil** avec bannières
- ✅ **Promotions** ou actualités multiples
- ✅ **Guides miniatures** à feuilleter

#### TimelineView
- ✅ **Suivi de dossier** étape par étape
- ✅ **Historique d’activités**
- ✅ **Roadmaps produit**

#### MediaView
- ✅ **Tutoriels vidéo**
- ✅ **Podcasts ou messages audio**
- ✅ **Playlists courtes** au sein de l’app

#### MapView
- ✅ **Points de vente** ou agences à proximité
- ✅ **Itinéraires** et zones de livraison
- ✅ **Visualisation de capteurs** (IoT, suivi terrain)

### Erreurs Courantes à Éviter

❌ **Erreur** : Utiliser `addField()` sur ReaderView
```typescript
// FAUX - addField() n'existe pas sur ReaderView
const reader = new ReaderView('profile', 'Profile')
  .addField('name', 'text', 'Name', 'John');  // ❌ ERREUR
```

✅ **Correct** : Utiliser `addParagraph()` ou `addListField()`
```typescript
// CORRECT
const reader = new ReaderView('profile', 'Profile')
  .addParagraph('Name: John Doe')  // ✅
  .addListField(['Email: john@example.com', 'Phone: +123']);  // ✅
```

❌ **Erreur** : Mauvais ordre des paramètres dans `addField()`
```typescript
// FAUX - ordre inversé
form.addField('name', 'text', 'Full Name', true);  // ❌
```

✅ **Correct** : fieldType en premier
```typescript
// CORRECT
form.addField('text', 'name', 'Full Name', { required: true });  // ✅
// OU mieux : utiliser les méthodes helper
form.addTextField('name', 'Full Name', true);  // ✅ Recommandé
```

## 🤝 Contribution

1. Fork le projet
2. Créez une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence Apache 2.0. Voir les fichiers `LICENSE` et `NOTICE` pour plus de détails. Copyright 2026 Numerum.

## 🆘 Support

Pour toute question ou problème :
- Ouvrez une issue sur GitHub
- Consultez la documentation
- Contactez l'équipe de développement

---

**Yeria SDK** - Génération d'interfaces JSON dynamiques simplifiée 🚀 
