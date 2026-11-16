import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Game, Workspace } from '../domain/model';
import { gamePlayers, gameTeamName } from '../domain/roster';
import { replayGame } from '../engine/game';
import { POSITION_LABELS, type Position } from '../config/positions';
import './entryPrint.css';
export function EntrySheet({
  data,
  game,
  current = false,
}: {
  data: Workspace;
  game: Game;
  current?: boolean;
}) {
  const state = replayGame(
    game,
    data.events.filter((e) => e.gameId === game.id),
  );
  const players = gamePlayers(game, data),
    lineups = current ? state.lineups : game.lineups,
    defense = current ? state.defense : game.entry?.defense;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  return (
    <article className="entry-sheet">
      <header>
        <div>
          <small>TB MANAGER · 함께 뛰는 우리 팀</small>
          <h1>{game.name} · 출전 엔트리</h1>
        </div>
        <p>
          {game.playedOn ?? '경기일 확인 필요'} {game.startTime ?? ''}
          <br />
          {current ? '현재 타순·수비' : '경기 시작 타순·수비'} · {game.innings}이닝
        </p>
      </header>
      <div className="entry-print-teams">
        {(['away', 'home'] as const).map((side) => (
          <section key={side} aria-label={(side === 'away' ? '선공' : '후공') + ' 엔트리'}>
            <h2>
              {side === 'away' ? '선공' : '후공'} · {gameTeamName(game, data, side)}
            </h2>
            <p className="printed-captain">
              ★ 주장 {game.entry?.captains?.[side] ? name(game.entry.captains[side]!) : '미지정'}
            </p>
            <table>
              <thead>
                <tr>
                  <th>타순</th>
                  <th>이름 · 등번호</th>
                  <th>수비 위치</th>
                </tr>
              </thead>
              <tbody>
                {lineups[side].map((id, i) => (
                  <tr key={id}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{name(id)}</strong>{' '}
                      <span>#{players.find((p) => p.id === id)?.number ?? '—'}</span>
                      {game.entry?.captains?.[side] === id ? ' ★' : ''}
                    </td>
                    <td>
                      {Object.entries(defense?.[side] ?? {})
                        .filter(([, p]) => p === id)
                        .map(([p]) => POSITION_LABELS[p as Position])
                        .join(', ') || '배치 확인'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="printed-reserves">
              <b>교체 후보</b>
              <p>
                {game.rosters[side]
                  .filter((id) => !lineups[side].includes(id))
                  .map((id) => `${name(id)} #${players.find((p) => p.id === id)?.number ?? '—'}`)
                  .join(' · ') || '없음'}
              </p>
            </div>
          </section>
        ))}
      </div>
      <footer>
        내 타순과 수비 위치를 확인해요. 교체는 감독의 안내를 따라요. · ★ 주장 · 인쇄 당시 편성
      </footer>
    </article>
  );
}
export function EntryPrint({
  data,
  game,
  onClose,
}: {
  data: Workspace;
  game: Game;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add('entry-printing');
    ref.current?.focus();
    return () => {
      document.body.classList.remove('entry-printing');
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="entry-print-shell"
      role="dialog"
      aria-modal="true"
      aria-label="학생용 엔트리 인쇄"
      ref={ref}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Tab') {
          const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('button'),
            first = buttons?.[0],
            last = buttons?.[buttons.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first || document.activeElement === ref.current)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="entry-print-controls">
        <h2>학생용 엔트리 인쇄</h2>
        <div className="button-row">
          <button type="button" aria-pressed={!current} onClick={() => setCurrent(false)}>
            경기 시작 엔트리
          </button>
          <button type="button" aria-pressed={current} onClick={() => setCurrent(true)}>
            현재 엔트리
          </button>
          <button type="button" className="primary" onClick={() => window.print()}>
            엔트리 프린트 / PDF 저장
          </button>
          <button type="button" onClick={onClose}>
            기록실로 돌아가기
          </button>
        </div>
        <p>
          A4 가로 · 배율 100% 또는 용지에 맞춤 · 머리글/바닥글 끄기. iPad는 인쇄 미리보기를 펼친 뒤
          공유 → 파일에 저장으로 PDF를 보관하세요. 평가 점수·출석 사유·경기 세부 기록은 출력하지
          않습니다.
        </p>
      </div>
      <EntrySheet data={data} game={game} current={current} />
    </div>,
    document.body,
  );
}
