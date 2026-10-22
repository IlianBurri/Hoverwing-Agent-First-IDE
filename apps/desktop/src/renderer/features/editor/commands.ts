import { ArrowLeftRight, Save, SaveAll, X } from 'lucide-react';
import type { ParseKeys } from 'i18next';
import { i18next } from '../../i18n';
import { useEditorStore } from '../../stores/editor';
import { registerCommands } from '../commands';
import type { Command } from '../commands';
import { closeAll, closeFile, cycleTab, save, saveAll } from './actions';

const t =
  (key: ParseKeys): (() => string) =>
  () =>
    i18next.t(key);

const activePath = () => useEditorStore.getState().active;
const hasActive = () => activePath() !== null;
const hasDirty = () => useEditorStore.getState().files.some((file) => file.dirty);
const hasTabs = () => useEditorStore.getState().files.length > 0;

export function registerEditorCommands(): () => void {
  const category = t('commands.category.editor');
  const commands: Command[] = [
    {
      id: 'editor.save',
      category,
      title: t('editor.save'),
      icon: Save,
      keybinding: 'Mod+S',
      when: hasActive,
      run: async () => {
        const path = activePath();
        if (path) await save(path);
      },
    },
    {
      id: 'editor.saveAll',
      category,
      title: t('editor.saveAll'),
      icon: SaveAll,
      keybinding: 'Mod+Alt+S',
      when: hasDirty,
      run: saveAll,
    },
    {
      id: 'editor.close',
      category,
      title: t('editor.closeActive'),
      icon: X,
      keybinding: 'Mod+W',
      when: hasActive,
      run: async () => {
        const path = activePath();
        if (path) await closeFile(path);
      },
    },
    {
      id: 'editor.closeAll',
      category,
      title: t('editor.closeAll'),
      when: hasTabs,
      run: async () => {
        await closeAll();
      },
    },
    {
      id: 'editor.nextTab',
      category,
      title: t('editor.nextTab'),
      icon: ArrowLeftRight,
      keybinding: 'Ctrl+Tab',
      when: hasTabs,
      run: () => {
        cycleTab(1);
      },
    },
    {
      id: 'editor.previousTab',
      category,
      title: t('editor.previousTab'),
      icon: ArrowLeftRight,
      keybinding: 'Ctrl+Shift+Tab',
      when: hasTabs,
      run: () => {
        cycleTab(-1);
      },
    },
  ];
  return registerCommands(commands);
}
