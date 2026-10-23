import { useEffect, useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { permissionKindSchema } from '@kestrel/shared';
import type { PermissionKind, PermissionRule } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { notifyError } from '../../lib/errors';
import { closeModal } from '../../stores/modals';
import { useWorkspaceStore } from '../../stores/workspace';
import { kindIcons, kindKey } from './kinds';
import styles from './RulesDialog.module.css';

/** Lists stored rules and lets the user add or delete them. */
export function RulesDialog() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  const [rules, setRules] = useState<readonly PermissionRule[]>([]);
  const [kind, setKind] = useState<PermissionKind>('file.write');
  const [pattern, setPattern] = useState('src/**');
  const [level, setLevel] = useState<'allow' | 'deny'>('allow');
  const [scope, setScope] = useState<'project' | 'global'>(workspace ? 'project' : 'global');
  const ids = { kind: useId(), pattern: useId(), level: useId(), scope: useId() };

  async function reload() {
    const result = await window.kestrel.invoke('permissions:listRules');
    if (result.ok) setRules(result.data);
  }

  useEffect(() => {
    let active = true;
    void window.kestrel.invoke('permissions:listRules').then((result) => {
      if (active && result.ok) setRules(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  async function onAdd(event: SubmitEvent) {
    event.preventDefault();
    const result = await window.kestrel.invoke('permissions:addRule', {
      kind,
      pattern: pattern.trim() || '**',
      level,
      scope,
    });
    if (!result.ok) notifyError(t('permissions.rules.add'), result.error);
    await reload();
  }

  async function onDelete(id: string) {
    const result = await window.kestrel.invoke('permissions:deleteRule', { id });
    if (!result.ok) notifyError(t('permissions.rules.delete'), result.error);
    await reload();
  }

  return (
    <Modal title={t('permissions.rules.title')} onClose={closeModal} size="lg">
      <p className={styles['intro']}>{t('permissions.rules.intro')}</p>

      {rules.length === 0 ? (
        <p className={styles['empty']}>{t('permissions.rules.empty')}</p>
      ) : (
        <table className={styles['table']}>
          <thead>
            <tr>
              <th scope="col">{t('permissions.rules.kind')}</th>
              <th scope="col">{t('permissions.rules.pattern')}</th>
              <th scope="col">{t('permissions.rules.level')}</th>
              <th scope="col">{t('permissions.rules.scope')}</th>
              <th scope="col">
                <span className="visually-hidden">{t('permissions.rules.delete')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const Icon = kindIcons[rule.kind];
              return (
                <tr key={rule.id}>
                  <td>
                    <span className={styles['kind']}>
                      <Icon size={14} aria-hidden="true" />
                      {t(`permissions.kindName.${kindKey(rule.kind)}`)}
                    </span>
                  </td>
                  <td>
                    <code>{rule.pattern}</code>
                  </td>
                  <td className={rule.level === 'allow' ? styles['allow'] : styles['deny']}>
                    {t(`permissions.level.${rule.level}`)}
                  </td>
                  <td>{t(`permissions.scope.${rule.scope}`)}</td>
                  <td>
                    <IconButton
                      size="sm"
                      icon={Trash2}
                      label={t('permissions.rules.deleteRule', { pattern: rule.pattern })}
                      onClick={() => void onDelete(rule.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form className={styles['form']} onSubmit={(event) => void onAdd(event)}>
        <h3 className={styles['formTitle']}>{t('permissions.rules.add')}</h3>
        <label htmlFor={ids.kind}>{t('permissions.rules.kind')}</label>
        <select
          id={ids.kind}
          value={kind}
          onChange={(event) => {
            setKind(permissionKindSchema.parse(event.target.value));
          }}
        >
          {permissionKindSchema.options.map((option) => (
            <option key={option} value={option}>
              {t(`permissions.kindName.${kindKey(option)}`)}
            </option>
          ))}
        </select>
        <label htmlFor={ids.pattern}>{t('permissions.rules.pattern')}</label>
        <input
          id={ids.pattern}
          value={pattern}
          spellCheck={false}
          placeholder="src/**"
          onChange={(event) => {
            setPattern(event.target.value);
          }}
        />
        <label htmlFor={ids.level}>{t('permissions.rules.level')}</label>
        <select
          id={ids.level}
          value={level}
          onChange={(event) => {
            setLevel(event.target.value === 'deny' ? 'deny' : 'allow');
          }}
        >
          <option value="allow">{t('permissions.level.allow')}</option>
          <option value="deny">{t('permissions.level.deny')}</option>
        </select>
        <label htmlFor={ids.scope}>{t('permissions.rules.scope')}</label>
        <select
          id={ids.scope}
          value={scope}
          onChange={(event) => {
            setScope(event.target.value === 'global' ? 'global' : 'project');
          }}
        >
          <option value="project" disabled={!workspace}>
            {t('permissions.scope.project')}
          </option>
          <option value="global">{t('permissions.scope.global')}</option>
        </select>
        <p className={styles['hint']}>{t('permissions.rules.patternHint')}</p>
        <div className={styles['actions']}>
          <Button type="submit" variant="primary">
            {t('permissions.rules.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
