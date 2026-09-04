import { BaseActionView } from './base/base-action-view';
import { ActionConfig } from '../types';
import { InvalidParameterError } from '../errors';

export interface ActionGridContent {
    title?: string;
    intro?: string;
    actions: ActionConfig[];
    columns?: number;
    spacing?: number;
}

/**
 * Builds an SGUI `ActionGrid` view — actionable items laid out in a grid, each
 * with a code, title, optional description/thumbnail, and navigation.
 *
 * Builder methods: `setTitle`, `setIntro`, `setColumns` (1-6), `setSpacing`,
 * and the action family inherited from BaseActionView (`addAction`,
 * `removeAction`, `updateAction`, `hasActions`), overridden here to keep the
 * serialized `content.actions` in sync.
 *
 * Extends {@link BaseActionView}. Created via the YeriaApp/YeriaUI factory,
 * populated with these builders, then serialized and signed into a v3 envelope
 * by serve().
 */
export class ActionGridView extends BaseActionView {

    static fromJson(json: Record<string, unknown>): ActionGridView {
        return ActionGridView.fromJsonAs(ActionGridView, 'ActionGrid', json);
    }
    constructor(viewId: string, title: string, processId?: string) {
        super({
            id: viewId,
            type: 'ActionGrid',
            processId,
            metadata: {
                version: '1.0.0',
                createdAt: new Date()
            }
        });

        this.content = {
            title: title,
            actions: this.actions,  // Reference to BaseActionView's actions
            columns: 2,
            spacing: 16
        } as ActionGridContent;
    }

    /**
     * Sets the action grid title
     */
    setTitle(title: string): this {
        (this.content as ActionGridContent).title = title;
        return this;
    }

    /**
     * Sets the action grid intro
     */
    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    /**
     * Sets the number of columns
     */
    setColumns(columns: number): this {
        if (columns < 1 || columns > 6) {
            throw new InvalidParameterError('columns', columns, 'Columns must be between 1 and 6');
        }
        (this.content as ActionGridContent).columns = columns;
        return this;
    }

    /**
     * Sets the spacing between items
     */
    setSpacing(spacing: number): this {
        if (spacing < 0) {
            throw new InvalidParameterError('spacing', spacing, 'Spacing must be non-negative');
        }
        (this.content as ActionGridContent).spacing = spacing;
        return this;
    }

    /**
     * Synchronize actions array to content (required by BaseActionView)
     */
    protected syncActionsToContent(): void {
        (this.content as ActionGridContent).actions = this.actions;
    }

    /**
     * Overrides addAction to keep content in sync
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
     * Gets the number of columns
     */
    getColumns(): number {
        return (this.content as ActionGridContent).columns || 2;
    }

    /**
     * Gets the spacing
     */
    getSpacing(): number {
        return (this.content as ActionGridContent).spacing || 16;
    }

    /**
     * Checks whether the grid has any actions
     */
    hasActions(): boolean {
        return this.actions.length > 0;
    }
}
