import { useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Check, Sparkles, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { describeChanges } from '@kestrel/shared';
import type { LayoutChange } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { StatusMessage } from '../../components/StatusMessage';
import { errorMessage } from '../../lib/errors';
import { closeModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { useCommandStore } from '../commands';
import { showModelsView } from '../providers';
import {
  applyAiLayout,
  currentLayoutState,
  proposeLayout,
  undoAiLayout,
  useLayoutAiStore,
} from './ai';
import type { Proposal } from './ai';
import styles from './LayoutAiDialog.module.css';

const examples = ['writing', 'review', 'cockpit', 'minimal'] as const;

function describe(change: LayoutChange, t: TFunction, title: (id: string) => string): string {
  switch (change.kind) {
    case 'side':
      return t('layout.ai.change.side', {
        panel: t(change.panel === 'sidebar' ? 'layout.sidebar' : 'layout.agentPanel'),
        side: t(change.side === 'left' ? 'layout.left' : 'layout.right'),
      });
    case 'panel':
      return t(change.open ? 'layout.ai.change.panelOpen' : 'layout.ai.change.panelClosed', {
        panel: t(`layout.ai.panel.${change.panel}`),
      });
    case 'barVisible':
      return t(change.visible ? 'layout.ai.change.barShown' : 'layout.ai.change.barHidden', {
        bar: t(change.bar === 'activityBar' ? 'layout.activityBar' : 'layout.statusBar'),
      });
    case 'activityItem':
      return t(change.shown ? 'layout.ai.change.itemShown' : 'layout.ai.change.itemHidden', {
        item: t(`activity.${change.item}` as 'activity.files'),
        place: t('layout.activityBar'),
      });
    case 'bottomTab':
      return t(change.shown ? 'layout.ai.change.itemShown' : 'layout.ai.change.itemHidden', {
        item: t(`bottom.${change.item}` as 'bottom.terminal'),
        place: t('layout.bottomTabs'),
      });
    case 'statusItem':
      return t(change.shown ? 'layout.ai.change.itemShown' : 'layout.ai.change.itemHidden', {
        item: t(`layout.status.${change.item}`),
        place: t('layout.statusBar'),
      });
    case 'order':
      return t('layout.ai.change.order', {
        list: t(change.list === 'activityBar' ? 'layout.activityBar' : 'layout.bottomTabs'),
      });
    case 'toolbarAdd':
      return t('layout.ai.change.toolbarAdd', { name: title(change.command) });
    case 'toolbarRemove':
      return t('layout.ai.change.toolbarRemove', { name: title(change.command) });
    case 'toolbarOrder':
      return t('layout.ai.change.toolbarOrder');
    case 'view':
      return t(
        change.area === 'sidebar' ? 'layout.ai.change.sidebarView' : 'layout.ai.change.bottomView',
        {
          view: t(
            (change.area === 'sidebar'
              ? `activity.${change.view}`
              : `bottom.${change.view}`) as 'activity.files',
          ),
        },
      );
  }
}

/** "Customize layout with AI": wish → checked proposal → preview → apply (undoable). */
export function LayoutAiDialog() {
  const { t } = useTranslation();
  const chatModel = useSettingsStore((state) => state.settings.chatModel);
  const commands = useCommandStore((state) => state.commands);
  const previous = useLayoutAiStore((state) => state.previous);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applied, setApplied] = useState(false);
  const inputId = useId();
  const title = (id: string) => commands.get(id)?.title() ?? id;

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setApplied(false);
    setProposal(null);
    setProposal(await proposeLayout(text.trim()));
    setBusy(false);
  }

  const changes =
    proposal?.ok === true ? describeChanges(currentLayoutState(), proposal.layout) : [];

  return (
    <Modal title={t('layout.ai.title')} onClose={closeModal} size="lg">
      {!chatModel ? (
        <div className={styles['stack']}>
          <StatusMessage kind="info">{t('layout.ai.noModel')}</StatusMessage>
          <Button
            onClick={() => {
              closeModal();
              showModelsView();
            }}
          >
            {t('layout.ai.openModels')}
          </Button>
        </div>
      ) : (
        <div className={styles['stack']}>
          <form className={styles['stack']} onSubmit={(event) => void submit(event)}>
            <label htmlFor={inputId} className={styles['label']}>
              {t('layout.ai.wish')}
            </label>
            <textarea
              id={inputId}
              className={styles['input']}
              rows={3}
              value={text}
              placeholder={t('layout.ai.placeholder')}
              disabled={busy}
              onChange={(event) => {
                setText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <div className={styles['examples']} aria-label={t('layout.ai.examples')}>
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  className={styles['chip']}
                  disabled={busy}
                  onClick={() => {
                    setText(t(`layout.ai.example.${example}`));
                  }}
                >
                  {t(`layout.ai.exampleLabel.${example}`)}
                </button>
              ))}
            </div>
            <div className={styles['actions']}>
              <span className={styles['muted']}>
                {t('layout.ai.privacy', { model: chatModel.model })}
              </span>
              <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
                <Sparkles size={14} aria-hidden="true" />
                {busy ? t('layout.ai.thinking') : t('layout.ai.propose')}
              </Button>
            </div>
          </form>

          {proposal?.ok === false && (
            <StatusMessage kind="error">{errorMessage(proposal.error)}</StatusMessage>
          )}

          {proposal?.ok === true && !applied && (
            <section className={styles['preview']} aria-label={t('layout.ai.preview')}>
              <h3 className={styles['heading']}>
                {t('layout.ai.previewBy', { model: proposal.model })}
              </h3>
              {proposal.explanation && (
                <p className={styles['explanation']}>{proposal.explanation}</p>
              )}
              {changes.length === 0 ? (
                <StatusMessage kind="info">{t('layout.ai.noChanges')}</StatusMessage>
              ) : (
                <ul className={styles['changes']}>
                  {changes.map((change, index) => (
                    <li key={String(index)}>{describe(change, t, title)}</li>
                  ))}
                </ul>
              )}
              <div className={styles['actions']}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setProposal(null);
                  }}
                >
                  {t('layout.ai.discard')}
                </Button>
                <Button
                  variant="primary"
                  disabled={changes.length === 0}
                  onClick={() => {
                    void applyAiLayout(proposal.layout).then(() => {
                      setApplied(true);
                    });
                  }}
                >
                  <Check size={14} aria-hidden="true" />
                  {t('layout.ai.apply')}
                </Button>
              </div>
            </section>
          )}

          {applied && (
            <div className={styles['actions']}>
              <StatusMessage kind="success">{t('layout.ai.applied')}</StatusMessage>
              {previous && (
                <Button
                  onClick={() => {
                    void undoAiLayout().then(() => {
                      setApplied(false);
                      setProposal(null);
                    });
                  }}
                >
                  <Undo2 size={14} aria-hidden="true" />
                  {t('layout.ai.undo')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
