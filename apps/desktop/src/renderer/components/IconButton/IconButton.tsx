import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Accessible name and tooltip. Required because there is no visible text. */
  label: string;
  /** Renders as a toggle (aria-pressed) when set. */
  pressed?: boolean;
  size?: 'sm' | 'md';
}

export function IconButton({
  icon: Icon,
  label,
  pressed,
  size = 'md',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={[styles['root'], styles[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon size={size === 'sm' ? 16 : 20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
