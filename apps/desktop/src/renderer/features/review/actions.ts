import type { HunkSelection } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { getFile, useEditorStore } from '../../stores/editor';
import { refreshReview } from '../../stores/review';
import { notify } from '../../stores/toasts';

const t = i18next.t.bind(i18next);
const tabPath = (path: string) => `review:${path}`;

/** Opens (or focuses) the review tab of a changed file. */
export function openReview(path: string): void {
  const id = tabPath(path);
  if (!getFile(id)) {
    useEditorStore.setState((state) => ({
      files: [
        ...state.files,
        {
          path: id,
          kind: 'review',
          reviewPath: path,
          dirty: false,
          mtimeMs: null,
          external: 'none',
        },
      ],
    }));
  }
  useEditorStore.setState({ active: id });
}

export function closeReviewTab(path: string): void {
  const id = tabPath(path);
  useEditorStore.setState((state) => {
    const index = state.files.findIndex((file) => file.path === id);
    if (index === -1) return state;
    const files = state.files.filter((file) => file.path !== id);
    const neighbour = files[index] ?? files[index - 1];
    return { files, active: state.active === id ? (neighbour?.path ?? null) : state.active };
  });
}

export async function resolveChange(path: string, keep: HunkSelection): Promise<boolean> {
  const result = await window.kestrel.invoke('review:resolve', { path, keep });
  await refreshReview();
  if (!result.ok) {
    notifyError(t('review.decide'), result.error);
    return false;
  }
  notify(
    'success',
    keep === 'none' ? t('review.rejected', { path }) : t('review.accepted', { path }),
  );
  closeReviewTab(path);
  return true;
}

export async function resolveAllChanges(keep: 'all' | 'none'): Promise<void> {
  const result = await window.kestrel.invoke('review:resolveAll', { keep });
  await refreshReview();
  if (!result.ok) {
    notifyError(t('review.decide'), result.error);
    return;
  }
  notify(
    'success',
    keep === 'all'
      ? t('review.acceptedAll', { count: result.data })
      : t('review.rejectedAll', { count: result.data }),
  );
}
