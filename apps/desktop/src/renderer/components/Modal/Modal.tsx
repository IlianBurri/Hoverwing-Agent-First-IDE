import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../IconButton';
import styles from './Modal.module.css';
import { useOverlay } from '../../stores/overlays';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Wide modals for lists and forms. */
  size?: 'md' | 'lg';
}

/** A modal window based on <dialog>: focus trap and Escape come for free. */
export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useOverlay();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={[styles['dialog'], styles[size]].filter(Boolean).join(' ')}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className={styles['header']}>
        <h2 id="modal-title" className={styles['title']}>
          {title}
        </h2>
        <IconButton size="sm" icon={X} label={t('dialog.close')} onClick={onClose} />
      </header>
      <div className={styles['body']}>{children}</div>
    </dialog>
  );
}
