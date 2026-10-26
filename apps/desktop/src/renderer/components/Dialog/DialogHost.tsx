import { useEffect, useId, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { closeDialog, useDialogStore } from '../../stores/dialogs';
import type {
  ChooseOptions,
  ConfirmOptions,
  DialogRequest,
  PromptOptions,
} from '../../stores/dialogs';
import { Button } from '../Button';
import styles from './Dialog.module.css';
import { useOverlay } from '../../stores/overlays';

/**
 * Renders the current prompt/confirm dialog with the native <dialog>
 * element: showModal() gives us a focus trap, Escape handling and an inert
 * background for free.
 */
export function DialogHost() {
  const current = useDialogStore((state) => state.current);
  if (!current) return null;
  // A new key per request resets the form state.
  return <ModalDialog key={current.id} request={current} />;
}

function ModalDialog({ request }: { request: DialogRequest }) {
  const ref = useRef<HTMLDialogElement>(null);
  useOverlay();
  const settled = useRef(false);

  function finish(value: string | boolean | null) {
    if (settled.current) return;
    settled.current = true;
    ref.current?.close();
    if (request.kind === 'confirm') request.resolve(value === true);
    else request.resolve(typeof value === 'string' ? value : null);
    closeDialog();
  }

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles['dialog']}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        finish(null);
      }}
    >
      {request.kind === 'prompt' && <PromptForm options={request.options} onDone={finish} />}
      {request.kind === 'confirm' && <ConfirmForm options={request.options} onDone={finish} />}
      {request.kind === 'choose' && <ChooseForm options={request.options} onDone={finish} />}
    </dialog>
  );
}

function PromptForm({
  options,
  onDone,
}: {
  options: PromptOptions;
  onDone: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(options.initialValue ?? '');
  const [touched, setTouched] = useState(false);
  const error =
    touched || value !== (options.initialValue ?? '') ? options.validate?.(value) : null;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const [start, end] = options.selection ?? [0, input.value.length];
    input.setSelectionRange(start, end);
  }, [options.selection]);

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);
    if (options.validate?.(value)) return;
    onDone(value);
  }

  return (
    <form className={styles['form']} onSubmit={onSubmit} noValidate>
      <h2 id="dialog-title" className={styles['title']}>
        {options.title}
      </h2>
      <label htmlFor={inputId} className={styles['label']}>
        {options.label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className={styles['input']}
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      {error && (
        <p id={errorId} className={styles['error']} role="alert">
          {error}
        </p>
      )}
      <div className={styles['actions']}>
        <Button
          onClick={() => {
            onDone(null);
          }}
        >
          {t('dialog.cancel')}
        </Button>
        <Button type="submit" variant="primary">
          {options.confirmLabel}
        </Button>
      </div>
    </form>
  );
}

function ConfirmForm({
  options,
  onDone,
}: {
  options: ConfirmOptions;
  onDone: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <form
      className={styles['form']}
      onSubmit={(event) => {
        event.preventDefault();
        onDone(true);
      }}
    >
      <h2 id="dialog-title" className={styles['title']}>
        {options.title}
      </h2>
      <p className={styles['message']}>{options.message}</p>
      <div className={styles['actions']}>
        {/* Cancel comes first and gets focus: the safe choice is the default. */}
        <Button
          autoFocus
          onClick={() => {
            onDone(false);
          }}
        >
          {t('dialog.cancel')}
        </Button>
        <Button type="submit" variant={options.danger ? 'danger' : 'primary'}>
          {options.confirmLabel}
        </Button>
      </div>
    </form>
  );
}

function ChooseForm({
  options,
  onDone,
}: {
  options: ChooseOptions<string>;
  onDone: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles['form']}>
      <h2 id="dialog-title" className={styles['title']}>
        {options.title}
      </h2>
      <p className={styles['message']}>{options.message}</p>
      <div className={styles['actions']}>
        {options.choices.map((choice, index) => (
          <Button
            key={choice.id}
            autoFocus={index === 0}
            variant={choice.variant ?? 'secondary'}
            onClick={() => {
              onDone(choice.id);
            }}
          >
            {choice.label}
          </Button>
        ))}
        <Button
          onClick={() => {
            onDone(null);
          }}
        >
          {t('dialog.cancel')}
        </Button>
      </div>
    </div>
  );
}
