/**
 * MessageView : une boîte de dialogue, ses boutons et leurs issues.
 *
 * Le modèle suit les boîtes classiques — un jeu de boutons, une gravité, une
 * issue par bouton. La seule différence tient à la distance : `MsgBox` rendait
 * à l'appelant le bouton pressé pour qu'il décide ; ici le fournisseur n'est
 * pas là au moment du clic, l'issue voyage donc avec le bouton.
 */
import { MessageView } from '../src/core/message-view';
import { InvalidParameterError } from '../src/errors';

const content = (v: MessageView) => v.toJSON().content as any;

const aMessage = () => new MessageView('m', 'Titre').setBody('Corps');

describe('MessageView — actions', () => {
    it('starts with none, and emits an empty list', () => {
        expect(content(aMessage()).actions).toEqual([]);
    });

    it('an action without `go` closes and carries nothing else', () => {
        const v = aMessage().addAction('OK');
        expect(content(v).actions).toEqual([{ label: 'OK' }]);
    });

    it('an action with `go` carries its target', () => {
        const v = aMessage().addAction('Voir la commande', { go: '/orders/4718' });
        expect(content(v).actions).toEqual([
            { label: 'Voir la commande', go: '/orders/4718' },
        ]);
    });

    it('keeps the method only alongside a target', () => {
        const v = aMessage().addAction('Supprimer', { go: '/items/1', method: 'DELETE' });
        expect(content(v).actions[0].method).toBe('DELETE');
        expect(() => aMessage().addAction('OK', { method: 'POST' }))
            .toThrow(InvalidParameterError);
    });

    it('refuses a third action', () => {
        const v = aMessage().addAction('Un').addAction('Deux');
        expect(() => v.addAction('Trois')).toThrow(InvalidParameterError);
    });

    it('refuses an empty label', () => {
        ['', '   '].forEach(bad =>
            expect(() => aMessage().addAction(bad)).toThrow(InvalidParameterError));
    });

    it('refuses a bare view id as a target', () => {
        // Rien sur le fil ne le distingue d'un chemin relatif.
        expect(() => aMessage().addAction('Suite', { go: 'step-two' }))
            .toThrow(InvalidParameterError);
    });

    it('clearActions empties the list', () => {
        const v = aMessage().addAction('Un').addAction('Deux').clearActions();
        expect(content(v).actions).toEqual([]);
    });
});

describe('MessageView — noms historiques', () => {
    it('setPrimaryAction maps its confirmMessage onto `go`', () => {
        // La destination voyageait dans un champ nommé pour un texte de
        // confirmation ; le code des fournisseurs existants doit continuer.
        const v = aMessage().setPrimaryAction('Retour', 'GET', 'api/forms');
        expect(content(v).actions).toEqual([
            { label: 'Retour', go: 'api/forms', method: 'GET' },
        ]);
    });

    it('setPrimaryAction without a target simply closes', () => {
        expect(content(aMessage().setPrimaryAction('OK')).actions)
            .toEqual([{ label: 'OK' }]);
    });

    it('setSecondaryAction adds the second button', () => {
        const v = aMessage().setPrimaryAction('Aller', 'GET', '/x').setSecondaryAction('OK');
        expect(content(v).actions.map((a: any) => a.label)).toEqual(['Aller', 'OK']);
    });

    it('clearSecondaryAction keeps only the first', () => {
        const v = aMessage().addAction('Un').addAction('Deux').clearSecondaryAction();
        expect(content(v).actions.map((a: any) => a.label)).toEqual(['Un']);
    });
});

describe('MessageView — le reste du contenu', () => {
    it('no longer emits confirm, cancel or canDismiss', () => {
        // Trois clés supprimées : un `confirm` fantôme que personne n'avait
        // demandé, un `cancel` qui ne s'affichait que si `canDismiss` était
        // vrai, et ce booléen qui pouvait produire une boîte sans issue.
        const c = content(aMessage().addAction('OK'));
        ['confirm', 'cancel', 'canDismiss'].forEach(key =>
            expect(c[key]).toBeUndefined());
    });

    it('severity defaults to info and is set on its own', () => {
        expect(content(aMessage()).severity).toBe('info');
        expect(content(aMessage().setSeverity('success')).severity).toBe('success');
    });
});

describe('MessageView — reculer sans recharger', () => {
    // Reculer ne redemande rien : l'écran visé est déjà dans la pile, avec
    // l'état où l'utilisateur l'avait laissé. C'est ce qui distingue `back`
    // de `go`, qui pose une vue NEUVE.
    const aMessage = () => new MessageView('m', 'Titre').setBody('Corps');
    const content = (v: MessageView) => v.toJSON().content as any;

    it('carries the number of screens to step back', () => {
        const v = aMessage().addAction('Retour à la liste', { back: 1 });
        expect(content(v).actions).toEqual([
            { label: 'Retour à la liste', back: 1 },
        ]);
    });

    it("accepts 'root', the only position a provider knows for sure", () => {
        // La vue servie par l'URL de base, quel que soit le chemin parcouru.
        const v = aMessage().addAction('Accueil', { back: 'root' });
        expect(content(v).actions[0].back).toBe('root');
    });

    it('refuses zero, a negative or a fraction', () => {
        [0, -1, 1.5].forEach(bad => {
            expect(() => aMessage().addAction('X', { back: bad as number }))
                .toThrow(InvalidParameterError);
        });
    });

    it('refuses to both load and step back', () => {
        expect(() => aMessage().addAction('X', { go: '/a', back: 1 }))
            .toThrow(InvalidParameterError);
    });

    it('refuses a method alongside back', () => {
        expect(() => aMessage().addAction('X', { back: 1, method: 'POST' }))
            .toThrow(InvalidParameterError);
    });
});

describe('MessageView — les trois textes', () => {
    // `title` nomme la fenêtre, `intro` est la première ligne — un sous-titre
    // — et `body` est ce que le message DIT. Un message sans corps n'a rien à
    // dire ; une intro sans corps non plus.
    it('refuses a message with no body', () => {
        expect(() => new MessageView('m', 'Titre').build()).toThrow();
        expect(() => new MessageView('m', 'Titre').setIntro('Une ligne').build())
            .toThrow();
    });

    it('accepts a body on its own', () => {
        const v = new MessageView('m', 'Titre').setBody('Corps');
        expect((v.toJSON().content as any).body).toBe('Corps');
        expect((v.toJSON().content as any).intro).toBeUndefined();
    });

    it('keeps the intro optional alongside the body', () => {
        const v = new MessageView('m', 'Titre').setBody('Corps').setIntro('Ligne');
        const c = v.toJSON().content as any;
        expect([c.title, c.intro, c.body]).toEqual(['Titre', 'Ligne', 'Corps']);
    });
});
