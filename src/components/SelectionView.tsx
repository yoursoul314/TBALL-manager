import { useState } from 'react';
import { recommendWaterfall, waterfallCandidates } from '../evaluation/waterfall';
import type { Workspace } from '../domain/model';
import { activeTeams } from '../domain/gameLibrary';
import { defenseEvaluation } from '../evaluation/defense';
import { recommendPositions } from '../evaluation/score';
import { approveLineup } from '../evaluation/manualLineup';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import { ManualLineupEditor } from './ManualLineupEditor';
import { PlayerAvatar } from './PlayerAvatar';
import { Field } from './Field';
import { Panel, Badge, Empty, Modal, fmt } from './ui';
export function SelectionView({
  data,
  onSave,
  onProfile,
  onDirtyChange,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onProfile: (id: string) => void;
  onDirtyChange?: (v: boolean) => void;
}) {
  const [algorithm, setAlgorithm] = useState<'type1' | 'waterfall'>('type1');
  const [team, setTeam] = useState(activeTeams(data)[0]?.id ?? ''),
    [message, setMessage] = useState(''),
    [approving, setApproving] = useState(false),
    [manual, setManual] = useState(false),
    [position, setPosition] = useState<Position>('1B');
  if (!team || !activeTeams(data).some((t) => t.id === team))
    return <Empty>선발할 운영 팀이 없습니다. 선수 & 팀에서 팀을 추가하거나 복원하세요.</Empty>;
  const selection = data.selections.filter((s) => s.teamId === team).at(-1),
    fresh = selection?.sourceRevision === data.revision;
  const generate = () => {
    try {
      const waterfall =
        algorithm === 'waterfall' ? recommendWaterfall(waterfallCandidates(data)) : null;
      const result =
        waterfall ??
        recommendPositions(
          data.players
            .filter((p) => p.active && !p.archivedAt)
            .map((p) => ({ playerId: p.id, abilities: defenseEvaluation(data, p.id).abilities })),
        );
      if (!result)
        throw new Error(
          '10개 포지션을 모두 배정할 수 없습니다. 등록 명단 중 최소 10명의 필요한 기능평가를 입력하세요.',
        );
      onSave({
        ...data,
        selections: [
          ...data.selections,
          {
            id: crypto.randomUUID(),
            teamId: team,
            createdAt: new Date().toISOString(),
            policyVersion: waterfall ? 'fungo-waterfall-v1' : data.policy.version,
            sourceRevision: data.revision + 1,
            assignments: result.assignments,
            method: waterfall ? 'waterfall' : 'automatic',
            ...(waterfall
              ? {
                  waterfall: {
                    version: 'fungo-waterfall-v1' as const,
                    candidateIds: waterfall.candidateIds,
                    feedback: waterfall.feedback,
                  },
                }
              : {}),
            status: 'draft',
            approvedBy: null,
            approvedAt: null,
          },
        ],
      });
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장 실패');
    }
  };
  if (manual)
    return (
      <ManualLineupEditor
        key={team}
        data={data}
        teamId={team}
        initial={selection}
        initialPosition={position}
        onSave={onSave}
        onClose={() => setManual(false)}
        onDirtyChange={onDirtyChange}
      />
    );
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">LINEUP LAB</div>
          <h1>
            최적의 팀을 그리다<span className="title-dot">.</span>
          </h1>
          <p>TYPE1 추천을 검토하거나 감독이 직접 자리를 배치하세요.</p>
        </div>
        <div className="button-row">
          <button onClick={() => setManual(true)}>수동 선수 배치</button>
          <button className="primary" onClick={generate}>
            포지션 시뮬레이션
          </button>
        </div>
      </div>
      <div className="toolbar">
        <select
          aria-label="시뮬레이션 팀"
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setMessage('');
          }}
        >
          {activeTeams(data).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label>
          추천 방식
          <select
            aria-label="추천 방식"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as typeof algorithm)}
          >
            <option value="type1">기존 TYPE1 v2.0 · 9능력</option>
            <option value="waterfall">펑고 5변수 · 워터폴 배정</option>
          </select>
        </label>
        <Badge>TYPE1 v2.0 확정 가중치 보존</Badge>
        <Badge tone="amber">기능평가 기반 시뮬레이션</Badge>
      </div>
      <div className="callout amber">
        {algorithm === 'waterfall'
          ? '새 펑고 공식에 따라 순서대로 배정합니다.'
          : '기존 TYPE1 추천은 입력된 9개 수비 능력의 가중합을 최대화합니다.'}{' '}
        <b>
          최종 선발 알고리즘은 TODO입니다. 추천·수동 배치는 확정 엔트리가 아니며 사용자 승인 전에는
          검토 대기입니다.
        </b>{' '}
        TYPE2는 참고용으로 정의를 기다리고 있습니다.
      </div>
      {algorithm === 'waterfall' && (
        <p className="callout">
          최근 날짜의 펑고 5변수와 새 6단계 타격 B(10점)를 사용합니다. 1B → SS → 3B → CF1 → LF → CF2
          → 2B → RF → 본루수 → P 순서입니다. 내야 적합도 80점 이상 상위 2명은 1B보다 SS·3B에 우선
          배정합니다. P는 기존 TYPE1 기본점수에 희망 가산점을 별도로 더합니다. 필수 점수가 없으면
          빈자리로 남으며 10명이 배치되어야 승인할 수 있습니다.
        </p>
      )}
      {message && (
        <div role="alert" className="alert">
          {message}
        </div>
      )}
      <div className="match-grid">
        <Panel title="포지션을 눌러 수동 편집" action={<Badge>10 POSITIONS</Badge>}>
          <Field
            assignments={selection?.assignments ?? []}
            players={data.players}
            showEmpty
            onPosition={(p) => {
              setPosition(p);
              setManual(true);
            }}
          />
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
              <p>
                {selection.method === 'waterfall'
                  ? '펑고 워터폴 추천'
                  : selection.method === 'manual'
                    ? '감독 수동 배치'
                    : '수비 기능평가 자동 추천'}{' '}
                · {selection.assignments.length}/10명
              </p>
              <div className="assignment-list">
                {[...selection.assignments]
                  .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position))
                  .map((a) => (
                    <button key={a.position} onClick={() => onProfile(a.playerId)}>
                      <span>{a.position}</span>
                      <PlayerAvatar player={data.players.find((p) => p.id === a.playerId)} />
                      <div>
                        <b>{data.players.find((p) => p.id === a.playerId)?.name}</b>
                        <small>{POSITION_LABELS[a.position]}</small>
                      </div>
                      <strong>{a.score === null ? '미측정' : fmt(a.score, 1)}</strong>
                    </button>
                  ))}
              </div>
              {selection.waterfall && (
                <details className="waterfall-feedback" open>
                  <summary>학생에게 설명하는 배정 근거</summary>
                  {selection.waterfall.feedback.map((f) => (
                    <p key={f.position}>
                      <b>{POSITION_LABELS[f.position]}</b> · {f.text}
                    </p>
                  ))}
                  {selection.assignments.length < 10 && (
                    <p role="status">
                      미측정 항목 또는 후보 부족으로 {10 - selection.assignments.length}자리가 비어
                      있습니다. 평가 입력 또는 수동 배치 후 승인하세요.
                    </p>
                  )}
                </details>
              )}
              {!fresh && (
                <div className="callout amber">
                  저장 이후 데이터가 변경되었습니다. 다시 시뮬레이션하거나 수동 배치안을 다시 저장한
                  뒤 승인하세요.
                </div>
              )}
              <button
                className="primary wide"
                disabled={
                  !fresh || selection.assignments.length !== 10 || selection.status === 'approved'
                }
                onClick={() => {
                  setMessage('');
                  setApproving(true);
                }}
              >
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
              시뮬레이션을 실행하거나 수동 선수 배치를 시작하세요. 수동 배치는 점수가 없는 학생도
              가능합니다.
            </Empty>
          )}
        </Panel>
      </div>
      {approving && selection && (
        <Modal title="시범 포지션 배치 승인" onClose={() => setApproving(false)}>
          <p>
            이 승인은 수비 포지션 배치안에만 적용됩니다. 최종 종합 선발은 미확정 정책을 확정한
            이후에 구현합니다.
          </p>
          {message && <p role="alert">{message}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                onSave(
                  approveLineup(
                    data,
                    selection.id,
                    String(f.get('name')),
                    new Date().toISOString(),
                  ),
                );
                setApproving(false);
                setMessage('');
              } catch (err) {
                setMessage(err instanceof Error ? err.message : '승인 실패');
              }
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
