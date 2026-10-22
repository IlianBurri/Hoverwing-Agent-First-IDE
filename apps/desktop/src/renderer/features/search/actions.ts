import { buildSearchRegExp } from '@kestrel/shared';
import type { SearchOptions } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { errorMessage, notifyError } from '../../lib/errors';
import { confirm } from '../../stores/dialogs';
import { useEditorStore } from '../../stores/editor';
import { countMatches, useSearchStore } from '../../stores/search';
import { notify } from '../../stores/toasts';

const t = i18next.t.bind(i18next);
const DEBOUNCE_MS = 300;
let timer: number | undefined;
/** Ignores results of searches that were superseded by a newer one. */
let generation = 0;

export function setOptions(patch: Partial<SearchOptions>): void {
  useSearchStore.setState((state) => ({ options: { ...state.options, ...patch } }));
  scheduleSearch();
}

export function scheduleSearch(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void runSearch(), DEBOUNCE_MS);
}

export async function runSearch(): Promise<void> {
  window.clearTimeout(timer);
  const { options } = useSearchStore.getState();
  const current = ++generation;
  if (options.query.trim() === '') {
    void window.kestrel.invoke('search:cancel');
    useSearchStore.setState({ status: 'idle', result: null, error: null });
    return;
  }
  if (options.isRegex) {
    try {
      buildSearchRegExp(options);
    } catch {
      useSearchStore.setState({
        status: 'error',
        error: t('errors.code.invalid_pattern'),
        result: null,
      });
      return;
    }
  }
  useSearchStore.setState({ status: 'searching', error: null });
  const result = await window.kestrel.invoke('search:find', options);
  if (current !== generation) return;
  if (result.ok) {
    useSearchStore.setState({ status: 'done', result: result.data, collapsed: new Set() });
  } else {
    useSearchStore.setState({ status: 'error', error: errorMessage(result.error), result: null });
  }
}

export function toggleCollapsed(path: string): void {
  useSearchStore.setState((state) => {
    const next = new Set(state.collapsed);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return { collapsed: next };
  });
}

/** Replaces in the given files (all result files when omitted). */
export async function replaceAll(onlyPath?: string): Promise<void> {
  const { options, replacement, result } = useSearchStore.getState();
  if (!result) return;
  const files = result.files.filter((file) => onlyPath === undefined || file.path === onlyPath);
  // Files with unsaved edits are skipped, so no editor change is overwritten.
  const dirty = new Set(
    useEditorStore
      .getState()
      .files.filter((file) => file.dirty)
      .map((file) => file.path),
  );
  const targets = files.filter((file) => !dirty.has(file.path));
  const skipped = files.length - targets.length;
  const count = targets.reduce((sum, file) => sum + file.matches.length, 0);
  if (targets.length === 0) {
    if (skipped > 0) notify('warning', t('search.skippedDirty', { count: skipped }));
    return;
  }

  const confirmed = await confirm({
    title: t('search.replaceConfirmTitle', { count, files: targets.length }),
    message:
      skipped > 0
        ? `${t('search.replaceConfirmMessage')} ${t('search.skippedDirty', { count: skipped })}`
        : t('search.replaceConfirmMessage'),
    confirmLabel: t('search.replaceAll'),
    danger: true,
  });
  if (!confirmed) return;

  const response = await window.kestrel.invoke('search:replace', {
    options,
    replacement,
    paths: targets.map((file) => file.path),
  });
  if (!response.ok) {
    notifyError(t('search.replaceAll'), response.error);
    return;
  }
  const { replacements, filesChanged, failed } = response.data;
  notify(
    failed.length > 0 ? 'warning' : 'success',
    t('search.replaced', { count: replacements, files: filesChanged }) +
      (failed.length > 0 ? ` ${t('search.replaceFailed', { count: failed.length })}` : ''),
  );
  await runSearch();
}

export function totalMatches(): number {
  return countMatches(useSearchStore.getState().result);
}
