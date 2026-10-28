import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { i18next } from '../../i18n';
import { subscribeOutput, useTerminalStore } from '../../stores/terminal';
import { openBrowser } from '../browser/actions';
import { isLocalUrl } from './links';
import { xtermTheme } from './xtermTheme';
import styles from './TerminalView.module.css';

const RESIZE_DELAY_MS = 50;

/** One xterm.js view, connected to one shell in the main process. */
export function TerminalInstance({ id, visible }: { id: string; visible: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const exitCode = useTerminalStore(
    (state) => state.sessions.find((session) => session.id === id)?.exitCode ?? null,
  );

  useEffect(() => {
    if (!container.current) return;
    const terminal = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollback: 5000,
      allowProposedApi: false,
      theme: xtermTheme(),
      // Screen reader users get a live region with the output.
      screenReaderMode: false,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(
      new WebLinksAddon((_event, url) => {
        // Local dev servers open in Hoverwing's browser, everything else outside.
        if (isLocalUrl(url)) void openBrowser(url);
        else void window.kestrel.invoke('app:openExternalUrl', { url });
      }),
    );

    // Ctrl+Shift+C copies the selection (Ctrl+C stays "interrupt" for the shell).
    terminal.attachCustomKeyEventHandler((event) => {
      const isCopy = event.ctrlKey && event.shiftKey && event.code === 'KeyC';
      if (event.type === 'keydown' && isCopy && terminal.hasSelection()) {
        void window.kestrel.invoke('app:writeClipboard', { text: terminal.getSelection() });
        return false;
      }
      // Ctrl+Shift+V: let the browser paste; xterm receives it as a paste event.
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') return false;
      return true;
    });

    terminal.open(container.current);
    terminal.textarea?.setAttribute('aria-label', i18next.t('terminal.inputLabel'));
    terminalRef.current = terminal;
    fitRef.current = fit;

    const input = terminal.onData((data) => {
      void window.kestrel.invoke('terminal:write', { id, data });
    });
    const unsubscribe = subscribeOutput(id, (data) => {
      terminal.write(data);
    });

    let resizeTimer: number | undefined;
    const observer = new ResizeObserver(() => {
      // Hidden terminals have no size; fitting them would break the layout.
      if (!container.current?.offsetParent) return;
      fit.fit();
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        void window.kestrel.invoke('terminal:resize', {
          id,
          cols: Math.max(2, terminal.cols),
          rows: Math.max(1, terminal.rows),
        });
      }, RESIZE_DELAY_MS);
    });
    observer.observe(container.current);

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = xtermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      themeObserver.disconnect();
      unsubscribe();
      input.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!visible) return;
    fitRef.current?.fit();
    terminalRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (exitCode === null) return;
    terminalRef.current?.write(
      `\r\n\x1b[2m${i18next.t('terminal.exited', { code: exitCode })}\x1b[0m\r\n`,
    );
  }, [exitCode]);

  return (
    <div
      ref={container}
      className={styles['instance']}
      hidden={!visible}
      data-terminal={id}
      data-testid={`terminal-${id}`}
    />
  );
}
