import {
    BaseViewConfig,
    ViewType,
    ValidationResult,
    ViewState,
    NavigationConfig,
    NavigationEntry,
    ProcessContext,
    createValidationError
} from '../types';
import { ViewValidationError, NoProcessContextError, InvalidParameterError } from '../errors';

/**
 * Walks a payload part and returns the path of the first non-finite number,
 * or null. `NaN` and `±Infinity` have no JSON form: `JSON.stringify` writes
 * `null`, Python's `json.dumps` writes `NaN`, and a signed payload carrying
 * either is one no client can read back. The builders refuse them where they
 * know the field; this is the net under all of them, at the one point every
 * payload goes through.
 */
function findNonFiniteNumber(value: unknown, path: string): string | null {
    // `JSON.stringify` asks a value for its `toJSON()` first; so does this
    // walk, so what is checked is what gets serialised (a Date becomes its
    // ISO string here, a custom object whatever it chooses to yield).
    if (value && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
        value = (value as { toJSON: () => unknown }).toJSON();
    }
    if (typeof value === 'number') return Number.isFinite(value) ? null : path;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const hit = findNonFiniteNumber(value[i], `${path}[${i}]`);
            if (hit) return hit;
        }
        return null;
    }
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            const hit = findNonFiniteNumber(v, path ? `${path}.${k}` : k);
            if (hit) return hit;
        }
    }
    return null;
}
import { validateNavigationTarget, DEFAULT_URL_CONFIG } from '../utils/validators';

/**
 * Abstract base for every Yeria SGUI view (Form, Reader, Card, Map, ...).
 *
 * Holds the state common to all views: identity (id / type / processId),
 * navigation (setNext / setPrev / setEntry / setPage), metadata, and the serialization
 * (build / toJSON) that produces the view's JSON description. Concrete views
 * are created via the YeriaApp / YeriaUI factory methods, populated, then
 * signed by their serialized output. Instances are mutable, per-request
 * builders — not singletons.
 *
 * This class is ABSTRACT and is never instantiated directly; use a concrete
 * view subclass instead.
 */
export abstract class BaseView {
    public readonly id: string;
    public readonly type: ViewType;
    public content: unknown;
    protected state: ViewState = {};
    protected metadata?: BaseViewConfig['metadata'];
    protected navigation?: NavigationConfig;
    protected processContext?: ProcessContext;

    constructor(config: BaseViewConfig) {
        this.id = config.id;
        this.type = config.type;
        this.metadata = config.metadata;
        // Initialize process context if processId provided
        if (config.processId) {
            this.processContext = {
                processId: config.processId
            };
        }
    }

    /**
     * Validates the view before serving it
     */
    protected validate(): ValidationResult {
        const errors: ReturnType<typeof createValidationError>[] = [];
        const warnings: ReturnType<typeof createValidationError>[] = [];

        if (!this.id || this.id.trim() === '') {
            errors.push(createValidationError('View ID is required'));
        }

        if (!this.type) {
            errors.push(createValidationError('View type is required'));
        }

        if (!this.content) {
            errors.push(createValidationError('View content is required'));
        }

        // View-type-specific validation
        switch (this.type) {
            case 'Form':
                if (
                    !this.content ||
                    !Array.isArray((this.content as Record<string, unknown>)['fields']) ||
                    ((this.content as Record<string, unknown>)['fields'] as unknown[]).length === 0
                ) {
                    errors.push(createValidationError('Form must have at least one field'));
                } else {
                    // A form made only of rules and blank space is not a form.
                    // `paragraph` is deliberately NOT excluded here: it at least
                    // says something, and excluding it would refuse forms that
                    // providers serve today.
                    const fields = (this.content as Record<string, unknown>)['fields'] as Array<Record<string, unknown>>;
                    const blankTypes = ['separator', 'spacer'];
                    const realFields = fields.filter((f: any) => !blankTypes.includes(f.fieldType));
                    if (realFields.length === 0) {
                        errors.push(createValidationError('Form must have at least one non-separator field'));
                    }
                }
                break;

            case 'ActionList':
            case 'ActionGrid':
            case 'IconGrid':
                if (
                    !this.content ||
                    !Array.isArray((this.content as Record<string, unknown>)['actions']) ||
                    ((this.content as Record<string, unknown>)['actions'] as unknown[]).length === 0
                ) {
                    errors.push(createValidationError('Action views must have at least one action'));
                }
                if (this.type === 'IconGrid') {
                    const shape = (this.content as Record<string, unknown>)?.['shape'];
                    if (shape !== undefined && shape !== 'circle' && shape !== 'square') {
                        errors.push(createValidationError("IconGrid 'shape' must be 'circle' or 'square'"));
                    }
                }
                break;

            case 'Reader':
                if (typeof this.content === 'object' && this.content !== null) {
                    const readerContent = this.content as { title?: string; elements?: unknown[] };
                    if (!readerContent.title || !readerContent.title.trim()) {
                        errors.push(createValidationError('Reader view must have a title'));
                    }
                    if (!readerContent.elements || readerContent.elements.length === 0) {
                        errors.push(createValidationError('Reader view must contain at least one element'));
                    }
                }
                break;

            case 'Message':
                if (typeof this.content === 'object' && this.content !== null) {
                    const messageContent = this.content as { body?: string };

                    // Les trois textes ont des rôles distincts : `title` nomme
                    // la fenêtre, `intro` est la première ligne — un
                    // sous-titre — et `body` est ce que le message DIT. Un
                    // message sans corps n'a rien à dire, d'où l'exigence ;
                    // l'intro, elle, reste facultative.
                    const hasBody = typeof messageContent.body === 'string'
                        && messageContent.body.trim().length > 0;
                    if (!hasBody) {
                        errors.push(createValidationError('Message view must define a body'));
                    }

                    // Aucune action n'est exigée : une boîte sans bouton déclaré
                    // se ferme par un « OK » que le client dessine, comme une
                    // MsgBox sans jeu de boutons. Exiger une action principale
                    // obligeait le fournisseur à nommer un bouton dont il ne
                    // voulait pas.
                } else {
                    errors.push(createValidationError('Message view content is invalid'));
                }
                break;

            case 'Card':
                if (typeof this.content === 'object' && this.content !== null) {
                    const card = this.content as { description?: string; stats?: unknown[]; sections?: unknown[] };
                    const hasDetail =
                        (typeof card.description === 'string' && card.description.trim().length > 0) ||
                        (Array.isArray(card.stats) && card.stats.length > 0) ||
                        (Array.isArray(card.sections) && card.sections.length > 0);

                    if (!hasDetail) {
                        errors.push(createValidationError('Card view requires at least a description, stat, or section'));
                    }
                } else {
                    errors.push(createValidationError('Card view content is invalid'));
                }
                break;

            case 'Carousel':
                if (
                    !this.content ||
                    !Array.isArray((this.content as Record<string, unknown>)['slides']) ||
                    ((this.content as Record<string, unknown>)['slides'] as unknown[]).length === 0
                ) {
                    errors.push(createValidationError('Carousel view must contain at least one slide'));
                }
                break;

            case 'Timeline':
                if (
                    !this.content ||
                    !Array.isArray((this.content as Record<string, unknown>)['items']) ||
                    ((this.content as Record<string, unknown>)['items'] as unknown[]).length === 0
                ) {
                    errors.push(createValidationError('Timeline view must contain at least one entry'));
                }
                break;

            case 'Media':
                if (
                    !this.content ||
                    !Array.isArray((this.content as Record<string, unknown>)['items']) ||
                    ((this.content as Record<string, unknown>)['items'] as unknown[]).length === 0
                ) {
                    errors.push(createValidationError('Media view must contain at least one resource'));
                }
                break;

            case 'Map': {
                if (!this.content || typeof this.content !== 'object') {
                    errors.push(createValidationError('Map view content is required'));
                    break;
                }
                const mc = this.content as Record<string, unknown>;
                const layers = Array.isArray(mc['layers']) ? (mc['layers'] as Array<Record<string, unknown>>) : [];

                // unique layer ids
                const seenLayerIds = new Set<string>();
                for (const l of layers) {
                    const id = l?.['id'];
                    if (typeof id !== 'string' || !id.trim()) {
                        errors.push(createValidationError('Map layer must have a non-empty id'));
                    } else if (seenLayerIds.has(id)) {
                        errors.push(createValidationError(`Duplicate map layer id: "${id}"`));
                    } else {
                        seenLayerIds.add(id);
                    }
                }

                const mode = mc['mode'] === 'pick' ? 'pick' : 'view';

                if (mode === 'pick') {
                    const pick = mc['pick'] as Record<string, unknown> | undefined;
                    if (!pick || typeof pick['submitUrl'] !== 'string' || !(pick['submitUrl'] as string).trim()) {
                        errors.push(createValidationError('Map pick mode requires pick.submitUrl'));
                    }
                } else {
                    // view mode: needs at least one drawable layer OR an emptyMessage
                    const hasDrawable = layers.some((l) => {
                        if (l?.['visible'] === false) return false;
                        const t = l?.['type'];
                        if (t === 'markers') return Array.isArray(l['markers']) && (l['markers'] as unknown[]).length > 0;
                        if (t === 'shapes')  return Array.isArray(l['shapes'])  && (l['shapes']  as unknown[]).length > 0;
                        if (t === 'heatmap') return Array.isArray(l['points'])  && (l['points']  as unknown[]).length > 0;
                        if (t === 'tiles')   return typeof l['url'] === 'string';
                        if (t === 'geojson') return !!l['data'];
                        return false;
                    });
                    const emptyMsg = mc['emptyMessage'];
                    const hasEmptyMessage = typeof emptyMsg === 'string' && (emptyMsg as string).trim().length > 0;
                    if (!hasDrawable && !hasEmptyMessage) {
                        errors.push(createValidationError('Map view must contain at least one drawable layer or an emptyMessage'));
                    }
                }
                break;
            }

            case 'QRDisplay':
                if (
                    !this.content ||
                    !(this.content as Record<string, unknown>)['qrImage'] ||
                    !(this.content as Record<string, unknown>)['qrTitle'] ||
                    !(this.content as Record<string, unknown>)['qrDescription']
                ) {
                    errors.push(createValidationError('QRDisplay view must have a QR code with image, title, and description'));
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * Validates the view, then returns its UNSIGNED JSON description (the wire
     * payload). This does NOT sign — signing is `app.serve(view)`, which calls
     * this internally. Named `build()` to avoid colliding with that.
     */
    build(): Record<string, unknown> {
        const validation = this.validate();

        if (!validation.isValid) {
            const errorMessages = validation.errors.map(e => e.message);
            throw new ViewValidationError(this.id, this.type, errorMessages);
        }

        // Warnings are available in validation result for users to handle

        const result: Record<string, unknown> = {
            id: this.id,
            type: this.type,
            content: this.content,
        };

        // Add the process context if present (mobile app needs this for URL construction)
        if (this.processContext) {
            result['process'] = this.processContext;
        }

        // Add the metadata if present
        if (this.metadata) {
            result['metadata'] = this.metadata;
        }

        // Add the state if present
        if (Object.keys(this.state).length > 0) {
            result['state'] = this.state;
        }

        // Add the navigation if present.
        //
        // Rebuilt key by key rather than passed through: a JS object keeps its
        // INSERTION order, so `setPrev().setNext()` and `setNext().setPrev()`
        // would serialize differently — and differently again from the Python
        // SDK, which writes a fixed order. Same calls, same bytes, in either
        // language.
        if (this.navigation) {
            const nav: Record<string, unknown> = {};
            if (this.navigation.next !== undefined) nav['next'] = this.navigation.next;
            if (this.navigation.prev !== undefined) nav['prev'] = this.navigation.prev;
            if (this.navigation.entry !== undefined) nav['entry'] = this.navigation.entry;
            if (this.navigation.page !== undefined) {
                // Même raison que ci-dessus : `total` est omis quand il n'est
                // pas connu, jamais émis à null.
                const page: Record<string, number> = { current: this.navigation.page.current };
                if (this.navigation.page.total !== undefined) page['total'] = this.navigation.page.total;
                nav['page'] = page;
            }
            result['nav'] = nav;
        }

        // The ASSEMBLED payload is what gets walked, as Python walks its own:
        // checking `content` alone left `state` out, and `setState` takes an
        // `unknown` — a `NaN` there serialised as `null` on one side and was
        // refused on the other.
        const nonFinite = findNonFiniteNumber(result, '');
        if (nonFinite) {
            throw new ViewValidationError(this.id, this.type, [`payload contains a non-finite number at ${nonFinite}`]);
        }

        return result;
    }

    /**
     * Returns the view's JSON description (delegates to build()).
     * Returns the JSON representation of the view
     */
    toJSON(): Record<string, unknown> {
        return this.build();
    }

    /**
     * Shared rehydration: reconstruct a typed view instance from a wire JSON
     * payload (the output of `toJSON()`), bypassing the fluent constructor.
     * Each concrete view exposes a thin `static fromJson(json)` that calls this
     * with its own class + expected type; the type guard is the per-view check,
     * and the reconstructed instance is run through `validate()` (the existing
     * per-type rules) before it is returned.
     *
     * All serialisable state lives in `content` (no view overrides `serve()`),
     * so restoring `content` + the common fields is faithful for re-serving.
     * Builder-only helpers (e.g. FormView's field-validation map) are not
     * restored — `serve()` does not use them.
     */
    static fromJsonAs<T extends BaseView>(
        Ctor: { prototype: T },
        expectedType: ViewType,
        json: Record<string, unknown>,
    ): T {
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            throw new InvalidParameterError('json', json, 'fromJson expects a plain object view payload');
        }
        if (typeof json['id'] !== 'string' || (json['id'] as string).trim() === '') {
            throw new InvalidParameterError('id', json['id'], 'fromJson requires a non-empty string id');
        }
        if (json['type'] !== expectedType) {
            throw new InvalidParameterError('type', json['type'], `expected view type "${expectedType}", got "${String(json['type'])}"`);
        }
        if (!('content' in json) || json['content'] === null || json['content'] === undefined) {
            throw new InvalidParameterError('content', json['content'], 'fromJson requires content');
        }

        // Bypass the fluent constructor (like clone()) and restore fields.
        const instance: any = Object.create(Ctor.prototype);
        instance.id = json['id'];
        instance.type = json['type'];
        instance.content = json['content'];
        instance.state = (json['state'] && typeof json['state'] === 'object') ? json['state'] : {};
        instance.metadata = json['metadata'];
        instance.navigation = (json['nav'] && typeof json['nav'] === 'object') ? json['nav'] : undefined;
        instance.processContext = (json['process'] && typeof json['process'] === 'object') ? json['process'] : undefined;

        const validation = (instance as BaseView).validateView();
        if (!validation.isValid) {
            throw new ViewValidationError(
                (instance as BaseView).id,
                (instance as BaseView).type,
                validation.errors.map(e => e.message),
            );
        }
        return instance as T;
    }

    /**
     * Updates the view's state
     */
    setState(key: string, value: unknown): void {
        this.state[key] = value;
    }

    /**
     * Gets a value from the state
     */
    getState(key: string): unknown {
        return this.state[key];
    }

    /**
     * Clones the view
     * Uses structuredClone for efficient deep cloning when available, falls back to JSON serialization
     */
    clone(): this {
        const cloned = Object.create(Object.getPrototypeOf(this));

        const clonedMetadata = this.metadata
            ? {
                ...this.metadata,
                createdAt: this.metadata.createdAt instanceof Date
                    ? new Date(this.metadata.createdAt.getTime())
                    : this.metadata.createdAt
            }
            : undefined;

        // Use structuredClone if available (Node 17+, modern browsers) for better performance
        // Falls back to JSON serialization for compatibility
        const cloneContent = typeof structuredClone !== 'undefined'
            ? structuredClone(this.content)
            : JSON.parse(JSON.stringify(this.content));
        
        const cloneState = typeof structuredClone !== 'undefined'
            ? structuredClone(this.state)
            : JSON.parse(JSON.stringify(this.state));

        Object.assign(cloned, {
            id: this.id,
            type: this.type,
            content: cloneContent,
            state: cloneState,
            metadata: clonedMetadata
        });

        cloned.navigation = this.navigation ? { ...this.navigation } : undefined;
        cloned.processContext = this.processContext ? { ...this.processContext } : undefined;

        return cloned;
    }

    /**
     * Checks whether the view is valid
     */
    isValid(): boolean {
        return this.validate().isValid;
    }

    /**
     * Validates the view and returns the result
     */
    validateView(): ValidationResult {
        return this.validate();
    }

    /**
     * Gets the validation errors
     */
    getValidationErrors(): string[] {
        return this.validate().errors.map(e => e.message);
    }

    /**
     * Gets the validation warnings
     */
    getValidationWarnings(): string[] {
        return (this.validate().warnings || []).map(e => e.message);
    }

    /**
     * Updates the metadata
     */
    updateMetadata(metadata: Partial<BaseViewConfig['metadata']>): void {
        if (this.metadata) {
            this.metadata = { ...this.metadata, ...metadata };
        } else {
            this.metadata = metadata as BaseViewConfig['metadata'];
        }
    }

    /**
     * Gets the metadata
     */
    getMetadata(): BaseViewConfig['metadata'] {
        return this.metadata;
    }

    /**
     * Protected helper to set intro/note text with strict validation
     * Child views can expose this as setIntro(), etc.
     * @param fieldName - Name of the content field to set (e.g., 'intro')
     * @param value - Text value to set
     * @throws InvalidParameterError if value is empty or null
     */
    protected setIntroText(fieldName: string, value: string): this {
        if (!value || value.trim().length === 0) {
            throw new InvalidParameterError(fieldName, value, `${fieldName} text cannot be empty`);
        }

        const trimmedValue = value.trim();

        if (typeof this.content === 'object' && this.content !== null) {
            (this.content as Record<string, unknown>)[fieldName] = trimmedValue;
        }

        return this;
    }

    /**
     * A sequence target must be addressable: an absolute URL, or a path the
     * client can resolve against the service base.
     *
     * A bare token (`step-two`) is refused here. On the wire it is
     * indistinguishable from a relative path, so the validator accepts it —
     * but the client has no registry of view ids to resolve it against, and a
     * provider writing one would get a silent 404 instead of an error. Better
     * to fail at write time.
     */
    protected assertAddressableTarget(fieldName: string, target: string): string {
        const trimmed = this.assertNavigationTarget(fieldName, target, {
            allowRelative: true,
            allowViewId: false
        });

        const addressable = /^https?:\/\//i.test(trimmed) || trimmed.includes('/');
        if (!addressable) {
            throw new InvalidParameterError(
                fieldName,
                target,
                'Navigation target must be a URL or a path (e.g. "/orders/page/2"), not a bare view id'
            );
        }

        return trimmed;
    }

    protected assertNavigationTarget(
        fieldName: string,
        target: string,
        options: { allowRelative?: boolean; allowViewId?: boolean } = {}
    ): string {
        const trimmed = target.trim();
        const validation = validateNavigationTarget(trimmed, {
            ...DEFAULT_URL_CONFIG,
            blockLocalhost: false,
            blockPrivateIPs: false
        }, options);

        if (!validation.isValid) {
            const errorMessages = validation.errors.map(e => e.message).join('; ');
            throw new InvalidParameterError(fieldName, target, `Invalid navigation target: ${errorMessages}`);
        }

        return trimmed;
    }

    /**
     * Next view of a paginated sequence — the client draws the forward control.
     *
     * A sibling, not a destination for the back gesture. Moving to it REPLACES
     * the current view unless the view reached declares `entry: 'push'`:
     * without that, leafing through forty pages stacks forty screens and back
     * becomes a tunnel.
     *
     * A bare view id is refused: the client has no registry to resolve one
     * against. Pass a path relative to your service base, or an absolute URL
     * inside it.
     */
    setNext(url: string): this {
        const target = this.assertAddressableTarget('url', url);

        if (!this.navigation) {
            this.navigation = {};
        }
        this.navigation.next = target;
        return this;
    }

    /**
     * Previous view of a paginated sequence — the client draws the back control.
     *
     * Symmetric with {@link setNext}. This is NOT where the back gesture leads:
     * the client always keeps the view served by your service base URL at the
     * bottom of the stack, and back walks down to it.
     *
     * A bare view id is refused, as for {@link setNext}.
     */
    setPrev(url: string): this {
        const target = this.assertAddressableTarget('url', url);

        if (!this.navigation) {
            this.navigation = {};
        }
        this.navigation.prev = target;
        return this;
    }

    /**
     * How this view enters the client's navigation stack.
     *
     *   'push'    (default) — stacks on top of the screen that led here; back
     *                         returns to it.
     *   'replace'           — takes that screen's place; back skips over it.
     *
     * Declare `replace` on what acknowledges a completed action — the receipt
     * of a submitted form, the confirmation of a purchase — so the user cannot
     * walk back onto a screen that has already done its work.
     *
     * Do NOT declare it on the next step of a wizard: step 2 replacing step 1
     * would make the assistant impossible to walk back up. The client cannot
     * tell those two apart, which is why the default stays 'push'.
     *
     * The view served by your service base URL is the root of the journey; it
     * is never replaced, so a client showing only that root stacks instead.
     */
    setEntry(entry: NavigationEntry): this {
        if (typeof entry === 'number') {
            // Au-dessus de 1, rien de plus ne se dirait : empiler est empiler.
            // Refusé plutôt qu'accepté en silence, pour qu'un `entry: 7` ne
            // donne pas l'illusion de vouloir dire quelque chose.
            if (!Number.isInteger(entry) || entry > 1) {
                throw new InvalidParameterError(
                    'entry',
                    entry,
                    'entry must be an integer <= 1 (1 = push, 0 = replace, -n = deeper recoil)'
                );
            }
        } else if (entry !== 'push' && entry !== 'replace') {
            throw new InvalidParameterError(
                'entry',
                entry,
                "entry must be 'push', 'replace', or an integer <= 1"
            );
        }

        if (!this.navigation) {
            this.navigation = {};
        }
        this.navigation.entry = entry;
        return this;
    }

    /**
     * States where this view sits in its sequence, so the client can draw a
     * position indicator alongside the `next` / `prev` controls.
     *
     * Numbers, not a sentence: the client formats them in the reader's
     * language. Omit `total` when the sequence has no known end — the client
     * then shows the current position alone.
     *
     * Purely informative. It drives no navigation: moving still goes through
     * {@link setNext} / {@link setPrev}.
     *
     * @param current - 1-based position of this view
     * @param total - length of the sequence, when known
     */
    setPage(current: number, total?: number): this {
        if (!Number.isInteger(current) || current < 1) {
            throw new InvalidParameterError('current', current, 'current must be an integer >= 1');
        }
        if (total !== undefined) {
            if (!Number.isInteger(total) || total < 1) {
                throw new InvalidParameterError('total', total, 'total must be an integer >= 1');
            }
            if (total < current) {
                throw new InvalidParameterError('total', total, 'total cannot be smaller than current');
            }
        }

        if (!this.navigation) {
            this.navigation = {};
        }
        this.navigation.page = total === undefined ? { current } : { current, total };
        return this;
    }

    /**
     * Sets the process context for this view
     * @param processId - Unique process identifier
     * @param context - Additional context (steps, name, etc.)
     */
    setProcess(processId: string, context?: Partial<Omit<ProcessContext, 'processId'>>): this {
        this.processContext = {
            processId,
            ...(context || {})
        };

        return this;
    }

    /**
     * Gets the process context
     */
    getProcessContext(): ProcessContext | undefined {
        return this.processContext;
    }

    /**
     * Gets the process identifier (shortcut)
     */
    getProcessId(): string | undefined {
        return this.processContext?.processId;
    }

    /**
     * Checks whether this view is part of a process
     */
    hasProcess(): boolean {
        return this.processContext !== undefined;
    }

    /**
     * Updates the process context
     */
    updateProcessContext(updates: Partial<ProcessContext>): this {
        if (!this.processContext) {
            throw new NoProcessContextError(this.id, 'update');
        }

        this.processContext = {
            ...this.processContext,
            ...updates
        };

        return this;
    }

    /**
     * Cleans up the view's resources
     */
    destroy(): void {
        this.state = {};
    }
} 
