import { MAX_TOOLBAR_ITEMS } from '@kestrel/shared';

/** Adds a command at the end (no duplicates, at most MAX_TOOLBAR_ITEMS). */
export function addItem(items: readonly string[], id: string): string[] {
  if (items.includes(id) || items.length >= MAX_TOOLBAR_ITEMS) return [...items];
  return [...items, id];
}

export function removeItem(items: readonly string[], id: string): string[] {
  return items.filter((item) => item !== id);
}

/** Moves a command one step left (-1) or right (+1); stays put at the ends. */
export function moveItem(items: readonly string[], id: string, step: -1 | 1): string[] {
  const index = items.indexOf(id);
  const target = index + step;
  if (index === -1 || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  next[index] = next[target] ?? id;
  next[target] = id;
  return next;
}
