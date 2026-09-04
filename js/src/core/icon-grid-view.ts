import { BaseActionView } from './base/base-action-view';
import { ActionConfig } from '../types';
import { InvalidParameterError } from '../errors';

export type IconShape = 'circle' | 'square';

export interface IconGridContent {
    title?: string;
    intro?: string;
    shape?: IconShape;       // tile shape for all tiles, default 'circle'
    columns?: number;        // 2-6, default 4
    spacing?: number;        // px, default 12
    actions: ActionConfig[];
}

/**
 * Builds an SGUI `IconGrid` view — app-launcher style grid. Each action is a
 * square or circle image tile (from its `thumbnail`) with the `title` caption
 * underneath. Same action model + navigation as ActionGridView; only the
 * rendering differs (`desc` is not rendered).
 *
 * Builder methods: `setTitle`, `setIntro`, `setShape` ('circle'|'square'),
 * `setColumns` (2-6), `setSpacing`, `addIcon` (ergonomic tile: image + badge
 * first), plus the inherited action family (`addAction`, `removeAction`,
 * `updateAction`, `hasActions`), overridden here to keep the serialized
 * `content.actions` in sync.
 *
 * Extends {@link BaseActionView}. Created via the YeriaApp/YeriaUI factory,
 * populated with these builders, then serialized and signed into a v3 envelope
 * by serve().
 */
export class IconGridView extends BaseActionView {

    static fromJson(json: Record<string, unknown>): IconGridView {
        return IconGridView.fromJsonAs(IconGridView, 'IconGrid', json);
    }
    constructor(viewId: string, title: string, processId?: string) {
        super({
            id: viewId,
            type: 'IconGrid',
            processId,
            metadata: {
                version: '1.0.0',
                createdAt: new Date()
            }
        });

        this.content = {
            title: title,
            shape: 'circle',
            columns: 4,
            spacing: 12,
            actions: this.actions,  // Reference to BaseActionView's actions
        } as IconGridContent;
    }

    /**
     * Sets the icon grid title
     */
    setTitle(title: string): this {
        (this.content as IconGridContent).title = title;
        return this;
    }

    /**
     * Sets the icon grid intro
     */
    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    /**
     * Sets the tile shape (circle or square)
     */
    setShape(shape: IconShape): this {
        if (shape !== 'circle' && shape !== 'square') {
            throw new InvalidParameterError('shape', shape, "Shape must be 'circle' or 'square'");
        }
        (this.content as IconGridContent).shape = shape;
        return this;
    }

    /**
     * Sets the number of columns
     */
    setColumns(columns: number): this {
        if (columns < 2 || columns > 6) {
            throw new InvalidParameterError('columns', columns, 'Columns must be between 2 and 6');
        }
        (this.content as IconGridContent).columns = columns;
        return this;
    }

    /**
     * Sets the spacing between tiles
     */
    setSpacing(spacing: number): this {
        if (spacing < 0) {
            throw new InvalidParameterError('spacing', spacing, 'Spacing must be non-negative');
        }
        (this.content as IconGridContent).spacing = spacing;
        return this;
    }

    /**
     * Synchronize actions array to content (required by BaseActionView)
     */
    protected syncActionsToContent(): void {
        (this.content as IconGridContent).actions = this.actions;
    }

    /**
     * Overrides addAction (same order as the base class, to stay compatible
     * with addActions()) to keep content in sync.
     */
    override addAction(
        code: string,
        title: string,
        description?: string,
        thumbnail?: string,
        disabled: boolean = false,
        metadata?: Record<string, unknown>
    ): this {
        super.addAction(code, title, description, thumbnail, disabled, metadata);
        this.syncActionsToContent();
        return this;
    }

    /**
     * Adds an icon tile — ergonomic API for IconGrid: the image
     * (`thumbnail`) and `badge` first, since `desc` is not rendered.
     */
    addIcon(
        code: string,
        title: string,
        thumbnail?: string,
        badge?: string,
        disabled: boolean = false,
        metadata?: Record<string, unknown>
    ): this {
        super.addAction(code, title, undefined, thumbnail, disabled, metadata);
        const added = this.actions[this.actions.length - 1];
        if (added && badge !== undefined) {
            added.badge = badge;
        }
        this.syncActionsToContent();
        return this;
    }

    /**
     * Overrides removeAction to keep content in sync
     */
    override removeAction(actionCode: string): boolean {
        const result = super.removeAction(actionCode);
        if (result) {
            this.syncActionsToContent();
        }
        return result;
    }

    /**
     * Overrides updateAction to keep content in sync
     */
    override updateAction(actionCode: string, updates: Partial<ActionConfig>): boolean {
        const result = super.updateAction(actionCode, updates);
        if (result) {
            this.syncActionsToContent();
        }
        return result;
    }

    /**
     * Gets the tile shape
     */
    getShape(): IconShape {
        return (this.content as IconGridContent).shape || 'circle';
    }

    /**
     * Gets the number of columns
     */
    getColumns(): number {
        return (this.content as IconGridContent).columns || 4;
    }

    /**
     * Gets the spacing
     */
    getSpacing(): number {
        return (this.content as IconGridContent).spacing || 12;
    }

    /**
     * Checks whether the grid has any actions
     */
    hasActions(): boolean {
        return this.actions.length > 0;
    }
}
