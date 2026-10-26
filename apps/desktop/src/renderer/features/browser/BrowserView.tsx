import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bug, RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useBrowserStore } from '../../stores/browser';
import { useOverlayStore } from '../../stores/overlays';
import { navigate } from './actions';
import styles from './BrowserView.module.css';

/** Keeps the native page view exactly over `host`, hidden while overlays are open. */
function usePageBounds(tabId: string, host: React.RefObject<HTMLDivElement | null>) {
  const overlays = useOverlayStore((state) => state.count);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const send = () => {
      const rect = element.getBoundingClientRect();
      const hidden = overlays > 0 || rect.width < 1 || rect.height < 1;
      void window.kestrel.invoke('browser:setBounds', {
        tabId,
        bounds: hidden
          ? null
          : { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      });
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(element);
    // Panels moving (e.g. sidebar resized) change the position, not the size.
    window.addEventListener('resize', send);
    const timer = window.setInterval(send, 500);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', send);
      window.clearInterval(timer);
      void window.kestrel.invoke('browser:setBounds', { tabId, bounds: null });
    };
  }, [tabId, host, overlays]);
}

export function BrowserView({ tabId }: { tabId: string }) {
  const { t } = useTranslation();
  const state = useBrowserStore((store) => store.tabs[tabId]);
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Text being typed; null shows the current page address.
  const [draft, setDraft] = useState<string | null>(null);
  usePageBounds(tabId, host);

  useEffect(() => {
    // A new, empty tab starts with the cursor in the address bar.
    if (state && !state.url) input.current?.focus();
  }, [state]);

  const url = state?.url && state.url !== 'about:blank' ? state.url : '';
  return (
    <div className={styles['root']}>
      <div className={styles['toolbar']}>
        <IconButton
          size="sm"
          icon={ArrowLeft}
          label={t('browser.back')}
          disabled={!state?.canGoBack}
          onClick={() => void window.kestrel.invoke('browser:back', { tabId })}
        />
        <IconButton
          size="sm"
          icon={ArrowRight}
          label={t('browser.forward')}
          disabled={!state?.canGoForward}
          onClick={() => void window.kestrel.invoke('browser:forward', { tabId })}
        />
        {state?.loading ? (
          <IconButton
            size="sm"
            icon={X}
            label={t('browser.stop')}
            onClick={() => void window.kestrel.invoke('browser:stop', { tabId })}
          />
        ) : (
          <IconButton
            size="sm"
            icon={RotateCw}
            label={t('browser.reload')}
            disabled={!url}
            onClick={() => void window.kestrel.invoke('browser:reload', { tabId })}
          />
        )}
        <form
          className={styles['address']}
          onSubmit={(event) => {
            event.preventDefault();
            const text = (draft ?? url).trim();
            if (!text) return;
            void navigate(tabId, text).then((ok) => {
              if (ok) {
                setDraft(null);
                input.current?.blur();
              }
            });
          }}
        >
          <input
            ref={input}
            className={styles['input']}
            aria-label={t('browser.address')}
            placeholder={t('browser.addressPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            value={draft ?? url}
            onFocus={(event) => {
              event.target.select();
            }}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraft(null);
                event.currentTarget.blur();
              }
            }}
          />
        </form>
        <IconButton
          size="sm"
          icon={Bug}
          label={t('browser.devTools')}
          onClick={() => void window.kestrel.invoke('browser:openDevTools', { tabId })}
        />
      </div>
      {state?.error && (
        <div className={styles['error']}>
          <StatusMessage kind="error">
            {t('browser.loadFailed', { error: state.error })}
          </StatusMessage>
        </div>
      )}
      <div
        ref={host}
        className={styles['page']}
        data-browser-page={tabId}
        aria-label={t('browser.page')}
        role="region"
      >
        {!url && <p className={styles['empty']}>{t('browser.emptyHint')}</p>}
      </div>
    </div>
  );
}
