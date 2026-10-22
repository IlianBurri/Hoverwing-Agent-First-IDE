import { Menu, app } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * A minimal application menu. Electron's default menu binds Ctrl/Cmd+W
 * (close window) and Ctrl/Cmd+R (reload), which would clash with "close tab"
 * and could lose unsaved work. Shortcuts are handled by the renderer's
 * command system instead; the menu keeps only what the OS expects.
 */
export function installAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === 'darwin') {
    template.push({ role: 'appMenu' });
    // On macOS, copy/paste/undo shortcuts only work through the Edit menu.
    template.push({
      role: 'editMenu',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    });
    template.push({ role: 'windowMenu', submenu: [{ role: 'minimize' }, { role: 'zoom' }] });
  }
  if (!app.isPackaged) {
    template.push({
      label: 'Developer',
      submenu: [{ role: 'toggleDevTools', accelerator: 'F12' }],
    });
  }
  Menu.setApplicationMenu(template.length > 0 ? Menu.buildFromTemplate(template) : null);
}
