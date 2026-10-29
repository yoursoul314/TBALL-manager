import { useState } from 'react';
import { Plus, ArrowRight, Trash2, RotateCcw } from 'lucide-react';
import type { Game, Workspace } from '../domain/model';
import { replayGame, scoreboard } from '../engine/game';
import { gameTeamName } from '../domain/roster';
import { activeTeams } from '../domain/gameLibrary';
import { NewGame } from './NewGame';
import { ScorebookPrint } from './ScorebookPrint';
import { Badge, Empty, Modal } from './ui';
export function MatchLibrary({
  data,
  onOpen,
  onCreate,
  onArchive,
}: {
  data: Workspace;
  onOpen: (id: string) => void;
  onCreate: (g: Game) => boolean;
  onArchive: (id: string, archived: boolean) => boolean;
}) {
  const [creating, setCreating] = useState(false),
    [trash, setTrash] = useState(false),
    [date, setDate] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [deleting, setDeleting] = useState<Game | null>(null);
  const [printing, setPrinting] = useState<Game | null>(null);
  const rows = data.games
    .filter((g) => Boolean(g.archivedAt) === trash)
    .map((game) => {
      const state = replayGame(
        game,
        data.events.filter((e) => e.gameId === game.id),
      );
      return { game, state, score: scoreboard(state) };
    })
    .filter(
      ({ game, state }) =>
        (!date || game.playedOn === date) &&
        (status === 'all' ||
          (status === 'finished' ? state.status === 'finished' : state.status !== 'finished')) &&
        [game.name, gameTeamName(game, data, 'away'), gameTeamName(game, data, 'home')]
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        (b.game.playedOn ?? '').localeCompare(a.game.playedOn ?? '') ||
        b.game.createdAt.localeCompare(a.game.createdAt),
    );
  return (
    <section className="match-library">
      <div className="page-title">
        <div>
          <div className="eyebrow">MATCH LIBRARY</div>
          <h1>경기 기록실</h1>
          <p>경기를 선택하면 기록과 상세 내용을 확인할 수 있습니다.</p>
          <a
            href={import.meta.env.BASE_URL + 'tb-scorebook-template.html'}
            target="_blank"
            rel="noreferrer"
          >
            공통 빈 기록지 양식 열기
          </a>
        </div>
        <button
          className="primary"
          disabled={activeTeams(data).length < 2}
          onClick={() => setCreating(true)}
        >
          <Plus size={18} />새 경기
        </button>
      </div>
      {activeTeams(data).length < 2 && (
        <p className="callout">
          새 경기를 만들려면 운영 팀이 두 개 필요합니다. 선수 & 팀에서 팀을 추가하거나 복원하세요.
        </p>
      )}
      <div className="library-filters">
        <div className="tabs">
          <button aria-pressed={!trash} onClick={() => setTrash(false)}>
            경기 목록 · {data.games.filter((g) => !g.archivedAt).length}
          </button>
          <button aria-pressed={trash} onClick={() => setTrash(true)}>
            휴지통 · {data.games.filter((g) => g.archivedAt).length}
          </button>
        </div>
        <label>
          경기 검색
          <input
            aria-label="경기 검색"
            placeholder="경기명·팀 이름"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          경기 날짜 필터
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          경기 상태
          <select
            aria-label="경기 상태 필터"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">전체 상태</option>
            <option value="active">진행 중·시작 전</option>
            <option value="finished">종료</option>
          </select>
        </label>
        {(date || query || status !== 'all') && (
          <button
            onClick={() => {
              setDate('');
              setQuery('');
              setStatus('all');
            }}
          >
            필터 초기화
          </button>
        )}
      </div>
      {trash && (
        <p className="callout">
          삭제된 경기의 선수·엔트리·원본 플레이·수정 이력은 보존됩니다. 복원하면 목록과 경기 통계에
          다시 포함됩니다.
        </p>
      )}
      {rows.length === 0 && (
        <Empty>
          {trash
            ? '휴지통이 비어 있습니다.'
            : date
              ? '선택한 날짜의 경기가 없습니다.'
              : '표시할 경기가 없습니다. 새 경기를 추가하세요.'}
        </Empty>
      )}
      <div className="game-library-grid">
        {rows.map(({ game, state, score }) => (
          <article className="match-list-card" key={game.id}>
            <button
              className="match-open"
              aria-label={game.name + ' 경기 열기'}
              disabled={trash}
              onClick={() => onOpen(game.id)}
            >
              <div className="match-list-meta">
                <span>
                  {game.playedOn ?? '날짜 미설정'}
                  {game.startTime ? ' · ' + game.startTime : ''}
                  {game.dateStatus === 'estimated' ? ' · 날짜 확인 필요' : ''}
                </span>
                <Badge tone={state.status === 'finished' ? 'neutral' : 'green'}>
                  {state.status === 'finished'
                    ? '경기 종료'
                    : state.ball === 'live'
                      ? '플레이 이어 기록'
                      : state.plays.length
                        ? '진행 중'
                        : '시작 전'}
                </Badge>
              </div>
              <h2>{game.name}</h2>
              <div className="match-list-score">
                <span>{gameTeamName(game, data, 'away')}</span>
                <b>
                  {score.total.away} : {score.total.home}
                </b>
                <span>{gameTeamName(game, data, 'home')}</span>
              </div>
              <div className="match-list-meta">
                <span>
                  {game.innings}이닝 · {state.plays.length}타석 기록 · 승패 반영{' '}
                  {score.official.away}:{score.official.home}
                </span>
                <ArrowRight size={20} />
              </div>
            </button>
            <div className="match-list-actions">
              <button onClick={() => setPrinting(game)} aria-label={game.name + ' 기록지 인쇄'}>
                기록지 인쇄
              </button>
              {trash ? (
                <button onClick={() => onArchive(game.id, false)} aria-label={game.name + ' 복원'}>
                  <RotateCcw size={17} />
                  복원
                </button>
              ) : (
                <button
                  disabled={state.ball === 'live'}
                  onClick={() => setDeleting(game)}
                  aria-label={game.name + ' 삭제'}
                >
                  <Trash2 size={17} />
                  삭제
                </button>
              )}
              {state.ball === 'live' && <small>플레이 확정 후 삭제할 수 있습니다</small>}
            </div>
          </article>
        ))}
      </div>
      {creating && (
        <NewGame
          data={data}
          onClose={() => setCreating(false)}
          onCreate={(g) => {
            if (!onCreate(g)) return false;
            setCreating(false);
            return true;
          }}
        />
      )}
      {printing && <ScorebookPrint data={data} game={printing} onClose={() => setPrinting(null)} />}
      {deleting && (
        <Modal title="경기 삭제" onClose={() => setDeleting(null)}>
          <p>
            <b>{deleting.name}</b> 경기를 휴지통으로 이동합니다. 원본 기록은 보존하며 나중에 복원할
            수 있습니다.
          </p>
          <div className="button-row">
            <button onClick={() => setDeleting(null)}>취소</button>
            <button
              className="primary"
              onClick={() => {
                if (onArchive(deleting.id, true)) setDeleting(null);
              }}
            >
              휴지통으로 이동
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
