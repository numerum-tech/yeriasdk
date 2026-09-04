import { BaseView } from './base-view';
import {
    // BaseViewConfig,
    FormFieldParams,
    SubmitAction,
    SecondaryAction,
    ParagraphSize,
    SpacerSize,
    SelectDisplay,
    FieldValidation,
    ValidationResult,
    HttpMethod,
    CaptureSource,
    VideoQuality
} from '../types';
import { FieldValidator, FormValidator, validateStoredMediaPaths } from '../utils/validators';
import { FileFormatManager } from '../utils/fileFormats';
import {
    MissingRequiredParameterError,
    InvalidParameterError,
    FieldValidationError,
    FieldNotFoundError,
    EmptyCollectionError,
    Result,
    Ok,
    Err
} from '../errors';

/**
 * Field types that display something instead of collecting it. They occupy a
 * slot in `fields` because that array carries ORDER, but they hold no value,
 * are never submitted, and are skipped by validation.
 */
/**
 * Options shared by every media field (photo / file / audio / video).
 *
 * `value` + `readonly` is what turns a capture field into a VIEWER of what the
 * provider already holds: the URL (or URLs) of stored files, shown without any
 * capture control. Without `readonly` the value is simply a pre-fill the user
 * may replace.
 */
export interface MediaFieldOptions {
    value?: string | string[];
    readonly?: boolean;
    disabled?: boolean;
}

export const DISPLAY_ONLY_TYPES = ['separator', 'paragraph', 'spacer'];

/**
 * The order a field's keys are emitted in.
 *
 * A signature is taken over the compact JSON, so key order is part of the wire
 * contract, not a cosmetic detail. Building a field as `{...params}` handed
 * that decision to the provider: JavaScript preserves an object literal's
 * insertion order, so `{multiple, source}` and `{source, multiple}` signed
 * differently, and `updateField` appended a late key at the end rather than at
 * its place. This list is the single canonical order; it mirrors the order of
 * the `field[...]` insertions in py/yeriasdk/views/form_view.py, and the two
 * must be changed together.
 */
const FIELD_KEY_ORDER: Array<keyof FormFieldParams> = [
    'value', 'required', 'pattern', 'min', 'max', 'minLength', 'maxLength',
    'options', 'display', 'accept', 'live', 'altitude', 'maxAccuracy',
    'precision', 'placeholder', 'helpText', 'disabled', 'readonly',
    'size', 'bold', 'italic', 'minDate', 'maxDate', 'multiple', 'maxCount',
    'maxDuration', 'minDuration', 'source', 'quality', 'maxSize'
];

type EmittedField = FormFieldParams & { fieldType: string; fieldId: string; fieldLabel: string };

/**
 * Rebuilds a field with its keys in {@link FIELD_KEY_ORDER}. Keys that are
 * absent or `undefined` are left out entirely rather than emitted as null —
 * `JSON.stringify` drops an undefined value, and Python emits nothing at all,
 * so omission is what the two SDKs agree on.
 *
 * A key the table does not know is KEPT, at the end and in its original order.
 * Dropping it would be worse than misplacing it: a provider casting past the
 * types to carry an extension key would watch it disappear from the payload
 * without a word. Python's `order_field_keys` does the same.
 */
function orderFieldKeys(field: EmittedField): EmittedField {
    const source = field as unknown as Record<string, unknown>;
    const ordered = {
        fieldType: field.fieldType,
        fieldId: field.fieldId,
        fieldLabel: field.fieldLabel
    } as EmittedField;
    const target = ordered as unknown as Record<string, unknown>;
    // `null` goes the way of `undefined`: Python strips `None` from every
    // payload at build time and the wire never carries a null, so a value
    // cleared with `null` is a value removed, on both sides.
    for (const key of FIELD_KEY_ORDER) {
        if (source[key] !== undefined && source[key] !== null) {
            // A RegExp has no JSON representation: `JSON.stringify` renders it
            // `{}`, so every email field shipped a `"pattern":{}` that said
            // nothing and matched nothing. Python emits the pattern's source
            // text, which is what the spec documents, so send that.
            target[key] = source[key] instanceof RegExp
                ? (source[key] as RegExp).source
                : source[key];
        }
    }
    for (const key of Object.keys(source)) {
        // `key in target` would walk the prototype chain and skip an extension
        // key named `toString` or `constructor`, which Python would have kept.
        if (!Object.prototype.hasOwnProperty.call(target, key) && source[key] !== undefined && source[key] !== null) {
            target[key] = source[key];
        }
    }
    return ordered;
}

export interface FormContent {
    title: string;
    intro?: string;
    note?: string;
    submit?: SubmitAction;
    /** Second action, rendered under the submit in the same footer bar. */
    secondary?: SecondaryAction;
    fields: Array<FormFieldParams & { fieldType: string; fieldId: string; fieldLabel: string }>;
}

/**
 * Builds a Form SGUI view — an interactive data-entry form.
 *
 * Fields are appended via `addField` and the typed helpers (`addTextField`,
 * `addEmailField`, `addSelectField`, `addPhotoField`, `addAudioField`,
 * `addVideoField`, `addGPSField`, ...);
 * `submitButton`/`updateButton`/`deleteButton` define the submit action, and
 * `injectData`/`setFieldValue` pre-fill existing fields.
 *
 * Extends {@link BaseView}; instantiated by the YeriaApp/YeriaUI factory,
 * populated with these builders, then serialized to a JSON view description and
 * signed into a v3 envelope by `serve()`.
 */
export class FormView extends BaseView {

    static fromJson(json: Record<string, unknown>): FormView {
        return FormView.fromJsonAs(FormView, 'Form', json);
    }
    private fieldValidations: Map<string, FieldValidation> = new Map();

    constructor(formId: string, title: string, processId?: string) {
        super({
            id: formId,
            type: 'Form',
            processId,
            metadata: {
                version: '1.0.0',
                createdAt: new Date()
            }
        });

        this.content = {
            title,
            submit: undefined,
            fields: []
        } as FormContent;
    }

    /**
     * Sets the form introduction (like ActionList/ActionGrid/etc.)
     */
    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    /**
     * Small print under the intro — a usage caveat, a legal mention, a count.
     * The mobile app has always rendered it; it simply had no setter here.
     */
    setNote(note: string): this {
        if (typeof note !== 'string')
            throw new InvalidParameterError('note', note, 'note must be a string');
        (this.content as FormContent).note = note;
        return this;
    }

    /**
     * Displayed text placed among the fields — a heading, an instruction, the
     * sentence the user has to read. It is NOT an input: it carries no value,
     * it is never submitted, and it is skipped by validation.
     *
     * Kept deliberately poor: four sizes, bold, italic. Anything richer
     * belongs in a ReaderView, not in the middle of a form.
     *
     * The sizes are sizes, not roles: nothing here says a block is a heading.
     * What a given size means is the provider's call.
     *
     * @param text   the text to display
     * @param options.size   'xl' | 'lg' | 'md' | 'sm' (default 'md')
     * @param options.bold   render bold
     * @param options.italic render italic
     */
    addParagraph(
        text: string,
        options: { size?: ParagraphSize; bold?: boolean; italic?: boolean } = {}
    ): this {
        if (typeof text !== 'string' || text.trim() === '')
            throw new InvalidParameterError('text', text, 'paragraph text must be a non-empty string');

        const size = options.size ?? 'md';
        if (!['xl', 'lg', 'md', 'sm'].includes(size))
            throw new InvalidParameterError('size', size, "size must be 'xl', 'lg', 'md' or 'sm'");

        const params: FormFieldParams = { value: text, size };
        if (options.bold) params.bold = true;
        if (options.italic) params.italic = true;

        // Goes through addField like everything else: one insertion path, one
        // set of checks. The id stays unique for keying; it is never a
        // submitted key.
        return this.addField(
            'paragraph',
            `paragraph-${(this.content as FormContent).fields.length}`,
            '',
            params
        );
    }

    /**
     * Second action of the form, rendered under the submit button.
     *
     * @param text   button label
     * @param url    where the action goes
     * @param options.mode 'navigate' (default — values are discarded) or
     *                     'submit' (current values are sent to `url`)
     */
    secondaryButton(
        text: string,
        url: string,
        options: {
            mode?: 'navigate' | 'submit';
            method?: HttpMethod;
            validate?: boolean;
            confirmMessage?: string;
        } = {}
    ): this {
        if (typeof text !== 'string' || text.trim() === '')
            throw new InvalidParameterError('text', text, 'secondary button text is required');
        if (typeof url !== 'string' || url.trim() === '')
            throw new InvalidParameterError('url', url, 'secondary button url is required');

        const mode = options.mode ?? 'navigate';
        if (mode !== 'navigate' && mode !== 'submit')
            throw new InvalidParameterError('mode', mode, "mode must be 'navigate' or 'submit'");

        const action: SecondaryAction = {
            text,
            url,
            mode,
            // A skip blocked by an empty required field would be absurd; a
            // second submit that skips validation would send garbage.
            validate: options.validate ?? (mode === 'submit')
        };
        if (mode === 'submit') action.method = options.method ?? 'POST';
        if (options.confirmMessage) action.confirmMessage = options.confirmMessage;

        (this.content as FormContent).secondary = action;
        return this;
    }

    /**
     * Helper method to associate this form with a process
     * @param processId - Process identifier
     * @param options - Process options (name, steps, etc.)
     */
    belongsToProcess(
        processId: string,
        options?: {
            processName?: string;
            currentStep?: number;
            totalSteps?: number;
            stepName?: string;
            canGoBack?: boolean;
            canSkip?: boolean;
        }
    ): this {
        this.setProcess(processId, options);
        return this;
    }

    /**
     * Adds a field with validation
     */
    addField(
        fieldType: string,
        fieldId: string,
        fieldLabel: string,
        params?: FormFieldParams
    ): this {
        // Display-only entries carry no label: `separator` draws a rule,
        // `paragraph` carries its text in `value`. Neither is an input.
        if (!fieldId || !fieldType || (!DISPLAY_ONLY_TYPES.includes(fieldType) && !fieldLabel)) {
            throw new MissingRequiredParameterError('fieldId, fieldLabel, and fieldType');
        }

        // Field validation
        const validation = FieldValidator.validateField(fieldType, fieldId, fieldLabel, params);
        if (!validation.isValid) {
            const errorMessages = validation.errors.map(e => e.message);
            throw new FieldValidationError(fieldId, fieldType, errorMessages);
        }

        const field = orderFieldKeys({ fieldType, fieldId, fieldLabel, ...params } as EmittedField);
        (this.content as FormContent).fields.push(field);

        // Store the validation for this field
        if (params) {
            this.fieldValidations.set(fieldId, params);
        }

        return this;
    }

    /**
     * Defines the submit button for the form
     * Convention: the client submits to the exact, validated service URL whose
     * response returned this form. The payload cannot provide another URL.
     *
     * @param text - Button text (e.g., "Register", "Submit")
     * @param method - HTTP method (default: POST)
     * @param confirmMessage - Optional confirmation message for destructive actions
     */
    submitButton(text: string, method: HttpMethod = 'POST', confirmMessage?: string): this {
        (this.content as FormContent).submit = {
            text,
            method,
            confirmMessage
        };

        return this;
    }

    /**
     * Convenience method for update actions (PUT)
     */
    updateButton(text: string, confirmMessage?: string): this {
        return this.submitButton(text, 'PUT', confirmMessage);
    }

    /**
     * Convenience method for delete actions (DELETE with confirmation)
     */
    deleteButton(text: string, confirmMessage: string = 'Are you sure you want to delete this?'): this {
        return this.submitButton(text, 'DELETE', confirmMessage);
    }

    /**
     * Convenience methods for different field types
     */
    addTextField(fieldId: string, fieldLabel: string, isRequired: boolean = false, maxLength?: number): this {
        return this.addField('text', fieldId, fieldLabel, {
            required: isRequired,
            maxLength
        });
    }

    addEmailField(fieldId: string, fieldLabel: string, isRequired: boolean = false): this {
        return this.addField('email', fieldId, fieldLabel, {
            required: isRequired,
            pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        });
    }

    addPasswordField(fieldId: string, fieldLabel: string, minLength: number = 8): this {
        return this.addField('password', fieldId, fieldLabel, {
            required: true,
            minLength
        });
    }

    addNumberField(fieldId: string, fieldLabel: string, isRequired: boolean = false, minVal?: number, maxVal?: number): this {
        return this.addField('number', fieldId, fieldLabel, {
            required: isRequired,
            min: minVal,
            max: maxVal
        });
    }

    /**
     * A date, optionally bounded.
     *
     * The bounds travel as `minDate` / `maxDate`, in `YYYY-MM-DD`, which is
     * what the spec declares and what the client reads. They used to be
     * converted to epoch milliseconds and emitted as `min` / `max`: the
     * renderer types both as strings, so it read nothing and every bound was
     * silently dropped — a form asking for a birth date accepted tomorrow.
     * The Python SDK always emitted the documented shape, so the two SDKs
     * also signed the same form differently.
     */
    addDateField(fieldId: string, fieldLabel: string, isRequired: boolean = false, minDate?: string, maxDate?: string): this {
        return this.addField('date', fieldId, fieldLabel, {
            required: isRequired,
            minDate,
            maxDate
        });
    }

    /**
     * One choice among several.
     *
     * `display` is a presentation preference, not a different field: `radio`
     * lays every option flat in the form, `dropdown` (the default) opens a
     * selection sheet. Pick `radio` for a handful of options the user should
     * be able to compare at a glance, `dropdown` when there are many. A
     * client that does not know the key falls back to the sheet.
     */
    addSelectField(fieldId: string, fieldLabel: string, isRequired: boolean = false, options: Array<{ label: string; value: unknown }>, display?: SelectDisplay): this {
        if (!Array.isArray(options) || options.length === 0) {
            throw new EmptyCollectionError('Select field options', 'Select field must have at least one option');
        }
        if (display !== undefined && display !== 'dropdown' && display !== 'radio') {
            throw new InvalidParameterError('display', display, "display must be 'dropdown' or 'radio'");
        }

        return this.addField('select', fieldId, fieldLabel, {
            required: isRequired,
            options,
            // Omise quand elle n'est pas posee : le client applique son defaut.
            ...(display === undefined ? {} : { display })
        });
    }

    /**
     * @param options.multiple  accept more than one photo in this field.
     * @param options.maxCount  upper bound when `multiple` is set.
     * @param options.source    `record` (camera only), `library` (gallery only)
     *   or `both` (default). Use `record` when the photo must have been taken
     *   now rather than picked from the gallery.
     */
    addPhotoField(
        fieldId: string,
        fieldLabel: string,
        isRequired: boolean = false,
        formats: string[] = ['jpeg', 'png'],
        live: boolean = false,
        options: MediaFieldOptions & { multiple?: boolean; maxCount?: number; source?: CaptureSource } = {}
    ): this {
        if (!formats || formats.length === 0) {
            throw new EmptyCollectionError('Photo field formats', 'Photo field must specify at least one format');
        }

        const acceptedFormats = formats.map(format => `image/${format.toLowerCase()}`);
        return this.addField('photo', fieldId, fieldLabel, {
            required: isRequired,
            accept: acceptedFormats,
            live,
            ...options
        });
    }

    addFileField(
        fieldId: string,
        fieldLabel: string,
        isRequired: boolean = false,
        formats: string[],
        options: MediaFieldOptions & { multiple?: boolean; maxCount?: number } = {}
    ): this {
        if (!formats || formats.length === 0) {
            throw new EmptyCollectionError('File field formats', 'File field must specify at least one format');
        }

        return this.addField('file', fieldId, fieldLabel, {
            required: isRequired,
            accept: formats,
            ...options
        });
    }

    /**
     * Adds a voice-recording field.
     *
     * The captured file travels back inside the normal multipart form submission
     * under this `fieldId` — there is no separate upload endpoint.
     *
     * @param options.maxDuration seconds. Recommended: it is the only thing that
     *   bounds how large the upload gets. Voice at the renderer's default
     *   encoding runs roughly 0.5 MB per minute.
     * @param options.minDuration seconds. Rejects an accidental tap-and-release.
     * @param options.source      `record` (microphone only), `library` (pick an
     *   existing file) or `both` (default).
     * @param options.formats     accepted container extensions. Defaults cover
     *   what iOS and Android record natively.
     */
    addAudioField(
        fieldId: string,
        fieldLabel: string,
        isRequired: boolean = false,
        options: MediaFieldOptions & {
            maxDuration?: number;
            minDuration?: number;
            source?: CaptureSource;
            multiple?: boolean;
            maxCount?: number;
            maxSize?: number;
            formats?: string[];
        } = {}
    ): this {
        const { formats = ['m4a', 'mp3', 'wav', 'aac'], ...params } = options;
        if (formats.length === 0) {
            throw new EmptyCollectionError('Audio field formats', 'Audio field must specify at least one format');
        }

        return this.addField('audio', fieldId, fieldLabel, {
            required: isRequired,
            accept: FileFormatManager.getMimeTypes(formats),
            ...params
        });
    }

    /**
     * Adds a video-recording field.
     *
     * Like audio, the captured file rides the normal multipart submission under
     * this `fieldId`.
     *
     * `maxDuration` is REQUIRED here. Video is the one field type that can
     * produce a payload large enough to fail the provider's request body limit,
     * and duration × quality is what bounds it — see {@link VideoQuality} for
     * the per-minute sizes each setting implies.
     *
     * @param options.maxDuration seconds. Required.
     * @param options.quality     capture ceiling (default `medium`).
     * @param options.source      `record` (camera only), `library` or `both`
     *   (default).
     * @param options.maxSize     bytes. The renderer refuses to upload a file
     *   past this and reports a field error instead of failing mid-request.
     */
    addVideoField(
        fieldId: string,
        fieldLabel: string,
        isRequired: boolean = false,
        options: MediaFieldOptions & {
            maxDuration: number;
            minDuration?: number;
            quality?: VideoQuality;
            source?: CaptureSource;
            multiple?: boolean;
            maxCount?: number;
            maxSize?: number;
            formats?: string[];
        }
    ): this {
        const { formats = ['mp4', 'mov', 'webm'], ...params } = options || {};
        if (formats.length === 0) {
            throw new EmptyCollectionError('Video field formats', 'Video field must specify at least one format');
        }

        return this.addField('video', fieldId, fieldLabel, {
            required: isRequired,
            quality: 'medium',
            accept: FileFormatManager.getMimeTypes(formats),
            ...params
        });
    }

    /**
     * @param config.altitude    include altitude in the captured value.
     * @param config.maxAccuracy the coarsest fix the provider accepts, in
     *   METRES (i.e. the minimum required precision). The mobile app keeps
     *   searching until `position.accuracy <= maxAccuracy`, and the captured
     *   accuracy travels back in the submitted value. Omit for the app default.
     * @param config.precision   legacy boolean high-accuracy flag — superseded
     *   by `maxAccuracy`; kept for backward compatibility.
     */
    addGPSField(
        fieldId: string,
        fieldLabel: string,
        isRequired: boolean = false,
        liveData: boolean = false,
        config: { altitude?: boolean; maxAccuracy?: number; precision?: boolean } = {}
    ): this {
        return this.addField('gps', fieldId, fieldLabel, {
            required: isRequired,
            live: liveData,
            ...config
        });
    }

    addPlusCodeField(fieldId: string, fieldLabel: string, isRequired: boolean = false, liveData: boolean = false): this {
        return this.addField('pluscode', fieldId, fieldLabel, {
            required: isRequired,
            live: liveData
        });
    }

    addHiddenField(fieldId: string, fieldLabel: string, value: string): this {
        return this.addField('hidden', fieldId, fieldLabel, { value });
    }

    addTextAreaField(fieldId: string, fieldLabel: string, isRequired: boolean = false, minLength?: number, maxLength?: number): this {
        return this.addField('textarea', fieldId, fieldLabel, {
            required: isRequired,
            minLength,
            maxLength
        });
    }

    addPhoneField(fieldId: string, fieldLabel: string, isRequired: boolean = false): this {
        return this.addField('phone', fieldId, fieldLabel, {
            required: isRequired,
            pattern: /^[\+]?[1-9][\d]{0,15}$/
        });
    }

    addURLField(fieldId: string, fieldLabel: string, isRequired: boolean = false): this {
        return this.addField('url', fieldId, fieldLabel, {
            required: isRequired
        });
    }

    addCheckboxField(fieldId: string, fieldLabel: string, isRequired: boolean = false): this {
        return this.addField('checkbox', fieldId, fieldLabel, {
            required: isRequired
        });
    }

    /**
     * Adds a visual separator to group form fields
     * Separators are rendered as gaps or lines by the mobile app renderer
     * @param fieldId - Optional field ID. If not provided, auto-generates a unique ID
     * @param label - Optional label. Empty by default; the mobile renderer may
     *   display it once separator-label rendering lands
     * @returns this for chaining
     * @example
     * form.addTextField('name', 'Name', true)
     *     .addSeparator()
     *     .addEmailField('email', 'Email', true);
     */
    /**
     * Vertical breathing space between fields — nothing is drawn.
     *
     * Complements {@link addSeparator}, which draws a rule: use a separator to
     * say "a new group starts here", a spacer to let an existing group breathe
     * without claiming a boundary.
     *
     * Three steps only, so a form cannot drift into arbitrary spacing: `sm`,
     * `md` (default), `lg`. What each one measures is the client's business —
     * a provider asks for a gap, not for a number of pixels.
     *
     * Carries no value, is never submitted, and is skipped by validation.
     */
    addSpacer(size: SpacerSize = 'md'): this {
        if (!['sm', 'md', 'lg'].includes(size))
            throw new InvalidParameterError('size', size, "size must be 'sm', 'md' or 'lg'");

        // Id derived from the position, like addParagraph: a timestamp would
        // make two identical forms serialize — and therefore sign — differently.
        return this.addField(
            'spacer',
            `spacer-${(this.content as FormContent).fields.length}`,
            '',
            { size }
        );
    }

    addSeparator(fieldId?: string, label: string = ''): this {
        const separatorId = fieldId || `separator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return this.addField('separator', separatorId, label, {});
    }

    /**
     * Injects data into the form's existing fields
     * Automatically handles fields with options (select, radio) using "selected"
     * @param data - Key-value object where key = fieldId
     * @returns Result with errors for fields not found
     * @example
     * const result = form.injectData({
     *   name: 'John Doe',
     *   email: 'john@example.com',
     *   country: 'FR'  // For select: sets selected: true on the 'FR' option
     * });
     * if (result.isErr()) {
     *   console.warn('Some fields not found:', result.error);
     * }
     */
    injectData(data: Record<string, unknown>): Result<void, string[]> {
        const errors: string[] = [];

        Object.entries(data).forEach(([fieldId, value]) => {
            const field = this.getField(fieldId);
            if (!field) {
                errors.push(`Field not found: ${fieldId}`);
                return;
            }

            // Automatic detection: fields with options (select, radio, checkbox with options)
            if (field.options && field.fieldType === 'select') {
                // For select: mark the matching option as selected
                const updatedOptions = field.options.map(opt => ({
                    ...opt,
                    selected: opt.value === value
                }));
                this.updateField(fieldId, { options: updatedOptions as any });
            }
            // Radio: a single value
            else if (field.options && field.fieldType === 'radio') {
                const updatedOptions = field.options.map(opt => ({
                    ...opt,
                    selected: opt.value === value
                }));
                this.updateField(fieldId, { options: updatedOptions as any });
            }
            // Checkbox with options: value is an array (multi-select)
            else if (field.options && field.fieldType === 'checkbox') {
                const selectedValues = Array.isArray(value) ? value : [value];
                const updatedOptions = field.options.map(opt => ({
                    ...opt,
                    selected: selectedValues.includes(opt.value)
                }));
                this.updateField(fieldId, { options: updatedOptions as any });
            }
            // Simple checkbox (true/false) or all other fields: use value
            else {
                try {
                    this.updateField(fieldId, { value: value as any });
                } catch (e) {
                    // A refused value is one error among the others this
                    // method reports, not an exception out of the loop.
                    errors.push(e instanceof Error ? e.message : String(e));
                }
            }
        });

        if (errors.length > 0) {
            return Err(errors);
        }
        return Ok(undefined);
    }

    /**
     * Sets the value of a specific field
     * @param fieldId - Field ID
     * @param value - Value to inject
     * @example
     * form.setFieldValue('name', 'John Doe')
     */
    setFieldValue(fieldId: string, value: unknown): this {
        const field = this.getField(fieldId);
        if (!field) {
            throw new FieldNotFoundError(fieldId, this.id);
        }

        this.updateField(fieldId, { value: value as any });
        return this;
    }

    /**
     * Validates the form data
     * Note: This is for SDK internal validation. Services using this SDK should
     * perform their own data validation before populating views.
     */
    validateFormData(formData: Record<string, any>): ValidationResult {
        return FormValidator.validateFormData(formData, this.fieldValidations);
    }

    /**
     * Gets a field by its ID
     */
    /**
     * Canonicalises every field before the view is serialised.
     *
     * Ordering at write time is not enough on its own: `getField` hands back
     * the stored object, so a caller can set a key on it directly and land it
     * wherever `Object.assign` would have — after the fact, at the end. The
     * order is a wire contract, so it is settled here, at the one point every
     * payload goes through, whatever route the field took to get here.
     */
    override build(): Record<string, unknown> {
        const fields = (this.content as FormContent).fields;
        for (let i = 0; i < fields.length; i++) {
            const field = orderFieldKeys(fields[i] as EmittedField);
            fields[i] = field;
            // Same reasoning as the order: a value written straight onto the
            // object `getField` returned skipped `updateField`, so the media
            // path rule is checked once more here, where every field ends up.
            const problems = validateStoredMediaPaths(field.fieldType, field.fieldId, field.value);
            if (problems.length > 0) {
                throw new FieldValidationError(field.fieldId, field.fieldType, problems.map(e => e.message));
            }
        }
        return super.build();
    }

    getField(fieldId: string): (FormFieldParams & { fieldType: string; fieldId: string; fieldLabel: string }) | undefined {
        return (this.content as FormContent).fields.find(field => field.fieldId === fieldId);
    }

    /**
     * Removes a field by its ID
     * @returns Result with success or error message
     */
    removeField(fieldId: string): Result<void, string> {
        const fields = (this.content as FormContent).fields;
        const index = fields.findIndex(field => field.fieldId === fieldId);

        if (index !== -1) {
            fields.splice(index, 1);
            this.fieldValidations.delete(fieldId);
            return Ok(undefined);
        }

        return Err(`Field '${fieldId}' not found in form '${this.id}'`);
    }

    /**
     * Updates an existing field
     * @returns Result with success or error message
     */
    updateField(fieldId: string, updates: Partial<FormFieldParams>): Result<void, string> {
        const field = this.getField(fieldId);
        if (!field) {
            return Err(`Field '${fieldId}' not found in form '${this.id}'`);
        }

        // Rebuild rather than mutate: `Object.assign` appends a key the field
        // did not already carry, so a late `setFieldValue` used to place
        // `value` last while Python emits it first.
        const fields = (this.content as FormContent).fields;
        const merged = orderFieldKeys({ ...field, ...updates } as EmittedField);

        // A value set after the fact takes the same road as one set at build
        // time: `addField` refused an absolute media path, and this method
        // used to let one straight through — `setFieldValue` and `injectData`
        // both land here.
        if ('value' in updates) {
            const problems = validateStoredMediaPaths(merged.fieldType, fieldId, merged.value);
            if (problems.length > 0) {
                throw new FieldValidationError(fieldId, merged.fieldType, problems.map(e => e.message));
            }
        }
        fields[fields.indexOf(field)] = merged;

        // Update the validation
        if (this.fieldValidations.has(fieldId)) {
            const existingValidation = this.fieldValidations.get(fieldId)!;
            this.fieldValidations.set(fieldId, { ...existingValidation, ...updates });
        }

        return Ok(undefined);
    }

    /**
     * Gets all fields
     */
    getFields(): Array<FormFieldParams & { fieldType: string; fieldId: string; fieldLabel: string }> {
        return [...(this.content as FormContent).fields];
    }

    /**
     * Gets the field count
     * @param excludeSeparators - If true, excludes separator fields from count (default: false)
     */
    getFieldCount(excludeSeparators: boolean = false): number {
        if (excludeSeparators) {
            return (this.content as FormContent).fields.filter(field => field.fieldType !== 'separator').length;
        }
        return (this.content as FormContent).fields.length;
    }

    /**
     * Checks whether the form has required fields
     */
    hasRequiredFields(): boolean {
        return (this.content as FormContent).fields.some(field => field.required);
    }

    /**
     * Gets the required fields
     */
    getRequiredFields(): string[] {
        return (this.content as FormContent).fields
            .filter(field => field.required)
            .map(field => field.fieldId);
    }
}
