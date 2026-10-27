import { FungoView } from './FungoView';
import { DefenseDayView } from './DefenseDayView';
import { defenseEvaluation } from '../evaluation/defense';
import { DefenseAssessmentPanel } from './DefenseAssessmentPanel';
import { BattingDayView } from './BattingDayView';
import { BattingAssessmentPanel } from './BattingAssessmentPanel';
import { TeamworkPanel } from './TeamworkPanel';
import { useState } from 'react';
import { Check, ClipboardCheck } from 'lucide-react';
import { ABILITIES, ABILITY_LABELS } from '../config/positions';
import type { Workspace } from '../domain/model';
import { activePlayers } from '../domain/gameLibrary';
import { Panel, Badge, Empty } from './ui';
export function AssessmentView({
  data,
  onSave,
  onDirtyChange,
}: {
  data: Workspace;
  onSave: (data: Workspace) => void;
  onDirtyChange?: (v: boolean) => void;
}) {
  const players = activePlayers(data);
  const [selectedId, setPlayerId] = useState(players[0]?.id ?? '');
  const playerId = players.some((p) => p.id === selectedId) ? selectedId : (players[0]?.id ?? '');
  const [tab, setTab] = useState<'batting' | 'defense' | 'fungo' | 'skill' | 'teamwork'>('batting');
  const [defenseMode, setDefenseMode] = useState<'day' | 'individual'>('day');
  const [battingMode, setBattingMode] = useState<'day' | 'individual'>('day');
  const [dirty, setDirty] = useState(false);
  const [warning, setWarning] = useState('');
  const changePlayer = (id: string) => {
    if (dirty) {
      setWarning('저장하지 않은 입력이 있습니다. 기록 저장 또는 입력 되돌리기 후 이동하세요.');
      return;
    }
    setWarning('');
    setPlayerId(id);
  };
  const changeTab = (next: typeof tab) => {
    if (dirty) {
      setWarning('저장하지 않은 입력이 있습니다. 먼저 저장하거나 입력을 되돌리세요.');
      return;
    }
    setTab(next);
  };
  const latest = data.assessments.filter((a) => a.playerId === playerId).at(-1);
  const defense = defenseEvaluation(data, playerId);
  const current = players.find((p) => p.id === playerId);
  if (!current)
    return (
      <Empty>등록된 선수가 없습니다. 선수 & 팀에서 선수를 등록하거나 복원한 뒤 평가하세요.</Empty>
    );
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">GROWTH & ASSESSMENT</div>
          <h1>
            성장을 기록하다<span className="title-dot">.</span>
          </h1>
          <p>기능평가와 팀워크 관찰을 선수의 성장 기록으로 남기세요.</p>
        </div>
        <Badge tone="amber">실측 환산표 TODO</Badge>
      </div>
      <div className="tabs">
        <button className={tab === 'batting' ? 'active' : ''} onClick={() => changeTab('batting')}>
          타격 상세평가
        </button>
        <button className={tab === 'defense' ? 'active' : ''} onClick={() => changeTab('defense')}>
          수비 체크리스트
        </button>
        <button className={tab === 'fungo' ? 'active' : ''} onClick={() => changeTab('fungo')}>
          펑고 5변수 평가
        </button>
        <button className={tab === 'skill' ? 'active' : ''} onClick={() => changeTab('skill')}>
          기능평가
        </button>
        <button
          className={tab === 'teamwork' ? 'active' : ''}
          onClick={() => changeTab('teamwork')}
        >
          팀워크 관찰
        </button>
      </div>
      {tab === 'batting' && (
        <div className="tabs assessment-mode-tabs">
          {(['day', 'individual'] as const).map((mode) => (
            <button
              key={mode}
              className={battingMode === mode ? 'active' : ''}
              onClick={() => {
                if (dirty) {
                  setWarning('저장하지 않은 입력이 있습니다. 먼저 저장하거나 입력을 되돌리세요.');
                  return;
                }
                setBattingMode(mode);
              }}
            >
              {mode === 'day' ? '날짜별 함께 평가' : '개인별 이전 기록'}
            </button>
          ))}
        </div>
      )}
      {tab === 'defense' && (
        <div className="tabs assessment-mode-tabs">
          {(['day', 'individual'] as const).map((mode) => (
            <button
              key={mode}
              className={defenseMode === mode ? 'active' : ''}
              onClick={() => {
                if (dirty) {
                  setWarning('저장하지 않은 수비 기록이 있습니다. 먼저 저장하거나 되돌리세요.');
                  return;
                }
                setDefenseMode(mode);
              }}
            >
              {mode === 'day' ? '수비 날짜별 함께 평가' : '수비 개인별 이전 기록'}
            </button>
          ))}
        </div>
      )}
      {warning &&
        ((tab === 'batting' && battingMode === 'day') ||
          (tab === 'defense' && defenseMode === 'day')) && <p role="alert">{warning}</p>}
      {tab === 'fungo' ? (
        <>
          {warning && <p role="alert">{warning}</p>}
          <FungoView
            data={data}
            onSave={onSave}
            onDirtyChange={(v) => {
              setDirty(v);
              onDirtyChange?.(v);
              if (!v) setWarning('');
            }}
          />
        </>
      ) : tab === 'defense' && defenseMode === 'day' ? (
        <DefenseDayView
          data={data}
          onSave={onSave}
          onDirtyChange={(v) => {
            setDirty(v);
            onDirtyChange?.(v);
            if (!v) setWarning('');
          }}
        />
      ) : tab === 'batting' && battingMode === 'day' ? (
        <BattingDayView
          data={data}
          onSave={onSave}
          onDirtyChange={(v) => {
            setDirty(v);
            onDirtyChange?.(v);
            if (!v) setWarning('');
          }}
        />
      ) : (
        <div className={tab === 'batting' ? 'assessment-batting' : 'assessment-grid'}>
          <Panel title="평가 대상">
            <label>
              선수 선택
              <select
                aria-label="선수 선택"
                value={playerId}
                onChange={(e) => changePlayer(e.target.value)}
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {data.teams.find((t) => t.id === p.teamId)?.name ?? '공통 명단'}
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button
                disabled={players[0].id === playerId}
                onClick={() =>
                  changePlayer(players[players.findIndex((p) => p.id === playerId) - 1].id)
                }
              >
                이전 선수
              </button>
              <button
                disabled={players.at(-1)!.id === playerId}
                onClick={() =>
                  changePlayer(players[players.findIndex((p) => p.id === playerId) + 1].id)
                }
              >
                다음 선수
              </button>
            </div>
            {warning && <p role="alert">{warning}</p>}
            <div className="assessment-person">
              <span className="avatar large">{String(current.number).padStart(2, '0')}</span>
              <h2>{current.name}</h2>
              <p>{data.teams.find((t) => t.id === current.teamId)?.name ?? '공통 명단'}</p>
            </div>
            <div className="callout">
              <ClipboardCheck size={20} />
              <p>
                주루 기능 <b>40%</b> + 실전 <b>60%</b>는 확정입니다.
              </p>
              <p>타격·수비의 기능/실전 비율과 최종 영역 비율은 아직 초안입니다.</p>
            </div>
          </Panel>
          {tab === 'batting' ? (
            <BattingAssessmentPanel
              key={playerId}
              data={data}
              playerId={playerId}
              onSave={onSave}
              onDirtyChange={(v) => {
                setDirty(v);
                onDirtyChange?.(v);
                if (!v) setWarning('');
              }}
            />
          ) : tab === 'defense' ? (
            <DefenseAssessmentPanel
              key={playerId}
              data={data}
              playerId={playerId}
              onSave={onSave}
              onDirtyChange={(v) => {
                setDirty(v);
                onDirtyChange?.(v);
                if (!v) setWarning('');
              }}
            />
          ) : tab === 'skill' ? (
            <Panel
              title="기능평가 입력"
              eyebrow="SKILL ASSESSMENT"
              action={<Badge tone="neutral">0–100점</Badge>}
            >
              <p className="muted">
                수비 9항목 출처:{' '}
                {defense.source === 'checklist'
                  ? '체크리스트 환산 · 관찰 수정 시 자동 갱신'
                  : '기존 수동 평가'}
                . 빈 항목은 미측정입니다. 출처 변경은 수비 체크리스트 탭에서 가능합니다.
              </p>
              <form
                key={playerId + '-' + latest?.id + '-' + data.revision + '-' + defense.source}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const nullable = (k: string) =>
                    String(f.get(k)).trim() === '' ? null : Number(f.get(k));
                  onSave({
                    ...data,
                    assessments: [
                      ...data.assessments,
                      {
                        id: crypto.randomUUID(),
                        playerId,
                        recordedAt: new Date().toISOString(),
                        assessor: String(f.get('assessor')),
                        abilities:
                          defense.source === 'checklist'
                            ? (latest?.abilities ?? {})
                            : Object.fromEntries(
                                ABILITIES.filter((k) => nullable(k) !== null).map((k) => [
                                  k,
                                  nullable(k),
                                ]),
                              ),
                        battingSkill: nullable('batting'),
                        runningSkill: nullable('running'),
                        rawMeasurements: [],
                      },
                    ],
                  });
                }}
              >
                <div className="ability-inputs">
                  {ABILITIES.map((k) => (
                    <label key={k}>
                      <span>
                        <b>{k}</b>
                        {ABILITY_LABELS[k]}
                      </span>
                      <input
                        aria-label={ABILITY_LABELS[k]}
                        name={k}
                        type="number"
                        min="0"
                        max="100"
                        step=".1"
                        placeholder="미측정"
                        readOnly={defense.source === 'checklist'}
                        defaultValue={defense.abilities[k] ?? ''}
                      />
                    </label>
                  ))}
                </div>
                <div className="form-row">
                  <label>
                    이전 수동 타격 기능 (참고)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step=".1"
                      name="batting"
                      placeholder="미측정"
                      defaultValue={latest?.battingSkill ?? ''}
                    />
                  </label>
                  <label>
                    주루 기능
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step=".1"
                      name="running"
                      placeholder="미측정"
                      defaultValue={latest?.runningSkill ?? ''}
                    />
                  </label>
                  <label>
                    평가자
                    <input name="assessor" required placeholder="교사·감독 이름" />
                  </label>
                </div>
                <button className="primary">
                  <Check size={17} />
                  평가 저장
                </button>
              </form>
            </Panel>
          ) : (
            <TeamworkPanel key={playerId} data={data} playerId={playerId} onSave={onSave} />
          )}
        </div>
      )}
    </>
  );
}
