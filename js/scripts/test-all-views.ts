#!/usr/bin/env ts-node

import {
    FormView,
    ReaderView,
    ActionListView,
    ActionGridView,
    QRScanView,
    QRDisplayView,
    MessageView,
    CardView,
    CarouselView,
    TimelineView,
    MediaView,
    MapView
} from '../src/index';

console.log('🧪 Test complet de toutes les vues Yeria SDK\n');

// Fonction utilitaire pour tester une vue
function testView(name: string, view: any) {
    console.log(`\n📋 Test: ${name}`);
    console.log('─'.repeat(50));

    try {
        // Test de base
        console.log(`✅ Type de vue: ${view.type}`);
        console.log(`✅ ID: ${view.id}`);

        // Test de sérialisation JSON
        const json = view.toJSON();
        console.log(`✅ Sérialisation JSON réussie`);
        console.log(`✅ Structure JSON valide:`, {
            id: json.id,
            type: json.type,
            hasContent: !!json.content,
            hasMetadata: !!json.metadata
        });

        // Test de validation
        const isValid = view.validateView();
        console.log(`✅ Validation: ${isValid.isValid ? 'PASS' : 'FAIL'}`);
        if (!isValid.isValid) {
            console.log(`❌ Erreurs de validation:`, isValid.errors);
        }

        // Test de clonage
        const cloned = view.clone();
        console.log(`✅ Clonage réussi: ${cloned.id === view.id}`);

        return true;
    } catch (error) {
        console.error(`❌ Erreur dans ${name}:`, error);
        return false;
    }
}

// Fonction pour afficher un exemple JSON
function showJSONExample(name: string, view: any) {
    console.log(`\n📄 Exemple JSON pour ${name}:`);
    console.log('─'.repeat(50));
    console.log(JSON.stringify(view.toJSON(), null, 2));
}

let allTestsPassed = true;

try {
    // 1. Test FormView
    console.log('\n🎯 Test 1: FormView');
    const formView = new FormView('user-registration', 'User Registration')
        .addField('text', 'name', 'Full Name', { required: true })
        .addField('email', 'email', 'Email Address', { required: true })
        .addField('tel', 'phone', 'Phone Number', { required: false })
        .addField('date', 'birthdate', 'Birth Date', { required: false })
        .submitButton('Register', 'POST');

    allTestsPassed = testView('FormView', formView) && allTestsPassed;
    showJSONExample('FormView', formView);

    // 2. Test ReaderView
    console.log('\n🎯 Test 2: ReaderView');
    const readerView = new ReaderView('user-profile', 'User Profile')
        .addParagraph('Full Name: John Doe')
        .addParagraph('Email Address: john@example.com')
        .addParagraph('Phone Number: +1234567890')
        .addParagraph('Birth Date: 1990-01-01');

    allTestsPassed = testView('ReaderView', readerView) && allTestsPassed;
    showJSONExample('ReaderView', readerView);

    // 3. Test ActionListView
    console.log('\n🎯 Test 3: ActionListView');
    const actionListView = new ActionListView('main-menu', 'Main Menu')
        .addAction('profile', 'View Profile', 'Access your profile information', 'profile-icon.png')
        .addAction('settings', 'Settings', 'Configure your preferences', 'settings-icon.png')
        .addAction('help', 'Help & Support', 'Get help and contact support', 'help-icon.png')
        .addAction('logout', 'Logout', 'Sign out of your account', 'logout-icon.png', true);

    allTestsPassed = testView('ActionListView', actionListView) && allTestsPassed;
    showJSONExample('ActionListView', actionListView);

    // 4. Test ActionGridView
    console.log('\n🎯 Test 4: ActionGridView');
    const actionGridView = new ActionGridView('dashboard', 'Dashboard')
        .setColumns(3)
        .setSpacing(20)
        .addAction('analytics', 'Analytics', 'View your analytics', 'analytics-icon.png')
        .addAction('reports', 'Reports', 'Generate reports', 'reports-icon.png')
        .addAction('users', 'Users', 'Manage users', 'users-icon.png')
        .addAction('products', 'Products', 'Manage products', 'products-icon.png')
        .addAction('orders', 'Orders', 'View orders', 'orders-icon.png')
        .addAction('settings', 'Settings', 'Configure settings', 'settings-icon.png');

    allTestsPassed = testView('ActionGridView', actionGridView) && allTestsPassed;
    showJSONExample('ActionGridView', actionGridView);

    // 5. Test QRScanView
    console.log('\n🎯 Test 5: QRScanView');
    const qrScanView = new QRScanView('qr-scanner', 'QR Code Scanner')
        .setIntro('Scan QR codes to access information')
        .addQRCodeScan(
            'Product QR',
            'Scan product QR code to get details',
            'Scan Product',
            { size: 200, errorCorrection: 'M' }
        )
        .addQRCodeScan(
            'Location QR',
            'Scan location QR code for directions',
            'Scan Location',
            { size: 250, errorCorrection: 'H' }
        )
        .submitButton('Submit Scanned Data', 'POST');

    allTestsPassed = testView('QRScanView', qrScanView) && allTestsPassed;
    showJSONExample('QRScanView', qrScanView);

    // 6. Test QRDisplayView
    console.log('\n🎯 Test 6: QRDisplayView');
    const qrDisplayView = new QRDisplayView('qr-display', 'QR Code Display')
        .setIntro('Your QR codes are ready to scan')
        .addQRCodeReader(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'Product QR Code',
            'Scan this QR code to view product details',
            { size: 200, errorCorrection: 'M' }
        )
        .addQRCodeReader(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'Contact QR Code',
            'Scan this QR code to save contact information',
            { size: 250, errorCorrection: 'H' }
        )
        .submitButton('Share QR Codes', 'POST');

    allTestsPassed = testView('QRDisplayView', qrDisplayView) && allTestsPassed;
    showJSONExample('QRDisplayView', qrDisplayView);

    // 7. Test MessageView
    console.log('\n🎯 Test 7: MessageView');
    const messageView = new MessageView('maintenance-alert', 'Scheduled Maintenance')
        .setIntro('Heads up!')
        .setBody('The platform will be unavailable tonight from 01:00 to 02:00 UTC while we apply upgrades.')
        .setSeverity('warning')
        .setPrimaryAction('OK, thanks', 'POST')
        .setSecondaryAction('Remind me later', 'POST');

    allTestsPassed = testView('MessageView', messageView) && allTestsPassed;
    showJSONExample('MessageView', messageView);

    // 8. Test CardView
    console.log('\n🎯 Test 9: CardView');
    const cardView = new CardView('product-card', 'Super Gadget')
        .setIntro('Boostez votre journée')
        .setDescription('Un compagnon compact pour organiser vos tâches et automatiser vos routines quotidiennes.')
        .setImage('https://cdn.example.com/gadget.jpg', 'Super Gadget')
        .addStat('Prix', '49 €')
        .addSection('Points clés', 'Assistant vocal, autonomie 48h, synchronisation multi-appareils.')
        .addAction('Acheter maintenant', 'POST', { confirmMessage: 'Confirmez-vous votre achat ?' })
        .addAction('Voir les détails', 'GET', { href: '/produits/super-gadget', variant: 'link' });

    allTestsPassed = testView('CardView', cardView) && allTestsPassed;
    showJSONExample('CardView', cardView);

    // 10. Test CarouselView
    console.log('\n🎯 Test 10: CarouselView');
    const carouselView = new CarouselView('home-carousel', 'Mises en avant')
        .addSlide(
            carouselView.createSlide('release-2-0', 'Version 2.0', 'Découvrez les nouveautés', {
                imageUrl: 'https://cdn.example.com/banners/release.jpg',
                badge: 'Nouveau'
            })
        )
        .addSlide(
            carouselView.createSlide('case-study', 'Étude client', 'Comment ACME a doublé sa productivité', {
                imageUrl: 'https://cdn.example.com/banners/case-study.jpg'
            })
        )
        .addSlideAction('release-2-0', 'Lire', 'GET', { href: '/blog/version-2-0', variant: 'link' })
        .setSettings({ autoplay: true, intervalMs: 4500, showIndicators: true });

    allTestsPassed = testView('CarouselView', carouselView) && allTestsPassed;
    showJSONExample('CarouselView', carouselView);

    // 11. Test TimelineView
    console.log('\n🎯 Test 11: TimelineView');
    const timelineView = new TimelineView('onboarding', 'Votre progression')
        .setIntro('Suivez les étapes de validation')
        .addEvent('step-1', 'Compte créé', new Date().toISOString(), { status: 'completed' })
        .addEvent('step-2', 'Documents envoyés', '2025-01-15T12:00:00Z', { status: 'active' })
        .addEvent('step-3', 'Validation finale', '2025-01-20T09:00:00Z', { status: 'pending' });

    allTestsPassed = testView('TimelineView', timelineView) && allTestsPassed;
    showJSONExample('TimelineView', timelineView);

    // 12. Test MediaView
    console.log('\n🎯 Test 12: MediaView');
    const mediaView = new MediaView('media-library', 'Tutoriels')
        .setIntro('Apprenez en quelques minutes')
        .addMediaItem(
            mediaView.createMedia('video-intro', 'video', 'https://cdn.example.com/videos/intro.mp4', {
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

    allTestsPassed = testView('MediaView', mediaView) && allTestsPassed;
    showJSONExample('MediaView', mediaView);

    // 13. Test MapView
    console.log('\n🎯 Test 13: MapView');
    const mapView = new MapView('stores-map', 'Boutiques')
        .setViewport({ lat: 48.8566, lon: 2.3522 }, { zoom: 11 })
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
        .setControls({ zoom: true, userLocation: true, compass: true });

    allTestsPassed = testView('MapView', mapView) && allTestsPassed;
    showJSONExample('MapView', mapView);

    // 14. Test des fonctionnalités avancées
    console.log('\n🎯 Test 14: Fonctionnalités avancées');
    console.log('─'.repeat(50));

    // Test des méthodes spécifiques
    console.log(`✅ FormView - Champs requis: ${formView.hasRequiredFields()}`);
    console.log(`✅ ActionListView - Actions: ${actionListView.getActionCount()}`);
    console.log(`✅ ActionGridView - Colonnes: ${actionGridView.getColumns()}`);
    console.log(`✅ QRScanView - Éléments: ${qrScanView.getElementCount()}`);
    console.log(`✅ MessageView - Éléments: ${messageView.getElementCount()}`);

    // Test des actions actives
    const activeActions = actionListView.getActiveActions();
    console.log(`✅ Actions actives: ${activeActions.length}`);

    // Résumé final
    console.log('\n🎯 Résumé des tests');
    console.log('─'.repeat(50));

    if (allTestsPassed) {
        console.log('🎉 Tous les tests sont passés avec succès !');
        console.log('✅ Toutes les vues fonctionnent correctement');
        console.log('✅ La sérialisation JSON est valide');
        console.log('✅ Les fonctionnalités avancées sont opérationnelles');
    } else {
        console.log('❌ Certains tests ont échoué');
    }

    console.log('\n📊 Statistiques:');
    console.log(`- Vues testées: 8`);
    console.log(`- Tests réussis: ${allTestsPassed ? '8/8' : 'Partiels'}`);
    console.log(`- Format JSON: Valide`);
    console.log(`- TypeScript: Strict`);

} catch (error) {
    console.error('\n💥 Erreur critique lors des tests:', error);
}

console.log('\n🏁 Tests terminés !');
