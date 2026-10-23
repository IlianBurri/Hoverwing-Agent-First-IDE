import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { i18next } from '../../i18n';
import { subscribeStream } from '../../stores/docker';
import { xtermTheme } from '../terminal';
import styles from './DockerOutput.module.css';

/** Read-only xterm view of a log or build stream (keeps colors). */
export function OutputInstance({ streamId, visible }: { streamId: string; visible: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const terminal = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
      fontSize: 13,
      lineHeight: 1.2,
      disableStdin: true,
      cursorInactiveStyle: 'none',
      scrollback: 10_000,
      theme: xtermTheme(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    terminal.textarea?.setAttribute('aria-label', i18next.t('docker.outputLabel'));
    fitRef.current = fit;
    const unsubscribe = subscribeStream(streamId, (data) => {
      terminal.write(data);
    });
    const observer = new ResizeObserver(() => {
      if (container.current?.offsetParent) fit.fit();
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
      observer.disconnect();
      themeObserver.disconnect();
      unsubscribe();
      terminal.dispose();
    };
  }, [streamId]);

  useEffect(() => {
    if (visible) fitRef.current?.fit();
  }, [visible]);

  return (
    <div
      ref={container}
      className={styles['instance']}
      hidden={!visible}
      data-docker-output={streamId}
    />
  );
}
