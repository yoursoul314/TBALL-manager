import { useState } from 'react';
import type { TeamworkObservation, Workspace } from '../domain/model';
import { TEAMWORK_LABELS, TEAMWORK_WEIGHTS, type TeamworkCategory } from '../config/recording';
import { teamworkSummary } from '../statistics/teamwork';
import { Badge, Panel } from './ui';
const outcomes = {
  performed: '수행',
  partial: '부분 수행',
  'not-performed': '미수행',
  unobserved: '미관찰',
};
const oldLabels = {
  communication: '의사소통',
  support: '동료 지원',
  responsibility: '책임감',
  respect: '존중',
};
export function TeamworkPanel({
  data,
  playerId,
  onSave,
}: {
  data: Workspace;
  playerId: string;
  onSave: (data: Workspace) => void;
}) {
  const [opportunity, setOpportunity] = useState<'offered' | 'not-offered'>('offered');
  const records = data.teamwork.filter((o) => o.playerId === playerId);
  const legacy = data.legacyTeamwork.filter((o) => o.playerId === playerId);
  return (
    <Panel title="팀워크 관찰 기록" eyebrow="BEYOND THE SCORE">
      <p className="hint">
        기회가 없거나 결과를 보지 못한 경우 미수행으로 계산하지 않습니다. 수행 결과의 점수 환산과
        최종 선발 반영은 TODO입니다.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            ...data,
            teamwork: [
              ...data.teamwork,
              {
                id: crypto.randomUUID(),
                playerId,
                gameId: String(f.get('game')) || null,
                recordedAt: new Date().toISOString(),
                category: String(f.get('category')) as TeamworkCategory,
                opportunity,
                outcome:
                  opportunity === 'not-offered'
                    ? 'unobserved'
                    : (String(f.get('outcome')) as TeamworkObservation['outcome']),
                note: String(f.get('note')),
                observer: String(f.get('observer')),
              },
            ],
          });
        }}
      >
        <label>
          관찰 경기
          <select name="game">
            <option value="">경기 외 관찰</option>
            {data.games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          관찰 영역
          <select name="category">
            {(Object.keys(TEAMWORK_WEIGHTS) as TeamworkCategory[]).map((c) => (
              <option key={c} value={c}>
                {TEAMWORK_LABELS[c]} · {TEAMWORK_WEIGHTS[c]}%
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            평가 기회
            <select
              aria-label="평가 기회"
              value={opportunity}
              onChange={(e) => setOpportunity(e.target.value as typeof opportunity)}
            >
              <option value="offered">기회 있음</option>
              <option value="not-offered">기회 없음</option>
            </select>
          </label>
          <label>
            수행 결과
            <select
              name="outcome"
              aria-label="수행 결과"
              disabled={opportunity === 'not-offered'}
              defaultValue="unobserved"
            >
              {Object.entries(outcomes).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          관찰한 행동
          <textarea name="note" required maxLength={1000} />
        </label>
        <label>
          관찰자 별칭
          <input name="observer" required maxLength={100} />
        </label>
        <button className="primary">관찰 저장</button>
      </form>
      <div className="table-scroll separated">
        <table>
          <thead>
            <tr>
              <th>영역</th>
              <th>기회</th>
              <th>관찰 완료</th>
              <th>수행 / 부분 / 미수행</th>
            </tr>
          </thead>
          <tbody>
            {teamworkSummary(records).domains.map((d) => (
              <tr key={d.category}>
                <td>
                  {TEAMWORK_LABELS[d.category]} {d.weight}%
                </td>
                <td>{d.opportunities}</td>
                <td>{d.observed}</td>
                <td>
                  {d.performed} / {d.partial} / {d.notPerformed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {[...records].reverse().map((o) => (
        <div className="observation" key={o.id}>
          <Badge>{TEAMWORK_LABELS[o.category]}</Badge>
          <p>
            {o.opportunity === 'offered' ? '기회 있음' : '기회 없음'} · {outcomes[o.outcome]} —{' '}
            {o.note}
          </p>
          <small>
            {o.observer} · {new Date(o.recordedAt).toLocaleDateString('ko-KR')}
          </small>
        </div>
      ))}
      <details className="separated">
        <summary>이전 팀워크 기록 · {legacy.length}건 (원본 보존)</summary>
        <p>기존 1~5점 기록은 새 기회·수행 결과로 환산하지 않습니다.</p>
        {legacy.map((o) => (
          <div className="observation" key={o.id}>
            <Badge tone="neutral">
              {oldLabels[o.category]} · {o.score}/5 · 이전 데이터
            </Badge>
            <p>{o.note}</p>
            <small>
              {o.observer} · {o.recordedAt}
            </small>
          </div>
        ))}
      </details>
    </Panel>
  );
}
