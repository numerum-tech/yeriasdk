/**
 * Contrat des textes d'en-tête, commun aux 12 vues.
 *
 * Une intro (ou un sous-titre) se pose ou n'existe pas : émettre `intro: ''`
 * faisait réserver au renderer mobile la bande d'une ligne absente — mesuré
 * sur ReaderView, premier élément à 135 px au lieu de 84 px.
 *
 * Miroir de py/tests/test_intro_fields.py::TestHeaderTextContract.
 */

import { ActionListView } from '../src/core/action-list-view';
import { ActionGridView } from '../src/core/action-grid-view';
import { CardView } from '../src/core/card-view';
import { CarouselView } from '../src/core/carousel-view';
import { FormView } from '../src/core/form-view';
import { IconGridView } from '../src/core/icon-grid-view';
import { MapView } from '../src/core/map-view';
import { MediaView } from '../src/core/media-view';
import { MessageView } from '../src/core/message-view';
import { QRDisplayView } from '../src/core/qr-display-view';
import { QRScanView } from '../src/core/qr-scan-view';
import { ReaderView } from '../src/core/reader-view';
import { TimelineView } from '../src/core/timeline-view';
import { InvalidParameterError } from '../src/errors';

type Setter = [name: string, make: () => any, call: (v: any, s: string) => void, key: string];

const intro = (v: any, s: string) => v.setIntro(s);
const subtitle = (v: any, s: string) => v.setSubtitle(s);

const SETTERS: Setter[] = [
    ['ActionListView.setIntro', () => new ActionListView('v', 'T'), intro, 'intro'],
    ['ActionGridView.setIntro', () => new ActionGridView('v', 'T'), intro, 'intro'],
    ['MapView.setIntro', () => new MapView('v', 'T'), intro, 'intro'],
    ['ReaderView.setIntro', () => new ReaderView('v', 'T'), intro, 'intro'],
    ['QRScanView.setIntro', () => new QRScanView('v', 'T'), intro, 'intro'],
    ['QRDisplayView.setIntro', () => new QRDisplayView('v', 'T'), intro, 'intro'],
    ['MessageView.setIntro', () => new MessageView('v', 'T'), intro, 'intro'],
    ['TimelineView.setIntro', () => new TimelineView('v', 'T'), intro, 'intro'],
    ['MediaView.setIntro', () => new MediaView('v', 'T'), intro, 'intro'],
    ['IconGridView.setIntro', () => new IconGridView('v', 'T'), intro, 'intro'],
    ['FormView.setIntro', () => new FormView('v', 'T'), intro, 'intro'],
    ['CarouselView.setIntro', () => new CarouselView('v', 'T'), intro, 'intro'],
    ['CardView.setIntro', () => new CardView('v', 'T'), intro, 'intro'],
    ['CarouselView.setSubtitle', () => new CarouselView('v', 'T'), subtitle, 'intro'],
    ['CardView.setSubtitle', () => new CardView('v', 'T'), subtitle, 'intro'],
    ['CardView.setDescription', () => new CardView('v', 'T'),
        (v, s) => v.setDescription(s), 'description'],
    ['CardView.setStatsHeading', () => new CardView('v', 'T'),
        (v, s) => v.setStatsHeading(s), 'statsHeading'],
];

describe.each(SETTERS)('%s', (_name, make, call, key) => {
    it('leaves the key absent until it is set', () => {
        expect(make().content[key]).toBeUndefined();
    });

    it('refuses a blank value', () => {
        // CardView divergeait : il stockait '' sans broncher.
        ['', '   '].forEach(blank => {
            expect(() => call(make(), blank)).toThrow(InvalidParameterError);
        });
    });

    it('trims what it stores', () => {
        const view = make();
        call(view, '  texte  ');
        expect(view.content[key]).toBe('texte');
    });
});

describe('setSubtitle stays as an alias', () => {
    // Le nom historique doit rester interchangeable, sans quoi les
    // fournisseurs qui l'utilisent verraient leur ligne disparaître.
    it('CardView: setSubtitle and setIntro produce the same content', () => {
        // Card exige une description, une stat ou une section pour être valide.
        const bySubtitle = new CardView('c', 'T').setSubtitle('Ligne de contexte').addStat('a', '1');
        const byIntro = new CardView('c', 'T').setIntro('Ligne de contexte').addStat('a', '1');
        // metadata.createdAt porte l'heure : comparer le contenu, seul objet de l'alias.
        expect(JSON.stringify(bySubtitle.content)).toBe(JSON.stringify(byIntro.content));
    });

    it('CarouselView: setSubtitle and setIntro produce the same content', () => {
        const bySubtitle = new CarouselView('c', 'T').setSubtitle('Ligne de contexte').addSlide({ id: 's', title: 'Slide' });
        const byIntro = new CarouselView('c', 'T').setIntro('Ligne de contexte').addSlide({ id: 's', title: 'Slide' });
        // metadata.createdAt porte l'heure : comparer le contenu, seul objet de l'alias.
        expect(JSON.stringify(bySubtitle.content)).toBe(JSON.stringify(byIntro.content));
    });

    it('no view emits a subtitle key any more', () => {
        const card = new CardView('c', 'T').setSubtitle('x').addStat('a', '1').toJSON();
        const carousel = new CarouselView('c', 'T')
            .setSubtitle('x')
            .addSlide({ id: 's', title: 'Slide' })
            .toJSON();
        [card, carousel].forEach(view => {
            expect((view.content as Record<string, unknown>)['subtitle']).toBeUndefined();
            expect((view.content as Record<string, unknown>)['intro']).toBe('x');
        });
    });
});
