import { Router, Request, Response } from 'express';
import { YeriaApp, YeriaUI } from '@numerum-tech/yeriasdk';
import { DEMO_KEYS } from '../security/demo-keys';

const router = Router();

const yeriaApp = new YeriaApp({
  appId: 'demo-app-messages',
  viewExpirationMinutes: 30,
  privateKey: DEMO_KEYS.privateKey,
  publicKey: DEMO_KEYS.publicKey
});

// Comprehensive MessageView demonstration - ActionListView showing all message types
router.get('/', (req: Request, res: Response) => {
  const actionList = YeriaUI
    .createActionListView('message-types', 'MessageView')

    // Message INFO
    .addAction('/api/messages/info', 'Message Info 💙', 'Message informatif avec notification importante et actions', 'ℹ️', false)

    // Message SUCCESS
    .addAction('/api/messages/success', 'Message Success 💚', 'Message de succès pour confirmer une opération réussie', '✅', false)

    // Message WARNING
    .addAction('/api/messages/warning', 'Message Warning 🧡', 'Message d\'avertissement pour alerter l\'utilisateur', '⚠️', false)

    // Message ERROR
    .addAction('/api/messages/error', 'Message Error ❤️', 'Message d\'erreur critique nécessitant une attention', '❌', false);

  res.json(yeriaApp.serve(actionList));
});

// Message INFO
router.get('/info', (req: Request, res: Response) => {
  const infoMessage = YeriaUI
    .createMessageView('info-message', 'Message d\'Information')
    .setIntro('Notification importante')
    .setBody('Ceci est un message informatif. Il fournit des informations utiles à l\'utilisateur. Vous pouvez le fermer en cliquant sur ignorer ou continuer pour en savoir plus.')
    .setSeverity('info')
    .addAction('En Savoir Plus')
    .addAction('Ignorer')
    .setMetadata({
      messageId: 'MSG-INFO-001',
      category: 'information',
      priority: 'normal',
      timestamp: new Date().toISOString()
    });

  res.json(yeriaApp.serve(infoMessage));
});

// Message SUCCESS
router.get('/success', (req: Request, res: Response) => {
  const successMessage = YeriaUI
    .createMessageView('success-message', 'Opération Réussie !')
    .setIntro('Confirmation de succès')
    .setBody('Votre paiement de 299,99 € a été traité avec succès. Un email de confirmation a été envoyé à votre adresse enregistrée.')
    .setSeverity('success')
    .addAction('Voir le Reçu')
    .addAction('Continuer les Achats')
    .setMetadata({
      messageId: 'MSG-SUCCESS-001',
      category: 'payment',
      priority: 'high',
      timestamp: new Date().toISOString(),
      transactionId: 'TXN-2024-789456',
      amount: 299.99
    });

  res.json(yeriaApp.serve(successMessage));
});

// Message WARNING
router.get('/warning', (req: Request, res: Response) => {
  const warningMessage = YeriaUI
    .createMessageView('warning-message', 'Attention : Stockage Presque Plein')
    .setIntro('Avertissement : Espace Faible')
    .setBody('Votre stockage est utilisé à 92%. Envisagez de mettre à niveau votre forfait ou de supprimer des fichiers inutiles pour libérer de l\'espace et éviter toute interruption de service.')
    .setSeverity('warning')
    .addAction('Mettre à Niveau')
    .addAction('Gérer les Fichiers')
    .setMetadata({
      messageId: 'MSG-WARNING-001',
      category: 'storage',
      priority: 'high',
      timestamp: new Date().toISOString(),
      storageUsed: 92,
      storageLimit: 100
    });

  res.json(yeriaApp.serve(warningMessage));
});

// Message ERROR
router.get('/error', (req: Request, res: Response) => {
  const errorMessage = YeriaUI
    .createMessageView('error-message', 'Erreur de Connexion')
    .setIntro('Impossible de se connecter')
    .setBody('Nous n\'avons pas pu nous connecter au serveur. Veuillez vérifier votre connexion Internet et réessayer. Si le problème persiste, contactez le support.')
    .setSeverity('error')
    .addAction('Réessayer')
    .addAction('Contacter le Support')
    .setMetadata({
      messageId: 'MSG-ERROR-001',
      category: 'connection',
      priority: 'critical',
      timestamp: new Date().toISOString(),
      errorCode: 'ERR_CONNECTION_FAILED',
      retryCount: 3
    });

  res.json(yeriaApp.serve(errorMessage));
});

export default router;
