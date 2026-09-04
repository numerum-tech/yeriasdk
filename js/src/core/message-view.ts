import { BaseView } from './base-view';
import { HttpMethod } from '../types';
import { InvalidParameterError } from '../errors';

export type MessageSeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * Un bouton de la boîte, et ce qu'il fait.
 *
 * Sans `go`, il FERME — c'est tout ce qu'il fait. Avec `go`, il charge cette
 * vue, qui entre dans la pile selon ses propres règles.
 *
 * Le modèle vient des boîtes de dialogue classiques : un jeu de boutons, une
 * icône de gravité, et une issue par bouton. La seule différence tient à la
 * distance : là où `MsgBox` rendait à l'appelant le bouton pressé pour qu'il
 * décide, le fournisseur n'est pas là au moment du clic — l'issue voyage donc
 * avec le bouton.
 */
export interface MessageAction {
    label: string;
    go?: string;            // chemin ou URL : charge cette vue
    method?: HttpMethod;    // avec `go` seulement ; défaut GET
    back?: number | 'root'; // recule dans la pile, sans rien recharger
    // Aucun des deux ⇒ le bouton ferme, et c'est tout.
}

export interface MessageContent {
    title: string;
    intro?: string;
    body: string;
    severity: MessageSeverity;
    /** Zéro, une ou deux. Vide ⇒ le client dessine un unique « OK ». */
    actions: MessageAction[];
    meta?: Record<string, unknown>;
}

/**
 * Builds a Message SGUI view — a titled notice/dialog with a severity and up to
 * two actions.
 *
 * `setBody`/`setIntro`/`setSeverity` set the content and tone; `setPrimaryAction`
 * and `setSecondaryAction` (aliased by `submitButton`) define the confirm/cancel
 * buttons, and `setDismissible` controls whether it can be closed without acting.
 *
 * Extends {@link BaseView}; instantiated by the YeriaApp/YeriaUI factory,
 * populated with these builders, then serialized to a JSON view description and
 * signed into a v3 envelope by `serve()`.
 */
export class MessageView extends BaseView {

    static fromJson(json: Record<string, unknown>): MessageView {
        return MessageView.fromJsonAs(MessageView, 'Message', json);
    }
    constructor(viewId: string, title: string, processId?: string) {
        super({
            id: viewId,
            type: 'Message',
            processId,
            metadata: {
                version: '1.0.0',
                createdAt: new Date()
            }
        });

        this.content = {
            title,
            body: '',
            severity: 'info',
            actions: []
        } as MessageContent;
    }

    /**
     * Sets the introduction text
     */
    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    /**
     * Sets the main body of the message
     */
    setBody(body: string): this {
        if (!body || body.trim().length === 0) {
            throw new InvalidParameterError('body', body, 'Message body cannot be empty');
        }

        (this.content as MessageContent).body = body.trim();
        return this;
    }

    /**
     * Sets the message severity (info, success, warning, error)
     */
    setSeverity(severity: MessageSeverity): this {
        (this.content as MessageContent).severity = severity;
        return this;
    }

    /**
     * Adds a button to the box. Two at most.
     *
     * Without `go`, it closes and does nothing else. With `go`, it loads that
     * view — which then enters the stack under its own rules, like any other
     * navigation.
     *
     * With no action at all, the client draws a single « OK » that closes:
     * a box always has a way out, as a `MsgBox` always had one.
     *
     * A bare view id is refused, as everywhere else: nothing on the wire
     * distinguishes it from a relative path, and no client keeps a directory
     * of view ids.
     */
    addAction(
        label: string,
        options: { go?: string; method?: HttpMethod; back?: number | 'root' } = {}
    ): this {
        const trimmed = (label ?? '').trim();
        if (trimmed.length === 0) {
            throw new InvalidParameterError('label', label, 'Action label cannot be empty');
        }

        const actions = (this.content as MessageContent).actions;
        if (actions.length >= 2) {
            throw new InvalidParameterError(
                'actions',
                actions.length + 1,
                'A message carries two actions at most'
            );
        }

        if (options.go !== undefined && options.back !== undefined) {
            throw new InvalidParameterError(
                'back',
                options.back,
                'an action either loads a view (`go`) or steps back (`back`), not both'
            );
        }

        const action: MessageAction = { label: trimmed };
        if (options.back !== undefined) {
            // Reculer ne recharge RIEN : l'écran visé est déjà dans la pile,
            // avec l'état où l'utilisateur l'avait laissé. `'root'` y revient
            // sans compter — c'est la seule position qu'un fournisseur
            // connaisse à coup sûr, la vue servie par son URL de base.
            if (options.back !== 'root') {
                if (!Number.isInteger(options.back) || options.back < 1) {
                    throw new InvalidParameterError(
                        'back',
                        options.back,
                        "back must be an integer >= 1, or 'root'"
                    );
                }
            }
            action.back = options.back;
            if (options.method !== undefined) {
                throw new InvalidParameterError(
                    'method',
                    options.method,
                    'method only applies to an action that carries `go`'
                );
            }
        } else if (options.go !== undefined) {
            action.go = this.assertAddressableTarget('go', options.go);
            if (options.method !== undefined) action.method = options.method;
        } else if (options.method !== undefined) {
            throw new InvalidParameterError(
                'method',
                options.method,
                'method only applies to an action that carries `go`'
            );
        }

        actions.push(action);
        return this;
    }

    /** Removes every action. */
    clearActions(): this {
        (this.content as MessageContent).actions = [];
        return this;
    }

    /**
     * Nom historique. La destination voyageait dans `confirmMessage`, un champ
     * nommé pour un texte de confirmation — c'est `go` désormais.
     */
    setPrimaryAction(text: string, method: HttpMethod = 'POST', confirmMessage?: string): this {
        return this.addAction(text, confirmMessage === undefined
            ? {}
            : { go: confirmMessage, method });
    }

    /** Nom historique de {@link addAction}. */
    submitButton(text: string, method: HttpMethod = 'POST', confirmMessage?: string): this {
        return this.setPrimaryAction(text, method, confirmMessage);
    }

    /** Nom historique : la seconde action. */
    setSecondaryAction(text: string, method: HttpMethod = 'POST', confirmMessage?: string): this {
        return this.setPrimaryAction(text, method, confirmMessage);
    }

    /** Retire la seconde action, si elle existe. */
    clearSecondaryAction(): this {
        const actions = (this.content as MessageContent).actions;
        if (actions.length > 1) actions.length = 1;
        return this;
    }

    /**
     * Adds message-specific metadata
     */
    setMetadata(metadata: Record<string, unknown>): this {
        (this.content as MessageContent).meta = { ...metadata };
        return this;
    }

}
