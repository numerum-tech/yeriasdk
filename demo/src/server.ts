// Load .env BEFORE any route module so env-var overrides (e.g. DEMO_PRIVATE_KEY)
// are visible at module-evaluation time.
import dotenv from 'dotenv';
dotenv.config();

import express, { Application, Request, Response, Router } from 'express';
import cors from 'cors';
import path from 'path';
import { ActionGridView, IconGridView, YeriaApp } from '@numerum-tech/yeriasdk';
import { DEMO_KEYS } from './security/demo-keys';
import { buildYeriaAuthMiddleware } from './security/auth';

// Routes
import formsRouter from './routes/forms';
import readersRouter from './routes/readers';
import actionsRouter from './routes/actions';
import actionGridRouter from './routes/action-grid';
import qrRouter from './routes/qr';
import messagesRouter from './routes/messages';
import cardsRouter from './routes/cards';
import carouselsRouter from './routes/carousels';
import timelinesRouter from './routes/timelines';
import mediaRouter from './routes/media';
import mapsRouter from './routes/maps';
import { buildUserDetailsRouter } from './routes/user-details';

const app: Application = express();
const PORT = parseInt(process.env.PORT || '8051', 10);

// BASE_PATH lets the demo run behind a reverse proxy at e.g. /apps/demo.
// Strip any trailing slash; an empty value means "mount at root".
//
// IMPORTANT: BASE_PATH governs *Express route mounting only*. URLs returned in
// SDK payloads (action codes, submit URLs, etc.) must NOT include BASE_PATH —
// the mobile renderer prepends the service base URL itself, so any prefix
// embedded in the response double-prefixes (e.g. /apps/demo/apps/demo/...).
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static — served under BASE_PATH so /apps/demo/foo.png resolves correctly.
app.use(BASE_PATH || '/', express.static(path.join(__dirname, '../public')));

// All demo routes live under a sub-router so BASE_PATH applies uniformly.
const demo = Router();

// ── Public media (registered BEFORE the auth gate) ────────────────────
// Media is fetched by the player WITHOUT an Authorization header (separate
// from the JSON API), so this must be reachable without a token. Static
// images live in public/img and are served by express.static (also public).
demo.get('/api/media/:name', (req: Request, res: Response) => {
    const target = MEDIA_MAP[String(req.params.name)];
    if (!target) {
        res.status(404).json({ error: 'Unknown media', name: req.params.name });
        return;
    }
    res.redirect(302, target);  // CDN-redirect pattern: player follows the 302
});

// ── Auth gate ─────────────────────────────────────────────────────────
// Every demo route requires a valid Yeria-issued user token. The mobile
// renderer attaches `Authorization: Bearer <token>` on each request to the
// service base; the middleware verifies signature + kid against Yeria's
// public registry, enforces aud='yeria' / iss='yeria' / exp, and 401s
// otherwise. The /health endpoint stays open because it's mounted outside
// this router for container probes.
const YERIA_BASE_URL = (process.env.YERIA_BASE_URL || '').trim();
if (!YERIA_BASE_URL) {
    // Fail fast at boot rather than letting unauthenticated requests through
    // because the middleware couldn't be wired. A misconfigured deploy is a
    // misconfigured deploy — better an unhealthy container than an open one.
    throw new Error(
        '[yeria-demo] YERIA_BASE_URL is required (e.g. https://yeria.app) — ' +
        'the demo refuses to start without a Yeria registry it can verify ' +
        'incoming user tokens against.'
    );
}
// This demo is registered as a Yeria service; user tokens carry aud = its
// opaque public_id (not the internal sequential id).
const DEMO_SERVICE_ID = (process.env.DEMO_SERVICE_ID || 'demo-app').trim();

demo.use(buildYeriaAuthMiddleware({ yeriaBaseUrl: YERIA_BASE_URL }));

// All demo assets are emitted as RELATIVE paths (resolved by the client
// against the service base) per the asset-resolution policy — the demo never
// returns absolute image/media URLs. Images are STATIC PNG files generated into
// `public/img/` by scripts/generate-assets.mjs and served by express.static at
// `<base>/img/<name>.png`. Sample media is reached via a relative
// `api/media/:name` that 302-redirects to the real sample URL (CDN pattern).
const ICON = (name: string) => `img/${name}.png`;

// Real sample media, reached via a relative `api/media/:name` redirect so the
// view JSON carries no absolute URLs (player follows the 302).
const MEDIA_MAP: Record<string, string> = {
    // Public sample videos (the old gtv-videos-bucket samples now 403). Keys
    // match the actual clip behind each redirect (see routes/media.ts titles).
    'BigBuckBunny.mp4': 'https://media.w3.org/2010/05/bunny/movie.mp4',
    'Sintel.mp4': 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    'Bee.mp4': 'https://flutter.github.io/assets-for-api-docs/assets/videos/bee.mp4',
    'Butterfly.mp4': 'https://flutter.github.io/assets-for-api-docs/assets/videos/butterfly.mp4',
    'W3CSample.mp4': 'https://media.w3.org/2010/05/video/movie_300.mp4',
    'SoundHelix-Song-1.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'SoundHelix-Song-2.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'SoundHelix-Song-3.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    'SoundHelix-Song-4.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    'SoundHelix-Song-5.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    'SoundHelix-Song-6.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    'SoundHelix-Song-7.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    'SoundHelix-Song-8.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
};

// YeriaApp instance for the home grid. Every payload the renderer consumes
// must be signed — the home view is no exception.
const homeApp = new YeriaApp({
    appId: 'demo-app-home',
    viewExpirationMinutes: 30,
    privateKey: DEMO_KEYS.privateKey,
    publicKey: DEMO_KEYS.publicKey,
});

// Home — ActionGridView linking every demo route. Action codes are paths
// RELATIVE to the demo's service root (no BASE_PATH baked in); the mobile
// renderer composes them against the service base it already knows.
demo.get('/', (req: Request, res: Response) => {
    const grid = new ActionGridView('home', 'Yeria SDK - Tous les types de vues');
    grid.setColumns(3);
    grid.setSpacing(16);
    grid.addAction('/api/forms/contact', 'Fiche contact', 'L\'exemple publie sur la page d\'accueil : nom, prenom, e-mail', ICON('account-circle-outline'));
    grid.addAction('/api/forms', 'FormView', 'Index des types de champs, par famille : texte, nombres, choix, images, fichiers, enregistrements, localisation', ICON('edit-document-outline'));
    grid.addAction('/api/forms/rich', 'Formulaire riche', 'Paragraphes nommes, separateur, espaces, readonly/disabled, medias deja fournis, second bouton', ICON('mic-none-outline'));
    grid.addAction('/api/readers', 'ReaderView', 'Affichage de contenu riche avec plusieurs types d\'éléments', ICON('menu-book-outline'));
    grid.addAction('/api/readers/paged/1', 'Lecteur paginé', 'Document en trois pages : flèches et indicateur « Page 1 / 3 » dessinés par le client', ICON('menu-book-outline'));
    grid.addAction('/api/cards', 'CardView', 'Vue fiche produit compacte avec statistiques et actions', ICON('credit-card-outline'));
    grid.addAction('/api/actions', 'ActionListView', 'Liste verticale d\'éléments actionnables avec icônes', ICON('list-alt-outline'));
    grid.addAction('/api/action-grid', 'ActionGridView', 'Disposition en grille d\'éléments actionnables', ICON('apps'));
    grid.addAction('/api/icon-grid', 'IconGridView', 'Grille de tuiles icônes (cercle/carré) avec libellé', ICON('grid-view-outline'));
    grid.addAction('/api/carousels', 'CarouselView', 'Affichage diaporama pour images et contenu', ICON('view-carousel-outline'));
    grid.addAction('/api/timelines', 'TimelineView', 'Affichage chronologique des événements', ICON('timeline'));
    grid.addAction('/api/messages', 'MessageView', 'Afficher des messages et notifications', ICON('chat-bubble-outline'));
    grid.addAction('/api/qr', 'QR Views', 'Scan et affichage de codes QR', ICON('qr-code-scanner'));
    grid.addAction('/api/media', 'MediaView', 'Lecteur vidéo et audio avec contrôles', ICON('play-circle-outline'));
    grid.addAction('/api/maps', 'MapView', 'Cartes interactives avec marqueurs', ICON('map-outline'));
    grid.addAction('/api/user-details', 'User Details', 'Récupère les infos de l\'utilisateur Yeria via fetchUserDetails (token)', ICON('account-circle-outline'));
    res.json(homeApp.serve(grid));
});

// IconGrid demo — app-launcher style image tiles (circle) with captions,
// plus a badge and a disabled tile to exercise those states.
demo.get('/api/icon-grid', (req: Request, res: Response) => {
    const view = new IconGridView('icon-grid-demo', 'IconGridView');
    view.setIntro('Tuiles icônes cercle/carré avec libellé sous l\'icône');
    view.setShape('circle');
    view.setColumns(4);
    view.addIcon('/api/forms', 'Formulaires', ICON('edit-document-outline'));
    view.addIcon('/api/readers', 'Lecteur', ICON('menu-book-outline'));
    view.addIcon('/api/cards', 'Fiches', ICON('credit-card-outline'), '3');
    view.addIcon('/api/qr', 'QR', ICON('qr-code-scanner'));
    view.addIcon('/api/maps', 'Cartes', ICON('map-outline'));
    view.addIcon('/api/media', 'Média', ICON('play-circle-outline'));
    view.addIcon('/api/timelines', 'Frise', ICON('timeline'));
    view.addIcon('/api/soon', 'Bientôt', ICON('lock-outline'), undefined, true);
    res.json(homeApp.serve(view));
});

// API index — same convention: relative paths only.
demo.get('/api', (req: Request, res: Response) => {
    res.json({
        name: 'Yeria SDK Demo API',
        version: '1.0.0',
        description: 'Comprehensive demo exercising every Yeria SDK view',
        basePath: BASE_PATH || '/',
        endpoints: {
            forms: '/api/forms',
            'forms-contact': '/api/forms/contact',
            readers: '/api/readers',
            actions: '/api/actions',
            'action-grid': '/api/action-grid',
            cards: '/api/cards',
            carousels: '/api/carousels',
            timelines: '/api/timelines',
            messages: '/api/messages',
            qr: '/api/qr',
            media: '/api/media',
            maps: '/api/maps'
        }
    });
});

demo.use('/api/forms', formsRouter);
demo.use('/api/readers', readersRouter);
demo.use('/api/actions', actionsRouter);
demo.use('/api/action-grid', actionGridRouter);
demo.use('/api/qr', qrRouter);
demo.use('/api/messages', messagesRouter);
demo.use('/api/cards', cardsRouter);
demo.use('/api/carousels', carouselsRouter);
demo.use('/api/timelines', timelinesRouter);
demo.use('/api/media', mediaRouter);
demo.use('/api/maps', mapsRouter);
demo.use('/api/user-details', buildUserDetailsRouter(YERIA_BASE_URL, DEMO_SERVICE_ID));

// Health — always at /health (not behind the prefix), useful for container probes.
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Mount the demo under the configured prefix.
app.use(BASE_PATH || '/', demo);

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.url}` });
});

app.listen(PORT, '0.0.0.0', () => {
    const mount = BASE_PATH || '/';
    console.log(`[yeria-demo] listening on :${PORT}, mounted at ${mount}`);
});

export default app;
