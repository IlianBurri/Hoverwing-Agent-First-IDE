import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

const allowedProtocols = /^(https?:|mailto:)/i;

/** Only web links survive; everything else (javascript:, file:, …) is dropped. */
function safeUrl(url: string): string {
  return allowedProtocols.test(url) ? url : '';
}

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(event) => {
        // Links open in the system browser, never inside Kestrel.
        event.preventDefault();
        if (href && /^https?:/i.test(href))
          void window.kestrel.invoke('app:openExternalUrl', { url: href });
      }}
    >
      {children}
    </a>
  ),
  // Remote images would leak data (and the CSP blocks them anyway): show the alt text.
  img: ({ alt }) => <span className={styles['image']}>[{alt ?? 'image'}]</span>,
};

/**
 * Renders agent text as Markdown. Raw HTML is never rendered: agent output
 * is untrusted.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className={styles['root']}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
