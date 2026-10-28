import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Workspace } from '../domain/model';
import { registerAssessor, setAssessorArchived } from '../assessment/management';
import { Modal } from './ui';
const Context = createContext<{ data: Workspace; onSave: (d: Workspace) => void } | null>(null);
export function AssessmentProvider({
  data,
  onSave,
  children,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  children: ReactNode;
}) {
  return <Context.Provider value={{ data, onSave }}>{children}</Context.Provider>;
}
export function AssessorManager() {
  const ctx = useContext(Context),
    [name, setName] = useState(''),
    [error, setError] = useState('');
  if (!ctx) return null;
  const run = (fn: () => Workspace) => {
    try {
      ctx.onSave(fn());
      setError('');
      return true;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };
  return (
    <section className="assessor-manager" aria-label="평가자 관리">
      <p>
        이름 또는 별칭을 한 번 등록하면 모든 평가에서 터치로 선택합니다. 사용 중지는 과거 기록의
        평가자 이름을 바꾸지 않습니다.
      </p>
      <div className="form-row">
        <label>
          등록할 평가자
          <input
            aria-label="등록할 평가자"
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (
              run(() =>
                registerAssessor(ctx.data, name, crypto.randomUUID(), new Date().toISOString()),
              )
            )
              setName('');
          }}
        >
          평가자 등록 저장
        </button>
      </div>
      <div className="assessor-list">
        {ctx.data.assessmentManagement.assessors.map((a) => (
          <div key={a.id}>
            <b>{a.name}</b>
            <button
              type="button"
              onClick={() =>
                run(() =>
                  setAssessorArchived(ctx.data, a.id, !a.archivedAt, new Date().toISOString()),
                )
              }
            >
              {a.name} {a.archivedAt ? '사용 복원' : '사용 중지'}
            </button>
          </div>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function AssessorPicker({
  label,
  name,
  value,
  defaultValue = '',
  onChange,
  disabled = false,
}: {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const ctx = useContext(Context),
    [local, setLocal] = useState(defaultValue),
    [open, setOpen] = useState(false);
  const selected = value ?? local,
    rows = ctx?.data.assessmentManagement.assessors.filter((a) => !a.archivedAt) ?? [];
  const choices = [
    ...rows.map((a) => a.name),
    ...(selected && !rows.some((a) => a.name === selected) ? [selected] : []),
  ];
  const choose = (v: string) => {
    setLocal(v);
    onChange?.(v);
  };
  return (
    <div className="assessor-picker" role="group" aria-label={label}>
      <span>{label}</span>
      <input type="hidden" name={name} value={selected} />
      <div className="assessor-buttons">
        {choices.map((n) => (
          <button
            type="button"
            key={n}
            disabled={disabled}
            aria-pressed={selected === n}
            onClick={() => choose(n)}
          >
            {selected === n ? '✓ ' : ''}
            {n}
          </button>
        ))}
        <button type="button" disabled={disabled || !ctx} onClick={() => setOpen(true)}>
          평가자 등록·관리
        </button>
      </div>
      {!selected && <small>등록한 평가자를 선택하세요.</small>}
      {open && (
        <Modal title="평가자 등록·관리" onClose={() => setOpen(false)}>
          <AssessorManager />
          <button type="button" onClick={() => setOpen(false)}>
            평가자 선택으로
          </button>
        </Modal>
      )}
    </div>
  );
}
