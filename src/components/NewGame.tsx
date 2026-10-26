import { useState, useRef } from 'react';
import type { EntryStatus, Game, Side, Workspace } from '../domain/model';
import { localDate, gradeLabel, ENTRY_LABELS, validateEntry } from '../domain/roster';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import { recommendPositions, positionScore } from '../evaluation/score';
import { RULES_VERSION } from '../config/rules';
import { PlayerAvatar } from './PlayerAvatar';
import { Modal } from './ui';
interface Draft {
  status: Record<string, EntryStatus>;
  lineup: string[];
  defense: Partial<Record<Position, string>>;
}
export function NewGame({
  data,
  onCreate,
  onClose,
}: {
  data: Workspace;
  onCreate: (g: Game) => boolean | void;
  onClose: () => void;
}) {
  const candidatesRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<HTMLDetailsElement>(null);
  const approvalRef = useRef<HTMLDivElement>(null);
  const [teams, setTeams] = useState({
    away: data.teams[0]?.id ?? '',
    home: data.teams[1]?.id ?? '',
  });
  const empty = (teamId: string): Draft => ({
    status: Object.fromEntries(
      data.players
        .filter((p) => p.teamId === teamId)
        .map((p) => [p.id, p.active ? 'not-playing' : 'unavailable']),
    ),
    lineup: [],
    defense: {},
  });
  const [entries, setEntries] = useState<Record<Side, Draft>>(() => ({
    away: empty(teams.away),
    home: empty(teams.home),
  }));
  const [side, setSide] = useState<Side>('away'),
    [name, setName] = useState('티볼 수업 경기'),
    [date, setDate] = useState(localDate()),
    [time, setTime] = useState(''),
    [innings, setInnings] = useState(3),
    [note, setNote] = useState(''),
    [manager, setManager] = useState(''),
    [approved, setApproved] = useState(false),
    [error, setError] = useState('');
  const draft = entries[side],
    players = data.players.filter((p) => p.teamId === teams[side]);
  const change = (next: Draft) => {
    setEntries((old) => ({ ...old, [side]: next }));
    setApproved(false);
  };
  const status = (id: string, value: EntryStatus) => {
    if (value === 'starter' && !draft.lineup.includes(id) && draft.lineup.length >= 10) {
      setError('선발은 10명입니다. 먼저 다른 선수를 제외하세요');
      return;
    }
    const lineup =
      value === 'starter'
        ? [...new Set([...draft.lineup, id])]
        : draft.lineup.filter((p) => p !== id);
    change({
      ...draft,
      status: { ...draft.status, [id]: value },
      lineup,
      defense: Object.fromEntries(
        Object.entries(draft.defense).filter(([, p]) => lineup.includes(p!)),
      ),
    });
    setError('');
  };
  const recommend = () => {
    const result = recommendPositions(
      players
        .filter((p) => p.active && !['absent', 'unavailable'].includes(draft.status[p.id]))
        .map((p) => ({
          playerId: p.id,
          abilities: data.assessments.filter((a) => a.playerId === p.id).at(-1)?.abilities ?? {},
        })),
    );
    if (!result) {
      setError('10개 포지션을 추천할 수 없습니다. 출전 가능 선수의 9개 수비 기능평가를 확인하세요');
      return;
    }
    const ids = result.assignments.map((a) => a.playerId);
    change({
      status: Object.fromEntries(
        players.map((p) => [
          p.id,
          ids.includes(p.id)
            ? 'starter'
            : draft.status[p.id] === 'starter'
              ? 'not-playing'
              : draft.status[p.id],
        ]),
      ),
      lineup: ids,
      defense: Object.fromEntries(result.assignments.map((a) => [a.position, a.playerId])),
    });
    setError('수비 기능평가 기반 초안입니다. 선수·타순·포지션을 확인하고 감독 승인을 선택하세요');
  };
  return (
    <Modal title="새 경기 만들기" className="entry-modal" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (!approved || !manager.trim()) throw new Error('감독의 엔트리 확인이 필요합니다');
            const now = new Date().toISOString();
            const game: Game = {
              id: crypto.randomUUID(),
              name,
              createdAt: now,
              playedOn: date,
              dateStatus: 'confirmed',
              startTime: time || null,
              note,
              formation: 'TYPE1',
              innings,
              rulesVersion: RULES_VERSION,
              teamIds: teams,
              rosters: { away: [], home: [] },
              lineups: { away: entries.away.lineup, home: entries.home.lineup },
              entry: {
                capturedAt: now,
                source: 'manager',
                approvedBy: manager.trim(),
                teams: {
                  away: { ...data.teams.find((t) => t.id === teams.away)! },
                  home: { ...data.teams.find((t) => t.id === teams.home)! },
                },
                players: { away: [], home: [] },
                defense: { away: entries.away.defense, home: entries.home.defense },
              },
            };
            for (const s of ['away', 'home'] as const) {
              game.entry!.players[s] = data.players
                .filter((p) => p.teamId === teams[s])
                .map((p) => ({ ...p, status: entries[s].status[p.id] ?? 'not-playing' }));
              game.rosters[s] = game
                .entry!.players[s].filter((p) => p.status === 'starter' || p.status === 'reserve')
                .map((p) => p.id);
            }
            validateEntry(game);
            if (onCreate(game) !== false) onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : '경기 생성 실패');
          }
        }}
      >
        <label>
          경기 이름
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            경기 날짜
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            시작 시간 · 선택
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            경기 이닝
            <input
              type="number"
              min="1"
              max="20"
              required
              value={innings}
              onChange={(e) => setInnings(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="form-row">
          {(['away', 'home'] as const).map((s) => (
            <label key={s}>
              {s === 'away' ? '선공 팀' : '후공 팀'}
              <select
                value={teams[s]}
                onChange={(e) => {
                  const id = e.target.value;
                  setTeams((old) => ({ ...old, [s]: id }));
                  setEntries((old) => ({ ...old, [s]: empty(id) }));
                  setApproved(false);
                }}
              >
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="hint">
          대기 팀:{' '}
          {data.teams
            .filter((t) => t.id !== teams.away && t.id !== teams.home)
            .map((t) => t.name)
            .join(', ') || '없음'}{' '}
          · 한 경기는 두 팀만 진행합니다. TYPE1 기본 10포지션.
        </p>
        <div className="entry-navigation">
          <div className="tabs">
            {(['away', 'home'] as const).map((s) => (
              <button type="button" key={s} aria-pressed={side === s} onClick={() => setSide(s)}>
                {s === 'away' ? '선공' : '후공'} 엔트리 · {entries[s].lineup.length}/10명
              </button>
            ))}
          </div>
          <nav className="entry-shortcuts" aria-label="엔트리 편성 단계">
            <button
              type="button"
              onClick={() => candidatesRef.current?.scrollIntoView({ block: 'start' })}
            >
              선수 선택
            </button>
            <button
              type="button"
              onClick={() => {
                if (orderRef.current) orderRef.current.open = true;
                orderRef.current?.scrollIntoView({ block: 'start' });
              }}
            >
              타순·수비
            </button>
            <button
              type="button"
              onClick={() => approvalRef.current?.scrollIntoView({ block: 'start' })}
            >
              감독 확인
            </button>
          </nav>
        </div>
        <div className="entry-summary">
          등록 {players.length}명 ·{' '}
          {Object.entries(ENTRY_LABELS).map(([key, label]) => (
            <span key={key}>
              {label} {Object.values(draft.status).filter((v) => v === key).length}명{' '}
            </span>
          ))}
        </div>
        <button type="button" onClick={recommend}>
          수비 기능 추천 적용 · 초안
        </button>
        <p className="hint">
          추천은 TYPE1 v2.0 수비 기능 가중치만 사용합니다. 최종 종합 선발 점수가 아니며 감독이
          수정·확인합니다.
        </p>
        <div className="entry-candidates" ref={candidatesRef}>
          {players.map((p) => {
            const a = data.assessments.filter((a) => a.playerId === p.id).at(-1);
            const scores = POSITIONS.map((pos) => positionScore(a?.abilities ?? {}, pos)).filter(
              (v): v is number => v !== null,
            );
            return (
              <div
                className={'entry-player ' + (draft.status[p.id] === 'starter' ? 'selected' : '')}
                key={p.id}
              >
                <button
                  type="button"
                  aria-pressed={draft.status[p.id] === 'starter'}
                  aria-label={p.name + ' 선발 선택'}
                  disabled={!p.active}
                  onClick={() =>
                    status(p.id, draft.status[p.id] === 'starter' ? 'not-playing' : 'starter')
                  }
                >
                  <PlayerAvatar player={p} />
                  <span>
                    <b>
                      {p.name} · {p.number}번
                    </b>
                    <small>
                      {gradeLabel(p)} ·{' '}
                      {p.primaryPosition ? POSITION_LABELS[p.primaryPosition] : '주 포지션 미설정'}
                    </small>
                    <small>
                      수비 기능 최고 적합도{' '}
                      {scores.length ? Math.max(...scores).toFixed(1) : '미측정'}
                    </small>
                  </span>
                </button>
                <label>
                  경기 상태
                  <select
                    aria-label={p.name + ' 경기 상태'}
                    value={draft.status[p.id]}
                    onChange={(e) => status(p.id, e.target.value as EntryStatus)}
                  >
                    {Object.entries(ENTRY_LABELS).map(([v, label]) => (
                      <option
                        key={v}
                        value={v}
                        disabled={!p.active && (v === 'starter' || v === 'reserve')}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
        <details ref={orderRef} className="entry-arrangement" open={draft.lineup.length === 10}>
          <summary>타순 · 수비 포지션 편성 ({draft.lineup.length}/10)</summary>
          <ol className="entry-order">
            {draft.lineup.map((id, i) => {
              const p = players.find((p) => p.id === id)!;
              const move = (delta: number) => {
                const order = [...draft.lineup];
                [order[i], order[i + delta]] = [order[i + delta], order[i]];
                change({ ...draft, lineup: order });
              };
              return (
                <li key={id}>
                  <PlayerAvatar player={p} />
                  <b>
                    {i + 1}. {p.name}
                  </b>
                  <button
                    type="button"
                    aria-label={p.name + ' 타순 위로'}
                    disabled={i === 0}
                    onClick={() => move(-1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={p.name + ' 타순 아래로'}
                    disabled={i === draft.lineup.length - 1}
                    onClick={() => move(1)}
                  >
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="defense-grid">
            {POSITIONS.map((pos) => (
              <label key={pos}>
                {POSITION_LABELS[pos]}
                <select
                  aria-label={'엔트리 ' + POSITION_LABELS[pos]}
                  value={draft.defense[pos] ?? ''}
                  onChange={(e) => {
                    const next = { ...draft.defense };
                    if (e.target.value) next[pos] = e.target.value;
                    else delete next[pos];
                    change({ ...draft, defense: next });
                  }}
                >
                  <option value="">미배치 · 경기 전 확인</option>
                  {draft.lineup.map((id) => (
                    <option
                      key={id}
                      value={id}
                      disabled={Object.entries(draft.defense).some(
                        ([other, assigned]) => other !== pos && assigned === id,
                      )}
                    >
                      {players.find((p) => p.id === id)?.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
        <div className="entry-approval" ref={approvalRef}>
          <label>
            경기 메모
            <textarea maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            엔트리 확인 감독
            <input
              value={manager}
              maxLength={100}
              required
              onChange={(e) => setManager(e.target.value)}
              placeholder="감독 별칭"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            양 팀 선발 10명·교체 후보·타순·수비 배치를 감독이 확인했습니다
          </label>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={
              teams.away === teams.home ||
              entries.away.lineup.length !== 10 ||
              entries.home.lineup.length !== 10 ||
              !approved ||
              !manager.trim()
            }
          >
            경기 생성
          </button>
        </div>
      </form>
    </Modal>
  );
}
