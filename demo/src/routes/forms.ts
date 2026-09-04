import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { YeriaApp, YeriaUI } from '@numerum-tech/yeriasdk';
import { DEMO_KEYS } from '../security/demo-keys';

const router = Router();

// A form carrying a photo, file, audio or video field is submitted as
// multipart/form-data, with each capture as a file part named after its
// fieldId (fieldId_0, fieldId_1, … when `multiple` is set). express.json()
// cannot read that, so without this the whole body arrives empty — including
// the plain text fields.
//
// The demo keeps uploads in memory and never writes them to disk; a real
// provider would stream them to storage. `limits` is what a provider must size
// against the constraints it declared: 30s at `quality: 'low'` is roughly 4 MB,
// so 32 MB leaves room for the medium/high presets too.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024, files: 12 }
});

const yeriaApp = new YeriaApp({
  appId: 'demo-app-forms',
  viewExpirationMinutes: 30,
  privateKey: DEMO_KEYS.privateKey,
  publicKey: DEMO_KEYS.publicKey
});

/**
 * Fiche contact — la vue montree sur la page d'accueil de yeria.app.
 *
 * Elle existe pour que l'exemple de code publie soit executable tel quel :
 * quatre lignes de SDK, une vue rendue nativement. Volontairement minimale
 * (nom, prenom, e-mail) — c'est l'exemple d'entree, pas la demonstration
 * exhaustive, qui vit sur `GET /api/forms`.
 */
router.get('/contact', (req: Request, res: Response) => {
  const view = YeriaUI
    .createFormView('contact', 'Nous contacter')
    .setIntro('Laissez vos coordonnées, nous revenons vers vous.')
    .addTextField('lastName', 'Nom', true, 60)
    .addTextField('firstName', 'Prénom', true, 60)
    .addEmailField('email', 'Adresse e-mail', true)
    .submitButton('Envoyer', 'POST');

  res.json(yeriaApp.serve(view));
});

/** Reponse a la fiche contact : un accuse de reception, signe lui aussi. */
/**
 * Réception de la vitrine. Renvoie ce que le serveur a REELLEMENT reçu : c'est
 * la seule façon de vérifier de visu qu'un champ `readonly` est bien transmis
 * et qu'un champ `disabled` ne l'est pas.
 */
router.post('/rich', upload.any(), (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  const lines = Object.keys(body)
    .map(k => `• ${k} = ${String(body[k]).slice(0, 60)}`)
    .concat(files.map(f => `• ${f.fieldname} = ${f.originalname} (${f.size} o)`));

  const message = YeriaUI
    .createMessageView('rich-ok', 'Reçu par le serveur', 'success')
    .setBody(
      lines.length
        ? `${lines.join('\n')}\n\n« desactive » ne doit PAS figurer ci-dessus ; « lecture_seule » doit y être.`
        : 'Aucune donnée reçue.'
    );

  res.json(yeriaApp.serve(message));
});

router.post('/contact', (req: Request, res: Response) => {
  const { lastName, firstName, email } = req.body ?? {};

  const missing = ['lastName', 'firstName', 'email'].filter(k => !req.body?.[k]);
  if (missing.length) {
    const error = YeriaUI
      .createMessageView('contact-error', 'Formulaire incomplet', 'error')
      .setBody('Merci de renseigner : nom, prénom et adresse e-mail.');
    return res.status(400).json(yeriaApp.serve(error));
  }

  const message = YeriaUI
    .createMessageView('contact-ok', 'Message reçu', 'success')
    .setBody(`Merci ${firstName} ${lastName}. Nous répondrons à ${email}.`);

  res.json(yeriaApp.serve(message));
});

/**
 * Vitrine des ajouts « formulaire riche ».
 *
 * Chaque nouveauté du SDK y est montree AVEC SON NOM, pour qu'on puisse juger
 * du rendu et pas seulement de l'existence :
 *
 *   - `addParagraph` dans ses trois tailles et ses deux emphases,
 *   - `addSeparator`, deja present mais jamais rendu jusqu'ici,
 *   - un champ en lecture seule et un champ desactive, cote a cote avec leur
 *     equivalent normal pour que la difference se voie,
 *   - un audio et une video DEJA detenus par le fournisseur, jouables mais ni
 *     remplacables ni supprimables,
 *   - `secondaryButton` sous le bouton d'envoi.
 *
 * Volontairement sans scenario : c'est un banc d'essai, pas une demonstration
 * de parcours. Les fichiers pointes sont de vrais medias servis par la
 * redirection `api/media/:name` — une URL fictive donnerait un lecteur muet,
 * qui ne prouverait rien.
 */
const richFormView = (req: Request, res: Response) => {
  // Chemins RELATIFS à la racine du service, comme partout ailleurs dans la
  // démo : le renderer les compose contre la base qu'il connaît déjà. Une URL
  // absolue bâtie sur `req.get('host')` vaudrait « localhost:8051 » — joignable
  // depuis la machine de développement, jamais depuis un téléphone.
  const media = (name: string) => `api/media/${name}`;

  const form = YeriaUI
    .createFormView('form-rich', 'Formulaire riche')
    .setIntro('Chaque bloc ci-dessous porte le nom de ce qu\'il démontre.')
    .setNote('setNote — petite mention sous l\'introduction. Le mobile la rendait déjà ; le SDK n\'avait simplement pas de setter.')

    // ── Blocs de texte ────────────────────────────────────────────────
    .addParagraph('addParagraph — size: xl (24px)', { size: 'xl' })
    .addParagraph('size: lg (18px)', { size: 'lg' })
    .addParagraph('size: md (14px) — taille par défaut', { size: 'md' })
    .addParagraph('size: sm (12px)', { size: 'sm' })
    .addParagraph('size: md, bold: true', { bold: true })
    .addParagraph('size: md, italic: true', { italic: true })
    .addParagraph('size: lg, bold + italic', { size: 'lg', bold: true, italic: true })

    .addSeparator('sep-1')
    .addParagraph('addSeparator — le trait ci-dessus. Le type existait déjà côté SDK, mais le mobile le rendait comme un champ texte.', { size: 'sm', italic: true })

    // ── Espacement ────────────────────────────────────────────────────
    .addParagraph('addSpacer — trois crans de vide, rien de dessiné', { size: 'xl' })
    .addParagraph('sm : au-dessous de cette ligne', { size: 'sm', italic: true })
    .addSpacer('sm')
    .addParagraph('md (défaut) : au-dessous de cette ligne', { size: 'sm', italic: true })
    .addSpacer()
    .addParagraph('lg : au-dessous de cette ligne', { size: 'sm', italic: true })
    .addSpacer('lg')
    .addParagraph('Fin des espaces. Un séparateur annonce un groupe, un espace laisse seulement respirer.', { size: 'sm', italic: true })

    // ── État des champs ───────────────────────────────────────────────
    .addParagraph('État des champs', { size: 'xl' })
    .addTextField('normal', 'Champ normal (pour comparer)', false, 60)
    .addField('text', 'lecture_seule', 'readonly — lisible, non modifiable, ENVOYÉ', {
      value: 'Valeur fixée par le fournisseur',
      readonly: true
    })
    .addField('text', 'desactive', 'disabled — estompé et EXCLU de la soumission', {
      value: 'Ne partira pas au serveur',
      disabled: true
    })

    .addSeparator('sep-2')

    // ── Médias déjà détenus ───────────────────────────────────────────
    .addParagraph('Média déjà détenu par le fournisseur', { size: 'xl' })
    .addParagraph('Servis avec value + readonly : la lecture fonctionne, l\'ajout et la suppression disparaissent.', { size: 'sm', italic: true })
    .addAudioField('audio_serveur', 'Audio du serveur (readonly)', false, {
      value: media('SoundHelix-Song-1.mp3'),
      readonly: true
    })
    .addVideoField('video_serveur', 'Vidéo du serveur (readonly)', false, {
      maxDuration: 60,
      value: media('Bee.mp4'),
      readonly: true
    })
    .addParagraph('Et le même champ audio, sans valeur : la capture redevient possible.', { size: 'sm', italic: true })
    .addAudioField('audio_capture', 'Audio à enregistrer (normal)', false, {
      maxDuration: 30,
      minDuration: 1
    })

    .submitButton('Envoyer', 'POST')
    .secondaryButton('secondaryButton — mode navigate', 'api/forms/rich');

  res.json(yeriaApp.serve(form));
};

router.get('/rich', richFormView);

// ---------------------------------------------------------------------
// Formulaires par famille de champs.
//
// Un formulaire unique portait les vingt-six champs : quatre mille pixels de
// haut, impossible a lire sur un telephone et impossible a comparer. Chaque
// famille tient desormais sur un ou deux ecrans, et `/api/forms` en donne
// l'index.
//
// Le decoupage suit ce que le RENDERER fait de different, pas les noms de
// types : les six champs de texte partagent un meme widget et se comparent
// donc bien cote a cote, alors que photo et fichier n'ont rien en commun.
// ---------------------------------------------------------------------

const SUBMIT = 'Soumettre le formulaire';

function formsIndex() {
  return YeriaUI
    .createActionListView('forms-index', 'FormView')
    .setIntro('Les types de champs du SDK, par famille. Chaque formulaire tient sur un ecran ou deux.')
    .addAction('api/forms/text', 'Saisie texte',
      'Texte, zone de texte, e-mail, telephone, URL, mot de passe — et deux champs caches')
    .addAction('api/forms/numbers-dates', 'Nombres et dates',
      'Bornes minimum et maximum, selecteur de date')
    .addAction('api/forms/choices', 'Choix',
      'Liste deroulante, presentation radio, cases a cocher')
    .addAction('api/forms/photos', 'Images',
      'Photo simple, capture directe imposee, plusieurs photos')
    .addAction('api/forms/files', 'Fichiers',
      'PDF seul, ou plusieurs formats bureautiques')
    .addAction('api/forms/recordings', 'Enregistrements',
      'Audio et video : duree bornee, source imposee, qualite')
    .addAction('api/forms/location', 'Localisation',
      'Position GPS et adresse en Plus Code')
    .addAction('api/forms/rich', 'Formulaire riche',
      'Paragraphes, separateur, espaces, etats readonly et disabled, media deja detenu')
    .addAction('api/forms/contact', 'Fiche contact',
      'L\'exemple publie sur la page d\'accueil du site');
}

router.get('/', (req: Request, res: Response) => {
  res.json(yeriaApp.serve(formsIndex()));
});

// Six types de saisie qui passent tous par le meme widget cote mobile : les
// voir ensemble montre ce qui les distingue vraiment — le clavier, le
// masquage, le nombre de lignes.
router.get('/text', (req: Request, res: Response) => {
  const form = YeriaUI
    .createFormView('form-text', 'Saisie texte')
    .setIntro('Six champs rendus par le meme widget. Ce qui change : le clavier, le masquage, le nombre de lignes.')
    .addTextField('username', 'Nom d\'utilisateur', true, 50)
    .addTextField('firstName', 'Prenom', false, 100)
    .addTextAreaField('bio', 'Biographie', false, 10, 500)
    .addEmailField('email', 'Adresse e-mail', true)
    .addPhoneField('phone', 'Numero de telephone', false)
    .addURLField('website', 'Site web', false)
    .addPasswordField('password', 'Mot de passe', 8)
    .addSeparator('sep-hidden')
    .addParagraph('Les deux champs ci-dessous sont caches : ils partent avec la soumission sans jamais etre dessines.', { size: 'sm', italic: true })
    .addHiddenField('referrer', 'Referrer', 'direct')
    .addHiddenField('formVersion', 'Form Version', 'v2.0')
    .submitButton(SUBMIT, 'POST');

  res.json(yeriaApp.serve(form));
});

router.get('/numbers-dates', (req: Request, res: Response) => {
  const form = YeriaUI
    .createFormView('form-numbers-dates', 'Nombres et dates')
    .setIntro('Les bornes sont declarees par le fournisseur ; le client les fait respecter avant l\'envoi.')
    .addNumberField('age', 'Age (18 a 120)', false, 18, 120)
    .addNumberField('quantity', 'Quantite (1 a 100)', true, 1, 100)
    .addDateField('birthdate', 'Date de naissance', false)
    .addDateField('appointmentDate', 'Date de rendez-vous', true)
    .submitButton(SUBMIT, 'POST');

  res.json(yeriaApp.serve(form));
});

// Meme sens — un seul choix parmi plusieurs — trois presentations. Les voir
// ensemble est exactement ce qui permet de choisir la bonne.
router.get('/choices', (req: Request, res: Response) => {
  const form = YeriaUI
    .createFormView('form-choices', 'Choix')
    .setIntro('Un menu deroulant pour beaucoup d\'options, une presentation radio pour une poignee, une case a cocher pour un oui ou non.')
    .addSelectField('country', 'Pays (liste deroulante)', true, [
      { value: 'us', label: 'Etats-Unis' },
      { value: 'ca', label: 'Canada' },
      { value: 'uk', label: 'Royaume-Uni' },
      { value: 'fr', label: 'France' },
      { value: 'de', label: 'Allemagne' }
    ])
    .addSelectField('category', 'Categorie (liste deroulante, facultative)', false, [
      { value: 'tech', label: 'Technologie' },
      { value: 'business', label: 'Business' },
      { value: 'education', label: 'Education' }
    ])
    .addSelectField('gender', 'Genre (presentation radio)', true, [
      { value: 'male', label: 'Homme' },
      { value: 'female', label: 'Femme' },
      { value: 'other', label: 'Autre' },
      { value: 'prefer-not-to-say', label: 'Prefere ne pas dire' }
    ], 'radio')
    .addCheckboxField('newsletter', 'S\'abonner a la lettre d\'information', false)
    .addCheckboxField('terms', 'J\'accepte les conditions d\'utilisation', true)
    .submitButton(SUBMIT, 'POST');

  res.json(yeriaApp.serve(form));
});

router.get('/photos', (req: Request, res: Response) => {
  const form = YeriaUI
    .createFormView('form-photos', 'Images')
    .setIntro('Le fournisseur impose les formats, la source et le nombre. Le client s\'y tient.')
    .addPhotoField('avatar', 'Photo de profil (galerie ou appareil)', false, ['jpeg', 'png'], false)
    .addPhotoField('selfie', 'Selfie en direct (appareil seul)', false, ['jpeg'], true)
    .addPhotoField('gallery', 'Plusieurs photos (4 au plus)', false, ['jpeg', 'png'], false, {
      multiple: true,
      maxCount: 4
    })
    .submitButton(SUBMIT, 'POST');

  res.json(yeriaApp.serve(form));
});

router.get('/files', (req: Request, res: Response) => {
  const form = YeriaUI
    .createFormView('form-files', 'Fichiers')
    .setIntro('Les formats acceptes sont declares champ par champ.')
    .addFileField('resume', 'CV (PDF uniquement)', false, ['application/pdf'])
    .addFileField('document', 'Document (PDF ou Word)', false, [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ])
    .submitButton(SUBMIT, 'POST');

  res.json(yeriaApp.serve(form));
});

// La duree maximale n'est pas un confort : c'est elle qui borne le poids de
// l'envoi, et c'est sur elle que la limite du serveur est calee.
router.get('/recordings', (req: Request, res: Response) => {
  const form = YeriaUI
    .createFormView('form-recordings', 'Enregistrements')
    .setIntro('Duree bornee, source imposee, qualite : ce que le fournisseur declare, le client l\'applique avant meme d\'envoyer.')
    .addAudioField('voiceNote', 'Note vocale (2 s a 2 min)', false, {
      maxDuration: 120,
      minDuration: 2,
      source: 'both'
    })
    .addAudioField('statement', 'Declaration orale (micro seul)', false, {
      maxDuration: 60,
      minDuration: 3,
      source: 'record'
    })
    .addVideoField('evidence', 'Preuve video (30 s, qualite basse)', false, {
      maxDuration: 30,
      quality: 'low',
      source: 'both',
      maxSize: 16 * 1024 * 1024
    })
    .addVideoField('walkthrough', 'Visite guidee (camera seule, 2 sequences)', false, {
      maxDuration: 20,
      quality: 'medium',
      source: 'record',
      multiple: true,
      maxCount: 2
    })
    .submitButton(SUBMIT, 'POST');

  res.json(yeriaApp.serve(form));
});

router.get('/location', (req: Request, res: Response) => {
  const form = YeriaUI
    .createFormView('form-location', 'Localisation')
    .setIntro('Deux facons de dire ou, chacune en saisie libre ou en releve par l\'appareil.')

    .addParagraph('Saisie libre', { size: 'lg' })
    .addParagraph('L\'utilisateur tape les valeurs. Le bouton de releve reste disponible pour le Plus Code.', { size: 'sm', italic: true })
    .addGPSField('location', 'Position (latitude et longitude saisies)', false, false)
    .addPlusCodeField('deliveryLocation', 'Adresse de livraison (Plus Code saisi)', false, false)

    .addSeparator('sep-live')
    .addParagraph('Releve par l\'appareil', { size: 'lg' })
    .addParagraph('En mode live, le champ GPS n\'offre plus de saisie : seul le releve remplit la valeur, affichee sans pouvoir etre modifiee. `maxAccuracy` fixe la precision MINIMALE acceptee, en metres — l\'application continue de chercher tant qu\'elle n\'y arrive pas.', { size: 'sm', italic: true })
    .addGPSField('checkin', 'Point de presence (releve seul, 30 m au plus)', false, true, {
      maxAccuracy: 30,
      altitude: true
    })
    .addPlusCodeField('pickup', 'Point de retrait (Plus Code, releve possible)', false, true)

    .submitButton(SUBMIT, 'POST');

  res.json(yeriaApp.serve(form));
});

// Accuse de reception commun a tous les formulaires de famille.
//
// Le client renvoie les valeurs a l'URL D'OU LA VUE VIENT : chaque
// formulaire doit donc avoir son POST, sinon la soumission repond 405. Le
// meme gestionnaire est monte sur tous ces chemins.
//
// Il n'valide RIEN. La version precedente controlait les champs du
// formulaire unique — nom d'utilisateur, e-mail, pays, conditions — et
// rejetait donc tout envoi depuis « Fichiers » ou « Localisation », qui ne
// les portent pas. Le role de la demo est de montrer que les donnees
// arrivent, pas de simuler des regles metier.
//
// `upload.any()` accepts whatever file parts the form declared without the
// route having to restate every fieldId. Text fields still land in req.body;
// captures land in req.files.
const FORM_POST_PATHS = [
  '/',
  '/text',
  '/numbers-dates',
  '/choices',
  '/photos',
  '/files',
  '/recordings',
  '/location',
];

router.post(FORM_POST_PATHS, upload.any(), (req: Request, res: Response) => {
  const formData = req.body ?? {};
  const uploads = (req.files as Express.Multer.File[] | undefined) ?? [];

  console.log('Form submission received:', formData);
  if (uploads.length > 0) {
    console.log(
      'Uploads received:',
      uploads.map(f => `${f.fieldname} (${f.mimetype}, ${f.size} bytes)`)
    );
  }

  // Ce que la demo doit prouver : les valeurs et les captures sont bien
  // arrivees. On les renvoie donc telles quelles.
  const entries = Object.entries(formData)
    .map(([key, value]) => `• ${key} : ${String(value)}`)
    .join('\n');
  const files = uploads
    .map(f => `• ${f.fieldname} (${f.mimetype}, ${formatBytes(f.size)})`)
    .join('\n');

  const parts = [
    entries.length > 0 ? `Champs reçus :\n${entries}` : null,
    files.length > 0 ? `Fichiers reçus :\n${files}` : null,
  ].filter(Boolean);

  const message = YeriaUI
    // Le 3e argument du constructeur est le processId, PAS la gravite : la
    // passer la laissait a « info ». Elle se pose par setSeverity.
    .createMessageView('form-received', 'Données reçues')
    .setSeverity('success')
    .setBody(
      parts.length > 0
        ? parts.join('\n\n')
        : 'Le formulaire est arrivé sans aucune valeur.'
    )
    // Deux boutons, chacun avec son issue : le premier MENE a l'index, le
    // second ferme et laisse l'utilisateur sur son formulaire.
    // `back` ne recharge RIEN : l'index est deja dans la pile, sous le
    // formulaire. Le redemander posait une seconde copie par-dessus, et le
    // geste de retour ramenait sur le formulaire deja soumis.
    .addAction('Retour aux exemples', { back: 1 })
    .addAction('OK');

  res.json(yeriaApp.serve(message));
});

/**
 * Multer rejects an oversized or over-numerous upload by throwing, which the
 * default Express handler turns into an HTML 500 the mobile renderer cannot
 * parse. Answer with a signed MessageView instead, so the user sees why.
 */
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!(err instanceof multer.MulterError)) return next(err);

  const body = err.code === 'LIMIT_FILE_SIZE'
    ? 'Le fichier envoyé dépasse la taille acceptée par ce service (32 Mo).'
    : `Envoi refusé : ${err.message}`;

  const message = YeriaUI
    .createMessageView('form-upload-error', 'Envoi refusé', 'error')
    .setBody(body);

  res.status(413).json(yeriaApp.serve(message));
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default router;