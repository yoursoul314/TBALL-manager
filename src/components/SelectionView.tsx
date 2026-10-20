import { useState } from 'react';
import { WandSparkles, Check } from 'lucide-react';
import type { Workspace } from '../domain/model';
import { recommendPositions } from '../evaluation/score';
import { POSITION_LABELS, POSITIONS } from '../config/positions';
import { Panel, Badge, Empty, Modal, fmt } from './ui';
import { Field } from './Field';
export function SelectionView({
  data,
  onSave,
  onProfile,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onProfile: (id: string) => void;
}) {
  const [team, setTeam] = useState(data.teams[0].id);
  const [message, setMessage] = useState('');
  const [approving, setApproving] = useState(false);
  const selection = data.selections.filter((s) => s.teamId === team).at(-1);
  const fresh = selection?.sourceRevision === data.revision;
  const generate = () => {
    const candidates = data.players
      .filter((p) => p.teamId === team && p.active)
      .map((p) => ({
        playerId: p.id,
        abilities: data.assessments.filter((a) => a.playerId === p.id).at(-1)?.abilities || {},
      }));
    const result = recommendPositions(candidates);
    if (!result) {
      setMessage(
        '10개 포지션을 모두 배정할 수 없습니다. 최소 10명의 필요한 기능평가를 입력하세요.',
      );
      return;
    }
    onSave({
      ...data,
      selections: [
        ...data.selections,
        {
          id: crypto.randomUUID(),
          teamId: team,
          createdAt: new Date().toISOString(),
          policyVersion: data.policy.version,
          sourceRevision: data.revision + 1,
          assignments: result.assignments,
          status: 'draft',
          approvedBy: null,
          approvedAt: null,
        },
      ],
    });
    setMessage('');
  };
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">LINEUP LAB</div>
          <h1>
            최적의 팀을 그리다<span className="title-dot">.</span>
          </h1>
          <p>선수마다 다른 강점, TYPE1의 열 자리에 가장 알맞게.</p>
        </div>
        <button className="primary" onClick={generate}>
          <WandSparkles size={18} />
          포지션 시뮬레이션
        </button>
      </div>
      <div className="toolbar">
        <select aria-label="시뮬레이션 팀" value={team} onChange={(e) => setTeam(e.target.value)}>
          {data.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Badge>TYPE1 v2.0 확정 가중치</Badge>
        <Badge tone="amber">기능평가 기반 시뮬레이션</Badge>
      </div>
      <div className="callout amber">
        현재 추천은 입력된 9개 수비 능력의 가중합을 최대화합니다. 실전 환산과 최종 영역 비율이
        미확정이므로{' '}
        <b>
          최종 선발 알고리즘은 TODO입니다. 추천은 확정 엔트리가 아니며, 사용자 승인 전에는 검토 대기
          상태입니다.
        </b>{' '}
        TYPE2는 참고용으로 정의를 기다리고 있습니다.
      </div>
      {message && (
        <div role="alert" className="alert">
          {message}
        </div>
      )}
      <div className="match-grid">
        <Panel title="추천 포메이션" action={<Badge tone="neutral">10 POSITIONS</Badge>}>
          <Field assignments={selection?.assignments} players={data.players} onPlayer={onProfile} />
        </Panel>
        <Panel
          title="포지션 배치안"
          action={
            selection && (
              <Badge tone={selection.status === 'approved' ? 'green' : 'neutral'}>
                {selection.status === 'approved' ? '감독 승인 (시범 배치)' : '검토 대기'}
              </Badge>
            )
          }
        >
          {selection ? (
            <>
              <div className="assignment-list">
                {[...selection.assignments]
                  .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position))
                  .map((a) => (
                    <button key={a.position} onClick={() => onProfile(a.playerId)}>
                      <span>{a.position}</span>
                      <div>
                        <b>{data.players.find((p) => p.id === a.playerId)?.name}</b>
                        <small>{POSITION_LABELS[a.position]}</small>
                      </div>
                      <strong>{fmt(a.score, 1)}</strong>
                    </button>
                  ))}
              </div>
              {!fresh && (
                <div className="callout amber">
                  저장 이후 데이터가 변경되었습니다. 다시 시뮬레이션한 뒤 승인하세요.
                </div>
              )}
              <button
                className="primary wide"
                disabled={!fresh || selection.status === 'approved'}
                onClick={() => setApproving(true)}
              >
                <Check size={17} />
                시범 배치 감독 승인
              </button>
              {selection.approvedBy && (
                <p className="hint">
                  승인자 {selection.approvedBy} ·{' '}
                  {selection.approvedAt && new Date(selection.approvedAt).toLocaleString('ko-KR')}
                </p>
              )}
            </>
          ) : (
            <Empty>
              팀을 선택하고 시뮬레이션을 실행하세요.
              <br />
              선수 중복 없이 포지션 적합도 합계를 최대화합니다.
            </Empty>
          )}
        </Panel>
      </div>
      {approving && selection && (
        <Modal title="시범 포지션 배치 승인" onClose={() => setApproving(false)}>
          <p>
            이 승인은 위의 수비 포지션 배치안에만 적용됩니다. 최종 종합 선발은 미확정 정책을 확정한
            이후에 구현합니다.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onSave({
                ...data,
                selections: data.selections.map((s) =>
                  s.id === selection.id
                    ? {
                        ...s,
                        status: 'approved',
                        approvedBy: String(f.get('name')),
                        approvedAt: new Date().toISOString(),
                        sourceRevision: data.revision + 1,
                      }
                    : s,
                ),
              });
              setApproving(false);
            }}
          >
            <label>
              승인 감독
              <input required name="name" maxLength={100} />
            </label>
            <button className="primary wide">배치안 승인 저장</button>
          </form>
        </Modal>
      )}
    </>
  );
}
