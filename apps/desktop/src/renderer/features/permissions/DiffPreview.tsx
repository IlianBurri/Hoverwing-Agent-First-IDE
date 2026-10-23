import styles from './DiffPreview.module.css';

/** Renders a unified diff with +/- lines coloured (and marked for screen readers). */
export function DiffPreview({ diff, label }: { diff: string; label: string }) {
  const lines = diff
    .split('\n')
    .filter((line) => !line.startsWith('Index:') && !line.startsWith('===='));
  return (
    <pre className={styles['root']} aria-label={label} tabIndex={0}>
      {lines.map((line, index) => {
        const type =
          line.startsWith('+++') || line.startsWith('---')
            ? 'meta'
            : line.startsWith('+')
              ? 'added'
              : line.startsWith('-')
                ? 'removed'
                : line.startsWith('@@')
                  ? 'hunk'
                  : 'context';
        return (
          <span key={String(index)} className={styles[type]}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}
