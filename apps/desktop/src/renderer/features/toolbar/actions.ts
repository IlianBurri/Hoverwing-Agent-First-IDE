import { openModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { addItem, moveItem, removeItem } from './items';

function updateToolbar(change: (items: readonly string[]) => string[]): void {
  const { settings, update } = useSettingsStore.getState();
  void update({ toolbar: change(settings.toolbar) });
}

export function addToToolbar(id: string): void {
  updateToolbar((items) => addItem(items, id));
}

export function removeFromToolbar(id: string): void {
  updateToolbar((items) => removeItem(items, id));
}

export function moveInToolbar(id: string, step: -1 | 1): void {
  updateToolbar((items) => moveItem(items, id, step));
}

export function openToolbarDialog(): void {
  openModal({ id: 'toolbar' });
}
