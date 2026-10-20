import { useState } from 'react';
import { Check, ClipboardCheck } from 'lucide-react';
import { ABILITIES, ABILITY_LABELS } from '../config/positions';
import type { Workspace } from '../domain/model';
import { Panel, Badge, Empty } from './ui';
export function AssessmentView({
  data,
  onSave,
}: {
  data: Workspace;
  onSave: (data: Workspace) => void;
}) {
  const [playerId, setPlayerId] = useState(data.players[0].id);
  const [tab, setTab] = useState<'skill' | 'teamwork'>('skill');
  const latest = data.assessments.filter((a) => a.playerId === playerId).at(-1);
  const current = data.players.find((p) => p.id === playerId)!;
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
        <button className={tab === 'skill' ? 'active' : ''} onClick={() => setTab('skill')}>
          기능평가
        </button>
        <button className={tab === 'teamwork' ? 'active' : ''} onClick={() => setTab('teamwork')}>
          팀워크 관찰
        </button>
      </div>
      <div className="assessment-grid">
        <Panel title="평가 대상">
          <label>
            선수 선택
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              {data.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {data.teams.find((t) => t.id === p.teamId)?.name}
                </option>
              ))}
            </select>
          </label>
          <div className="assessment-person">
            <span className="avatar large">{String(current.number).padStart(2, '0')}</span>
            <h2>{current.name}</h2>
            <p>{data.teams.find((t) => t.id === current.teamId)?.name}</p>
          </div>
          <div className="callout">
            <ClipboardCheck size={20} />
            <p>
              주루 기능 <b>40%</b> + 실전 <b>60%</b>는 확정입니다.
            </p>
            <p>타격·수비의 기능/실전 비율과 최종 영역 비율은 아직 초안입니다.</p>
          </div>
        </Panel>
        {tab === 'skill' ? (
          <Panel
            title="기능평가 입력"
            eyebrow="SKILL ASSESSMENT"
            action={<Badge tone="neutral">0–100점</Badge>}
          >
            <p className="muted">
              수동 정규화 점수입니다. 빈 항목은 미측정으로 보존합니다. 실측값 자동 환산은 아직
              적용하지 않습니다.
            </p>
            <form
              key={playerId + '-' + latest?.id}
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
                      abilities: Object.fromEntries(
                        ABILITIES.filter((k) => nullable(k) !== null).map((k) => [k, nullable(k)]),
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
                      defaultValue={latest?.abilities[k] ?? ''}
                    />
                  </label>
                ))}
              </div>
              <div className="form-row">
                <label>
                  타격 기능
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
          <Panel title="팀워크 관찰 기록" eyebrow="BEYOND THE SCORE">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                onSave({
                  ...data,
                  teamwork: [
                    ...data.teamwork,
                    {
                      id: crypto.randomUUID(),
                      playerId,
                      gameId: null,
                      recordedAt: new Date().toISOString(),
                      category: String(f.get('category')) as 'communication',
                      score: Number(f.get('score')),
                      note: String(f.get('note')),
                      observer: String(f.get('observer')),
                    },
                  ],
                });
                form.reset();
              }}
            >
              <div className="form-row">
                <label>
                  관찰 영역
                  <select name="category">
                    <option value="communication">의사소통</option>
                    <option value="support">동료 지원</option>
                    <option value="responsibility">책임감</option>
                    <option value="respect">존중</option>
                  </select>
                </label>
                <label>
                  관찰 점수 (임시 척도)
                  <select name="score">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                관찰한 행동
                <textarea
                  name="note"
                  required
                  maxLength={1000}
                  placeholder="예: 실수한 동료를 격려하고 다음 플레이를 안내함"
                />
              </label>
              <label>
                관찰자
                <input name="observer" required />
              </label>
              <button className="primary">관찰 저장</button>
            </form>
            <div className="separated">
              {data.teamwork.filter((o) => o.playerId === playerId).length === 0 ? (
                <Empty>관찰한 장면을 첫 기록으로 남겨 주세요.</Empty>
              ) : (
                data.teamwork
                  .filter((o) => o.playerId === playerId)
                  .reverse()
                  .map((o) => (
                    <div className="observation" key={o.id}>
                      <Badge>{o.score}/5</Badge>
                      <p>{o.note}</p>
                      <small>
                        {o.observer} · {new Date(o.recordedAt).toLocaleDateString('ko-KR')}
                      </small>
                    </div>
                  ))
              )}
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
