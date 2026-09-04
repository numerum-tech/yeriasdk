import { Router, Request, Response } from 'express';
import { YeriaApp, YeriaUI, QRScanView } from '@numerum-tech/yeriasdk';
import QRCode from 'qrcode';
import { DEMO_KEYS } from '../security/demo-keys';

const router = Router();

const yeriaApp = new YeriaApp({
  appId: 'demo-app-qr',
  viewExpirationMinutes: 30,
  privateKey: DEMO_KEYS.privateKey,
  publicKey: DEMO_KEYS.publicKey
});

// Main QR route - ActionListView showing QR view types
router.get('/', (req: Request, res: Response) => {
  const actionList = YeriaUI
    .createActionListView('qr-types', 'QR Views')
    .addAction('/api/qr/scan/auto', 'QRScanView — auto 📷', 'Scan validé puis envoyé immédiatement, sans confirmation', '📱', false)
    .addAction('/api/qr/scan/preview', 'QRScanView — confirmation 👁️', 'Scan validé, code affiché, envoi sur bouton', '✅', false)
    .addAction('/api/qr/display', 'QRDisplayView 🔲', 'Afficher un QR code unique', '🖼️', false);

  res.json(yeriaApp.serve(actionList));
});

/** Format accepted by both scan demos: "PROD-" then 6 to 12 digits. */
const PRODUCT_CODE = /^PROD-\d{6,12}$/;
const PRODUCT_CODE_RULE = 'Le code doit commencer par "PROD-" suivi de 6 à 12 chiffres';

/** Applies the rule above to a view, in the SDK's parameter order. */
const withProductValidation = (view: QRScanView): QRScanView =>
  view.setValidation(PRODUCT_CODE_RULE, 'number', 11, 17, 'PROD-');

// Auto-submit demo — no preview, no button: a valid scan is posted right away.
// This is the QRScanView default (`autoSubmit` is true unless a submit button
// is set), and the flow every scanner should use when the scanned value means
// nothing to the user on its own.
router.get('/scan/auto', (req: Request, res: Response) => {
  const scanner = withProductValidation(
    YeriaUI
      .createQRScanView('qr-scan-auto', 'Scan automatique')
      .setIntro('Scannez un code produit : dès qu\'il est valide, il part au service sans confirmation. Un code refusé arrête le scanner et affiche la raison.')
  );

  res.json(yeriaApp.serve(scanner));
});

// Confirmation demo — the scanned value is shown (read-only) and only leaves
// on an explicit tap. A submit button disables auto-submission; the preview is
// what makes the extra step useful, by letting the user check WHICH code was
// read before acting on it.
router.get('/scan/preview', (req: Request, res: Response) => {
  const scanner = withProductValidation(
    YeriaUI
      .createQRScanView('qr-scan-preview', 'Scan avec confirmation')
      .setIntro('Scannez un code produit : il vous est affiché pour vérification et n\'est envoyé qu\'après confirmation.')
  )
    .enablePreview('Code Produit Scanné')
    // `confirmMessage` is rendered as help text next to the scanned value,
    // not as a dialog: the preview plus an explicit tap already are the
    // confirmation step (specs/qr-scan-view.md).
    .submitButton('Vérifier le Produit', 'Comparez la référence avec celle imprimée sur l\'étiquette avant de valider.');

  res.json(yeriaApp.serve(scanner));
});

// QRScanView submission handler, shared by both demos.
//
// Convention: the mobile app posts the scanned value as `{ qrData: "..." }`
// to the very URL that served the view. Server-side re-validation is
// mandatory: the client-side rules are a UX affordance, not a guarantee.
const handleScanSubmission = (req: Request, res: Response) => {
  const qrData = typeof req.body?.qrData === 'string' ? req.body.qrData.trim() : '';

  console.log(`QR scan submission received on ${req.originalUrl}:`, qrData);

  if (!PRODUCT_CODE.test(qrData)) {
    const errorMessage = YeriaUI
      .createMessageView('qr-scan-error', 'Code produit invalide', 'error')
      .setBody(
        qrData.length === 0
          ? 'Aucun code n\'a été reçu par le service.'
          : `Le code « ${qrData} » ne respecte pas le format attendu : "PROD-" suivi de 6 à 12 chiffres.`
      );

    return res.status(400).json(yeriaApp.serve(errorMessage));
  }

  const successMessage = YeriaUI
    .createMessageView('qr-scan-success', 'Produit vérifié', 'success')
    .setBody(
      `Le produit ${qrData} a bien été vérifié.\n\nRéférence de contrôle : QR-${qrData.slice(5)}\nDate : ${new Date().toISOString()}`
    );

  res.json(yeriaApp.serve(successMessage));
};

router.post('/scan/auto', handleScanSubmission);
router.post('/scan/preview', handleScanSubmission);

// Single QRDisplayView sample — QRDisplayView is single-QR-per-view. The QR is
// supplied by the provider as a self-contained base64 PNG (no external host),
// encoding the text "Yeria SDK".
router.get('/display', async (req: Request, res: Response) => {
  const qrDataUri = await QRCode.toDataURL('Yeria SDK', {
    errorCorrectionLevel: 'H',
    width: 250,
    margin: 1,
  });

  const display = YeriaUI
    .createQRDisplayView('qr-display-sample', 'QRDisplayView')
    .setIntro('Démonstration de QRDisplayView : un QR code fourni par le service.')
    .setQRCode(
      qrDataUri,
      'Yeria SDK',
      'Ce QR code encode le texte « Yeria SDK ».\n\nScannez-le pour vérifier le rendu.',
      {
        size: 250,
        errorCorrection: 'H'
      }
    )
    .submitButton('Partager', 'POST');

  res.json(yeriaApp.serve(display));
});

export default router;
