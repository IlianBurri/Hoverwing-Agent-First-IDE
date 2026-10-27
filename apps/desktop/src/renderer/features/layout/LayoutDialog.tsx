import { useId } from 'react';
import {
  ArrowDown,
  ArrowUp,
  LayoutTemplate,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bottomViews, fullOrder, sidebarViews, statusItems } from '@kestrel/shared';
import type { PanelSide, Workbench } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { SegmentedControl } from '../../components/SegmentedControl';
import { closeModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import {
  allProfiles,
  applyProfile,
  deleteProfile,
  isBuiltinProfile,
  openLayoutAiDialog,
  resetLayout,
  saveCurrentAsProfile,
  updateWorkbench,
} from './actions';
import styles from './LayoutDialog.module.css';

interface OrderedChecklistProps<T extends string> {
  label: string;
  all: readonly T[];
  order: readonly T[];
  hidden: readonly T[];
  itemLabel: (item: T) => string;
  /** At least this many entries must stay visible. */
  minVisible?: number;
  onChange: (next: { order: T[]; hidden: T[] }) => void;
}

/** Entries with a "show" checkbox and buttons to move them up or down. */
function OrderedChecklist<T extends string>({
  label,
  all,
  order,
  hidden,
  itemLabel,
  minVisible = 0,
  onChange,
}: OrderedChecklistProps<T>) {
  const { t } = useTranslation();
  const items = fullOrder(all, order);
  const visibleCount = items.filter((item) => !hidden.includes(item)).length;
  const move = (index: number, step: -1 | 1) => {
    const next = [...items];
    const target = index + step;
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;
    onChange({ order: next, hidden: [...hidden] });
  };
  return (
    <ol className={styles['list']} aria-label={label}>
      {items.map((item, index) => {
        const shown = !hidden.includes(item);
        return (
          <li key={item} className={styles['row']}>
            <label className={styles['check']}>
              <input
                type="checkbox"
                checked={shown}
                disabled={shown && visibleCount <= minVisible}
                onChange={() => {
                  onChange({
                    order: items,
                    hidden: shown ? [...hidden, item] : hidden.filter((entry) => entry !== item),
                  });
                }}
              />
              {itemLabel(item)}
            </label>
            <IconButton
              size="sm"
              icon={ArrowUp}
              label={t('layout.moveUp', { name: itemLabel(item) })}
              disabled={index === 0}
              onClick={() => {
                move(index, -1);
              }}
            />
            <IconButton
              size="sm"
              icon={ArrowDown}
              label={t('layout.moveDown', { name: itemLabel(item) })}
              disabled={index === items.length - 1}
              onClick={() => {
                move(index, 1);
              }}
            />
          </li>
        );
      })}
    </ol>
  );
}

/** Arrange the workbench: sides, bars, tabs and saved layouts. */
export function LayoutDialog() {
  const { t } = useTranslation();
  const workbench = useSettingsStore((state) => state.settings.workbench);
  const saved = useSettingsStore((state) => state.settings.layoutProfiles);
  const ids = {
    profiles: useId(),
    sides: useId(),
    activity: useId(),
    tabs: useId(),
    status: useId(),
  };
  const set = (patch: Partial<Workbench>) => {
    updateWorkbench((current) => ({ ...current, ...patch }));
  };
  const sideOptions: { value: PanelSide; label: string }[] = [
    { value: 'left', label: t('layout.left') },
    { value: 'right', label: t('layout.right') },
  ];

  return (
    <Modal title={t('layout.dialogTitle')} onClose={closeModal} size="lg">
      <div className={styles['root']}>
        <section aria-labelledby={ids.profiles} className={styles['section']}>
          <h3 id={ids.profiles} className={styles['heading']}>
            {t('layout.profiles')}
          </h3>
          <ul className={styles['profiles']}>
            {allProfiles(saved).map((profile) => (
              <li key={profile.id} className={styles['row']}>
                <LayoutTemplate size={14} aria-hidden="true" />
                <span className={styles['name']}>{profile.name}</span>
                <Button onClick={() => void applyProfile(profile)}>{t('layout.apply')}</Button>
                {!isBuiltinProfile(profile.id) && (
                  <IconButton
                    size="sm"
                    icon={Trash2}
                    label={t('layout.deleteProfileName', { name: profile.name })}
                    onClick={() => void deleteProfile(profile)}
                  />
                )}
              </li>
            ))}
          </ul>
          <div className={styles['actions']}>
            <Button onClick={() => void saveCurrentAsProfile()}>
              <Save size={14} aria-hidden="true" />
              {t('layout.saveProfile')}
            </Button>
            <Button onClick={openLayoutAiDialog}>
              <Sparkles size={14} aria-hidden="true" />
              {t('layout.ai.command')}
            </Button>
            <Button variant="ghost" onClick={() => void resetLayout()}>
              <RotateCcw size={14} aria-hidden="true" />
              {t('layout.reset')}
            </Button>
          </div>
        </section>

        <section aria-labelledby={ids.sides} className={styles['section']}>
          <h3 id={ids.sides} className={styles['heading']}>
            {t('layout.sides')}
          </h3>
          <div className={styles['sideRow']}>
            <span>{t('layout.sidebar')}</span>
            <SegmentedControl
              label={t('layout.sidebar')}
              options={sideOptions}
              value={workbench.sidebarSide}
              onChange={(sidebarSide) => {
                set({ sidebarSide });
              }}
            />
          </div>
          <div className={styles['sideRow']}>
            <span>{t('layout.agentPanel')}</span>
            <SegmentedControl
              label={t('layout.agentPanel')}
              options={sideOptions}
              value={workbench.agentSide}
              onChange={(agentSide) => {
                set({ agentSide });
              }}
            />
          </div>
        </section>

        <section aria-labelledby={ids.activity} className={styles['section']}>
          <h3 id={ids.activity} className={styles['heading']}>
            {t('layout.activityBar')}
          </h3>
          <label className={styles['check']}>
            <input
              type="checkbox"
              checked={workbench.activityBar.visible}
              onChange={(event) => {
                set({ activityBar: { ...workbench.activityBar, visible: event.target.checked } });
              }}
            />
            {t('layout.showActivityBar')}
          </label>
          <OrderedChecklist
            label={t('layout.activityBar')}
            all={sidebarViews}
            order={workbench.activityBar.order}
            hidden={workbench.activityBar.hidden}
            itemLabel={(view) => t(`activity.${view}`)}
            onChange={(next) => {
              set({ activityBar: { ...workbench.activityBar, ...next } });
            }}
          />
        </section>

        <section aria-labelledby={ids.tabs} className={styles['section']}>
          <h3 id={ids.tabs} className={styles['heading']}>
            {t('layout.bottomTabs')}
          </h3>
          <OrderedChecklist
            label={t('layout.bottomTabs')}
            all={bottomViews}
            order={workbench.bottomTabs.order}
            hidden={workbench.bottomTabs.hidden}
            itemLabel={(view) => t(`bottom.${view}`)}
            minVisible={1}
            onChange={(next) => {
              set({ bottomTabs: next });
            }}
          />
        </section>

        <section aria-labelledby={ids.status} className={styles['section']}>
          <h3 id={ids.status} className={styles['heading']}>
            {t('layout.statusBar')}
          </h3>
          <label className={styles['check']}>
            <input
              type="checkbox"
              checked={workbench.statusBar.visible}
              onChange={(event) => {
                set({ statusBar: { ...workbench.statusBar, visible: event.target.checked } });
              }}
            />
            {t('layout.showStatusBar')}
          </label>
          <ul className={styles['list']} aria-label={t('layout.statusBar')}>
            {statusItems.map((item) => {
              const shown = !workbench.statusBar.hidden.includes(item);
              return (
                <li key={item} className={styles['row']}>
                  <label className={styles['check']}>
                    <input
                      type="checkbox"
                      checked={shown}
                      disabled={!workbench.statusBar.visible}
                      onChange={() => {
                        set({
                          statusBar: {
                            ...workbench.statusBar,
                            hidden: shown
                              ? [...workbench.statusBar.hidden, item]
                              : workbench.statusBar.hidden.filter((entry) => entry !== item),
                          },
                        });
                      }}
                    />
                    {t(`layout.status.${item}`)}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className={styles['hint']}>{t('layout.statusHint')}</p>
        </section>
      </div>
    </Modal>
  );
}
