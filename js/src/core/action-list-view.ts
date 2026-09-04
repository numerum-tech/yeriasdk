import { BaseActionView } from './base/base-action-view';
import { ActionConfig } from '../types';

export interface ActionListContent {
    title?: string;
    intro?: string;
    actions: ActionConfig[];
}

/**
 * Builds an SGUI `ActionList` view — a vertical list of actionable items, each
 * with a code, title, optional description/thumbnail, and navigation.
 *
 * Builder methods: `setTitle`, `setIntro`, and the action family inherited from
 * BaseActionView (`addAction`, `removeAction`, `updateAction`, `hasActions`),
 * overridden here to keep the serialized `content.actions` in sync.
 *
 * Extends {@link BaseActionView}. Created via the YeriaApp/YeriaUI factory,
 * populated with these builders, then serialized and signed into a v3 envelope
 * by serve().
 */
export class ActionListView extends BaseActionView {

    static fromJson(json: Record<string, unknown>): ActionListView {
        return ActionListView.fromJsonAs(ActionListView, 'ActionList', json);
    }
    constructor(viewId: string, title: string, processId?: string) {
        super({
            id: viewId,
            type: 'ActionList',
            processId,
            metadata: {
                version: '1.0.0',
                createdAt: new Date()
            }
        });

        this.content = {
            title: title,
            actions: this.actions  // Reference to BaseActionView's actions
        } as ActionListContent;
    }

    /**
     * Sets the action list title
     */
    setTitle(title: string): this {
        (this.content as ActionListContent).title = title;
        return this;
    }

    /**
     * Sets the action list intro
     */
    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    /**
     * Synchronize actions array to content (required by BaseActionView)
     */
    protected syncActionsToContent(): void {
        (this.content as ActionListContent).actions = this.actions;
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
     * Checks whether the list has any actions
     */
    hasActions(): boolean {
        return this.actions.length > 0;
    }
}
