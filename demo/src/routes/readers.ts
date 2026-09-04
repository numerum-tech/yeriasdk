import { Router, Request, Response } from 'express';
import { YeriaApp, YeriaUI } from '@numerum-tech/yeriasdk';
import { DEMO_KEYS } from '../security/demo-keys';

const router = Router();

const yeriaApp = new YeriaApp({
  appId: 'demo-app-readers',
  viewExpirationMinutes: 30,
  privateKey: DEMO_KEYS.privateKey,
  publicKey: DEMO_KEYS.publicKey
});

// Comprehensive ReaderView with all element types
router.get('/', (req: Request, res: Response) => {
  const reader = YeriaUI
    .createReaderView('comprehensive-reader', 'ReaderView')
    .setIntro('Ce lecteur démontre tous les types d\'éléments disponibles dans le ReaderView')

    // Paragraphes
    .addParagraph('Ceci est un élément paragraphe standard. Il peut contenir du texte brut qui fournit des informations à l\'utilisateur. Les paragraphes sont les éléments de base d\'un ReaderView.')

    // Sous-titres
    .addSubTitle('Section 1 : Éléments Textuels')
    .addParagraph('Les ReaderViews supportent différents types d\'éléments textuels pour organiser le contenu de manière hiérarchique.')

    // Listes (non ordonnées)
    .addSubTitle('Section 2 : Éléments de Liste')
    .addListField([
      'Premier élément de liste - démonstration de listes non ordonnées',
      'Deuxième élément avec icônes : ✅ Coche',
      'Troisième élément avec emoji : 🚀 Fusée',
      'Quatrième élément avec plusieurs lignes de contenu qui s\'ajuste naturellement'
    ])

    // Images
    .addSubTitle('Section 3 : Images')
    .addImage('https://via.placeholder.com/600x400?text=Image+Demo', 'Ceci est une légende pour l\'image de démonstration')

    // Liens
    .addSubTitle('Section 4 : Liens')
    .addLink('Visiter le site Yeria', 'https://yeria.example.com')
    .addLink('Documentation', 'https://docs.yeria.example.com')
    .addLink('Dépôt GitHub', 'https://github.com/yeria')

    // Contenu Markdown
    .addSubTitle('Section 5 : Support Markdown')
    .addMarkdown(`
# Titre Markdown

Ceci est du **texte en gras** et ceci est du *texte en italique*.

## Exemple de Code

\`\`\`javascript
const salutation = "Bonjour le monde";
console.log(salutation);
\`\`\`

### Fonctionnalités :
- Supporte le **formatage**
- Blocs de code avec coloration syntaxique
- Listes et contenu imbriqué
    `)

    // Tableaux
    .addSubTitle('Section 6 : Tableaux')
    .addTable(
      ['Produit', 'Prix', 'Stock'],
      [
        ['MacBook Pro', '2 499 €', 'En stock'],
        ['iPhone 15', '999 €', 'Limité'],
        ['AirPods Pro', '249 €', 'Rupture de stock']
      ]
    )

    // Citations
    .addSubTitle('Section 7 : Citations')
    .addQuote('La seule façon de faire du bon travail est d\'aimer ce que vous faites.', 'Steve Jobs')

    // Séparateurs
    .addSeparator()

    // Blocs de code
    .addSubTitle('Section 8 : Blocs de Code')
    .addCodeBlock(`function calculerTotal(articles) {
  return articles.reduce((somme, article) => somme + article.prix, 0);
}`, 'javascript')

    .addSeparator()

    // Éléments personnalisés
    .addSubTitle('Section 9 : Éléments Personnalisés')
    .addParagraph('Les éléments personnalisés permettent de définir vos propres types d\'éléments avec des structures de données personnalisées.')
    .addCustomElement('alert', {
      severity: 'warning',
      title: 'Avis Important',
      message: 'Ceci est un élément d\'alerte personnalisé avec des données personnalisées',
      icon: '⚠️'
    })
    .addCustomElement('stat-card', {
      label: 'Utilisateurs Totaux',
      value: 12345,
      trend: 'up',
      percentage: 15.3,
      description: 'Utilisateurs actifs dans les 30 derniers jours'
    })
    .addCustomElement('timeline-event', {
      date: '2024-02-28',
      title: 'Lancement Produit',
      description: 'Lancement d\'une nouvelle fonctionnalité avec support des éléments personnalisés',
      status: 'completed',
      metadata: {
        author: 'Équipe de Développement',
        tags: ['fonctionnalité', 'lancement']
      }
    })

    .addSeparator()

    // Informations supplémentaires
    .addSubTitle('Résumé')
    .addParagraph('Ce ReaderView démontre tous les types d\'éléments disponibles : paragraphes, sous-titres, listes, images, liens, markdown, tableaux, citations, séparateurs, blocs de code et éléments personnalisés.')
    .addParagraph('Utilisez ces éléments pour créer des affichages de contenu riches et informatifs dans vos applications.');

  res.json(yeriaApp.serve(reader));
});

/**
 * Document paginé — trois pages, chacune servie séparément.
 *
 * Le fournisseur n'écrit aucun code d'interface : `setPrev` / `setNext`
 * donnent les deux flèches, `setPage` donne l'indicateur « Page 2 / 3 » que le
 * client met en forme dans la langue du lecteur. La première page n'a pas de
 * précédent, la dernière pas de suivant — le contrôle correspondant se
 * désactive de lui-même.
 */
const PAGES = [
  {
    title: 'Rapport annuel — Contexte',
    body:
      'Cette première page pose le cadre. Les deux flèches du bas sont ' +
      'dessinées par le client : le fournisseur a seulement déclaré vers où ' +
      'elles mènent.',
  },
  {
    title: 'Rapport annuel — Résultats',
    body:
      'Deuxième page. L\'indicateur central vient de setPage(2, 3) — des ' +
      'nombres, mis en forme par le client dans la langue du lecteur.',
  },
  {
    title: 'Rapport annuel — Perspectives',
    body:
      'Dernière page : aucun suivant n\'est déclaré, donc le contrôle ' +
      '« Suivant » est éteint. Le geste de retour, lui, ne feuillette pas — ' +
      'il quitte le document.',
  },
];

router.get('/paged/:n', (req: Request, res: Response) => {
  const index = Number(req.params.n);
  if (!Number.isInteger(index) || index < 1 || index > PAGES.length) {
    return res.status(404).json(YeriaUI.error({
      code: 'not_found',
      message: 'Cette page n\'existe pas.',
    }));
  }

  const page = PAGES[index - 1]!;
  const view = YeriaUI
    .createReaderView(`paged-reader-${index}`, page.title)
    .addParagraph(page.body)
    .setPage(index, PAGES.length);

  if (index > 1) view.setPrev(`/api/readers/paged/${index - 1}`);
  if (index < PAGES.length) view.setNext(`/api/readers/paged/${index + 1}`);

  return res.json(yeriaApp.serve(view));
});

export default router;
