import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dismissToast, useToastStore } from '../../stores/toasts';
import { IconButton } from '../IconButton';
import { StatusMessage } from '../StatusMessage';
import styles from './Toasts.module.css';

export function Toasts() {
  const { t } = useTranslation();
  const toasts = useToastStore((state) => state.toasts);
  return (
    <div className={styles['root']}>
      {toasts.map((toast) => (
        <div key={toast.id} className={styles['toast']}>
          <StatusMessage kind={toast.kind}>{toast.message}</StatusMessage>
          <IconButton
            size="sm"
            icon={X}
            label={t('dialog.dismiss')}
            onClick={() => {
              dismissToast(toast.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
