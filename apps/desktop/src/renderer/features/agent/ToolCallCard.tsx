import { useState } from 'react';
import {
  ArrowRightLeft,
  Brain,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileMinus,
  FilePen,
  FileSearch,
  Globe,
  LoaderCircle,
  Search,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ToolCallView } from '@kestrel/shared';
import { DiffPreview } from '../permissions';
import { openFile } from '../editor';
import styles from './ToolCallCard.module.css';

const kindIcons: Record<ToolCallView['kind'], LucideIcon> = {
  read: FileSearch,
  edit: FilePen,
  delete: FileMinus,
  move: ArrowRightLeft,
  search: Search,
  execute: SquareTerminal,
  think: Brain,
  fetch: Globe,
  switch_mode: Wrench,
  other: Wrench,
};

const statusIcons: Record<ToolCallView['status'], LucideIcon> = {
  pending: CircleDashed,
  in_progress: LoaderCircle,
  completed: CircleCheck,
  failed: CircleX,
};

/** One tool call of the agent: what, on which files, status, result. */
export function ToolCallCard({ toolCall }: { toolCall: ToolCallView }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const expanded = open || toolCall.status === 'failed';
  const Icon = kindIcons[toolCall.kind];
  const StatusIcon = statusIcons[toolCall.status];
  const hasDetails = toolCall.diffs.length > 0 || toolCall.output !== '';

  return (
    <article className={[styles['root'], styles[toolCall.status]].join(' ')}>
      <button
        type="button"
        className={styles['header']}
        aria-expanded={hasDetails ? expanded : undefined}
        disabled={!hasDetails}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {hasDetails &&
          (expanded ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          ))}
        <Icon size={14} aria-hidden="true" className={styles['kind']} />
        <span className={styles['title']}>
          {toolCall.title || t(`agent.toolKind.${toolCall.kind}`)}
        </span>
        <span className={styles['status']}>
          <StatusIcon size={14} aria-hidden="true" className={styles['statusIcon']} />
          {t(`agent.toolStatus.${toolCall.status}`)}
        </span>
      </button>
      {toolCall.locations.length > 0 && (
        <div className={styles['locations']}>
          {toolCall.locations.map((location) => (
            <button
              key={location}
              type="button"
              className={styles['location']}
              title={t('agent.openLocation', { path: location })}
              onClick={() => void openFile(location)}
            >
              {location}
            </button>
          ))}
        </div>
      )}
      {expanded && (
        <div className={styles['details']}>
          {toolCall.diffs.map((diff) => (
            <DiffPreview
              key={diff.path}
              diff={diff.patch}
              label={t('agent.diffOf', { path: diff.path })}
            />
          ))}
          {toolCall.output && (
            <pre className={styles['output']} aria-label={t('agent.toolOutput')}>
              {toolCall.output}
            </pre>
          )}
        </div>
      )}
    </article>
  );
}
