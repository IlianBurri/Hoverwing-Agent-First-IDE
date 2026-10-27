import { useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lspServerConfigSchema } from '@kestrel/shared';
import type { LspServerConfig, LspServerView } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { useLspStore } from '../../stores/lsp';
import { closeModal } from '../../stores/modals';
import { removeLspServer, saveLspServer } from './actions';
import styles from './LspServersDialog.module.css';

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'server'
  );
}

/** Splits at whitespace; arguments with spaces are not supported here. */
const words = (text: string) => text.split(/\s+/).filter(Boolean);

function ServerForm({ server, onDone }: { server: LspServerView | null; onDone: () => void }) {
  const { t } = useTranslation();
  const existing = useLspStore((state) => state.servers);
  const [name, setName] = useState(server?.name ?? '');
  const [commandLine, setCommandLine] = useState(
    server ? [server.command, ...server.args].join(' ') : '',
  );
  const [extensions, setExtensions] = useState(server?.extensions.join(' ') ?? '');
  const ids = { name: useId(), command: useId(), extensions: useId() };

  const id = server?.id ?? slug(name);
  const [command = '', ...args] = words(commandLine);
  const config: LspServerConfig = {
    id,
    name: name.trim(),
    command,
    args,
    extensions: words(extensions.toLowerCase().replace(/[.,]/g, ' ')),
    enabled: server?.enabled ?? true,
  };
  const idTaken = server === null && existing.some((entry) => entry.id === id);
  const valid = lspServerConfigSchema.safeParse(config).success && !idTaken;

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (valid && (await saveLspServer(config))) onDone();
  }

  return (
    <form className={styles['form']} onSubmit={(event) => void submit(event)}>
      <label htmlFor={ids.name}>{t('lsp.name')}</label>
      <input
        id={ids.name}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        required
      />
      <label htmlFor={ids.command}>{t('lsp.commandLine')}</label>
      <div className={styles['field']}>
        <input
          id={ids.command}
          className={styles['mono']}
          value={commandLine}
          onChange={(event) => {
            setCommandLine(event.target.value);
          }}
          placeholder="pyright-langserver --stdio"
          required
        />
        <p className={styles['hint']}>{t('lsp.commandHint')}</p>
      </div>
      <label htmlFor={ids.extensions}>{t('lsp.extensions')}</label>
      <div className={styles['field']}>
        <input
          id={ids.extensions}
          className={styles['mono']}
          value={extensions}
          onChange={(event) => {
            setExtensions(event.target.value);
          }}
          placeholder="py pyi"
          required
        />
        <p className={styles['hint']}>{t('lsp.extensionsHint')}</p>
      </div>
      <div className={styles['actions']}>
        <Button variant="ghost" onClick={onDone}>
          {t('dialog.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {t('lsp.save')}
        </Button>
      </div>
    </form>
  );
}

/** Language servers: enable, edit command lines and file types, add your own. */
export function LspServersDialog() {
  const { t } = useTranslation();
  const servers = useLspStore((state) => state.servers);
  const [editing, setEditing] = useState<LspServerView | 'new' | null>(null);

  return (
    <Modal title={t('lsp.servers')} onClose={closeModal} size="lg">
      <p className={styles['intro']}>{t('lsp.intro')}</p>
      {editing !== null ? (
        <ServerForm
          key={editing === 'new' ? 'new' : editing.id}
          server={editing === 'new' ? null : editing}
          onDone={() => {
            setEditing(null);
          }}
        />
      ) : (
        <>
          <ul className={styles['list']}>
            {servers.map((server) => (
              <li key={server.id} className={styles['row']}>
                <label className={styles['toggle']}>
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    onChange={(event) => {
                      void saveLspServer({
                        id: server.id,
                        name: server.name,
                        command: server.command,
                        args: server.args,
                        extensions: server.extensions,
                        enabled: event.target.checked,
                      });
                    }}
                  />
                  <span className={styles['name']}>{server.name}</span>
                </label>
                <span className={styles['extensions']}>
                  {server.extensions.map((extension) => `.${extension}`).join(' ')}
                </span>
                <code className={styles['command']}>
                  {[server.command, ...server.args].join(' ')}
                </code>
                <span className={styles['approval']}>
                  {server.approved ? t('lsp.approved') : t('lsp.notApproved')}
                </span>
                <div className={styles['rowActions']}>
                  <IconButton
                    size="sm"
                    icon={Pencil}
                    label={t('lsp.editName', { name: server.name })}
                    onClick={() => {
                      setEditing(server);
                    }}
                  />
                  <IconButton
                    size="sm"
                    icon={server.builtin ? RotateCcw : Trash2}
                    label={
                      server.builtin
                        ? t('lsp.resetName', { name: server.name })
                        : t('lsp.deleteName', { name: server.name })
                    }
                    onClick={() => void removeLspServer(server.id, server.builtin, server.name)}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className={styles['footer']}>
            <Button
              onClick={() => {
                setEditing('new');
              }}
            >
              <Plus size={14} aria-hidden="true" />
              {t('lsp.add')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
