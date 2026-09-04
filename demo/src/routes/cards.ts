import { Router, Request, Response } from 'express';
import { YeriaApp, YeriaUI } from '@numerum-tech/yeriasdk';
import { DEMO_KEYS } from '../security/demo-keys';

const router = Router();

// Initialize YeriaApp
const yeriaApp = new YeriaApp({
  appId: 'demo-app-cards',
  viewExpirationMinutes: 30,
  privateKey: DEMO_KEYS.privateKey,
  publicKey: DEMO_KEYS.publicKey
});

// Comprehensive CardView demonstration
router.get('/', (req: Request, res: Response) => {
  const card = YeriaUI
    .createCardView('comprehensive-card', 'CardView')
    .setIntro('Démonstration de toutes les fonctionnalités CardView')
    .setDescription('Cette carte présente toutes les fonctionnalités disponibles du composant CardView : image, badge, statistiques, sections, actions avec variantes et métadonnées personnalisées.')
    .setImage('img/card-product.png', 'Image de démonstration du produit')
    .setBadge('Premium')

    // Statistiques — l'intitule du bloc vient desormais du fournisseur : le
    // renderer n'en invente plus.
    .setStatsHeading('Statistiques')
    .addStat('Note', '⭐⭐⭐⭐⭐ 4.8/5')
    .addStat('Prix', '850 499 FCFA')
    .addStat('Stock', '✅ En stock')
    .addStat('Livraison', 'Gratuite')
    .addStat('Garantie', '1 an')
    .addStat('Disponibilité', 'Immédiate')

    // Sections
    .addSection('Fonctionnalités', 'Processeur avancé • Écran haute résolution • Longue autonomie • Qualité de fabrication premium • Design élégant')
    .addSection('Spécifications', 'Puce M3 Pro • 18 Go RAM • 512 Go SSD • Écran Retina XDR 16,2" • macOS Sonoma')
    .addSection('Garantie', 'Garantie limitée 1 an • Support technique gratuit 90 jours • Extension possible')
    .addSection('Contenu de la Boîte', 'MacBook Pro • Câble USB-C vers MagSafe 3 • Adaptateur secteur USB-C 140W • Documentation')

    // Actions avec toutes les variantes et options
    .addAction('Acheter Maintenant', 'POST', {
      confirmMessage: 'Confirmer l\'achat de ce produit ?',
      icon: '🛒',
      variant: 'primary'
    })
    .addAction('Ajouter au Panier', 'POST', {
      icon: '➕',
      variant: 'secondary'
    })
    .addAction('Ajouter aux Favoris', 'PUT', {
      icon: '❤️',
      variant: 'secondary'
    })
    .addAction('Partager le Produit', 'GET', {
      icon: '📤',
      variant: 'link'
    })
    .addAction('Voir les Détails', 'GET', {
      href: '/products/details',
      icon: 'ℹ️',
      variant: 'link'
    })
    .addAction('Comparer', 'GET', {
      href: '/products/compare',
      icon: '⚖️',
      variant: 'link'
    })

    // Métadonnées personnalisées
    .setMetadata({
      productId: 'MBP-16-2024-M3',
      sku: 'APPLE-MBP16-M3PRO-512',
      category: 'Ordinateurs portables',
      brand: 'Apple',
      inStock: true,
      stockQuantity: 15,
      rating: 4.8,
      reviewCount: 342,
      releaseDate: '2024-01-15',
      tags: ['premium', 'professionnel', 'performant'],
      warranty: {
        duration: '1 an',
        extensionAvailable: true
      },
      shipping: {
        freeShipping: true,
        estimatedDelivery: '2-3 jours ouvrables'
      }
    });

  res.json(yeriaApp.serve(card));
});

export default router;
