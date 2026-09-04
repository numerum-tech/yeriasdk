import { BaseView } from './base-view';
import { CarouselContent, CarouselSettings, CarouselSlide, CardAction, CardImage, HttpMethod } from '../types';
import { MissingRequiredParameterError, ElementNotFoundError } from '../errors';
import { YeriaLink } from './yeria-link';

// CarouselView organises multiple spotlight slides for mobile hero banners or promotional decks.

/**
 * Drops the keys left `undefined`, so an unset field is absent rather than
 * present-and-undefined. `JSON.stringify` would drop it anyway; this keeps the
 * in-memory object honest too, and matches what Python emits.
 */
function stripUndefined<T extends object>(obj: T): T {
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
        if (rec[key] === undefined) delete rec[key];
    }
    return obj;
}

/**
 * Builds a Carousel SGUI view — a sequence of spotlight slides for hero banners
 * or promotional decks.
 *
 * `addSlide` (or `createSlide` + `addSlide`) appends slides, `addSlideAction`
 * attaches action buttons to a slide, and `setSettings` tunes autoplay, looping
 * and indicator behaviour.
 *
 * Extends {@link BaseView}; instantiated by the YeriaApp/YeriaUI factory,
 * populated with these builders, then serialized to a JSON view description and
 * signed into a v3 envelope by `serve()`.
 */
export class CarouselView extends BaseView {

    static fromJson(json: Record<string, unknown>): CarouselView {
        return CarouselView.fromJsonAs(CarouselView, 'Carousel', json);
    }
    constructor(viewId: string, title: string, processId?: string) {
        super({
            id: viewId,
            type: 'Carousel',
            processId,
            metadata: {
                version: '1.0.0',
                createdAt: new Date()
            }
        });

        // No `settings` until the provider sets one: the four documented
        // defaults used to be written here, so a bare carousel shipped keys
        // nobody had asked for. The client carries the same defaults.
        this.content = {
            title,
            slides: []
        } as unknown as CarouselContent;
    }

    // Ligne de contexte sous le titre du carrousel.
    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    /** Nom historique de {@link setIntro}, conservé. Écrit la même clé. */
    setSubtitle(subtitle: string): this {
        return this.setIntro(subtitle);
    }

    // Overrides default autoplay and indicator behaviour.
    setSettings(settings: CarouselSettings): this {
        // Spelt out rather than spread, in Python's emission order: `...settings`
        // let the caller's key order into a signed payload.
        const emitted: Record<string, unknown> = {
            autoplay: settings.autoplay,
            intervalMs: settings.intervalMs,
            loop: settings.loop,
            showIndicators: settings.showIndicators
        };
        for (const key of Object.keys(emitted)) {
            if (emitted[key] === undefined) delete emitted[key];
        }
        if (Object.keys(emitted).length === 0) {
            delete (this.content as Record<string, unknown>)['settings'];
        } else {
            (this.content as CarouselContent).settings = emitted as CarouselSettings;
        }
        return this;
    }

    // Appends a prepared slide to the carousel sequence.
    addSlide(slide: CarouselSlide): this {
        if (!slide.id || !slide.title) {
            throw new MissingRequiredParameterError('slide id and title');
        }

        // Spelt out rather than spread, in Python's emission order: `...slide`
        // let the caller's key order into a signed payload. An empty `actions`
        // list or `meta` object is left out, as Python leaves it out.
        const image: CardImage | undefined = slide.image
            ? stripUndefined({ url: slide.image.url, alt: slide.image.alt })
            : undefined;
        const actions: CardAction[] | undefined = slide.actions && slide.actions.length
            ? slide.actions.map(a => stripUndefined({
                text: a.text,
                method: a.method,
                confirmMessage: a.confirmMessage,
                href: a.href,
                icon: a.icon,
                variant: a.variant
            }))
            : undefined;
        (this.content as CarouselContent).slides.push(stripUndefined({
            id: slide.id.trim(),
            title: slide.title.trim(),
            description: slide.description?.trim(),
            badge: slide.badge?.trim(),
            image,
            actions,
            meta: slide.meta && Object.keys(slide.meta).length ? slide.meta : undefined
        }));

        return this;
    }

    // Builds a CarouselSlide object without adding it to the view.
    createSlide(
        id: string,
        title: string,
        description?: string,
        options: { imageUrl?: string; imageAlt?: string; badge?: string } = {}
    ): CarouselSlide {
        const slide: CarouselSlide = {
            id: id.trim(),
            title: title.trim(),
            description: description?.trim(),
            badge: options.badge?.trim(),
            image: options.imageUrl
                ? {
                    url: options.imageUrl.trim(),
                    alt: options.imageAlt?.trim()
                }
                : undefined
        };

        return slide;
    }

    // Pushes an action button for a given slide id.
    addSlideAction(
        slideId: string,
        text: string,
        method: HttpMethod = 'POST',
        options: { confirmMessage?: string; href?: string; icon?: string; variant?: CardAction['variant'] } = {}
    ): this {
        const slide = (this.content as CarouselContent).slides.find(item => item.id === slideId);
        if (!slide) {
            throw new ElementNotFoundError(0, slideId);  // Using slideId as identifier
        }

        if (!slide.actions) {
            slide.actions = [];
        }

        const action: CardAction = {
            text: text.trim(),
            method,
            confirmMessage: options.confirmMessage,
            href: options.href
                ? YeriaLink.isValid(options.href)
                    ? options.href.trim()
                    : this.assertNavigationTarget('href', options.href, {
                    allowRelative: true,
                    allowViewId: false
                })
                : undefined,
            icon: options.icon?.trim(),
            variant: options.variant
        };

        slide.actions.push(action);
        return this;
    }

    clearSlides(): this {
        (this.content as CarouselContent).slides = [];
        return this;
    }

    // Exposes the assembled payload for advanced usage.
    getContent(): CarouselContent {
        return this.content as CarouselContent;
    }
}
