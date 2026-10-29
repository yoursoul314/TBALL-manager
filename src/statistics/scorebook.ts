import type { Game, GameEvent, PlateAppearance, Workspace } from '../domain/model';
import { effectiveEvents, replayGame, scoreboard, stateBeforeEvent } from '../engine/game';
import { gamePlayers } from '../domain/roster';
import { ERROR_LABELS } from '../config/recording';

export const SCORE_CODES: Record<PlateAppearance['result'], string> = {
  single: '1H',
  double: '2H',
  triple: '3H',
  'home-run': 'HR',
  out: 'OUT',
  strikeout: 'K',
  error: 'E',
  'fielders-choice': 'FC',
  'sacrifice-fly': 'SF',
};
const outNames = {
  force: '포스',
  tag: '태그',
  fly: '뜬공',
  strikeout: '삼진',
  lead: '리드',
  steal: '도루',
  slide: '슬라이딩',
};
const actions = {
  advance: '진루',
  hold: '잔류',
  'tag-up': '태그업',
  overrun: '오버런',
  lead: '리드',
  steal: '도루',
  slide: '슬라이딩',
};

/** Read-only projection of effective events; never synthesizes an RBI or writes a game. */
export function buildScorebook(game: Game, data: Workspace) {
  const events = data.events.filter((e) => e.gameId === game.id);
  const state = replayGame(game, events);
  const active = effectiveEvents(events);
  const players = gamePlayers(game, data);
  const name = (id: string) => {
    const p = players.find((p) => p.id === id);
    return p ? `${p.name} #${p.number}` : id;
  };
  let previousIndex = -1;
  const plays = state.plays.map((play, i) => {
    const before = stateBeforeEvent(game, events, play.eventId);
    const index = active.findIndex((e) => e.id === play.eventId);
    const pitches = active
      .slice(previousIndex + 1, index + 1)
      .filter((e) => e.payload.type === 'PITCH')
      .map((e) => (e.payload.type === 'PITCH' && e.payload.call === 'foul' ? 'F' : 'S'))
      .join('·');
    previousIndex = index;
    const credited = (play.details ?? []).filter(
      (d) => d.type === 'RBI' && play.runs.includes(d.runnerId),
    );
    const defense = (play.details ?? [])
      .flatMap((d) => {
        if (d.type === 'DEFENSIVE_CREDIT')
          return `${name(d.playerId)} ${d.credit === 'putout' ? 'PO' : 'A'}`;
        if (d.type === 'DEFENSIVE_ERROR')
          return `${name(d.playerId)} E(${ERROR_LABELS[d.errorType]})`;
        if (d.type === 'FIELDING_ACTION')
          return `${name(d.playerId)} ${d.position} ${{ receive: '포구', throw: '송구', base: '베이스', out: '아웃' }[d.action]}:${d.success === null ? '미관찰' : d.success ? '성공' : '실패'}`;
        if (d.type === 'ERROR_ADVANCE')
          return `${name(d.playerId)} 실책 추가진루 ${d.from}→${d.to === 'home' ? '홈' : d.to}`;
        if (d.type === 'FIELDERS_CHOICE') return `FC 대상 ${name(d.targetRunnerId)}`;
        return [];
      })
      .concat(
        play.fielding.map(
          (o) =>
            `${name(o.playerId)} ${o.position} ${o.skill}:${o.success === null ? '미관찰' : o.success ? '성공' : '실패'}`,
        ),
      );
    return {
      ...play,
      number: i + 1,
      slot: before.appearances + 1,
      code: SCORE_CODES[play.result],
      batter: name(play.batterId),
      pitches: pitches || '—',
      rbi: credited.length,
      before:
        Object.entries(before.live?.bases ?? before.bases[play.side])
          .map(([base, id]) => `${base}루 ${name(id)}`)
          .join(' / ') || '주자 없음',
      runners: play.cancelledAdvances
        ? 'RULE02 · 진루·득점 취소, 직전 잔루 복구'
        : play.outcomes
            .map(
              (o) =>
                `${name(o.playerId)} → ${o.to === 'home' ? '홈' : o.to === 'out' ? `아웃(${outNames[o.outReason!]}·${o.outAt === 'home' ? '홈' : o.outAt + '루'})` : o.to + '루'} / ${actions[o.action]}${credited.some((d) => d.type === 'RBI' && d.runnerId === o.playerId) ? ' / RBI 인정' : ''}`,
            )
            .join('\n'),
      defense: defense.join('\n') || '미기록',
    };
  });
  const changes = active.flatMap((event: GameEvent) => {
    const p = event.payload;
    if (p.type === 'START_PLAY' || p.type === 'END_PLAY' || p.type === 'PITCH') return [];
    const before = stateBeforeEvent(game, events, event.id);
    let text = '';
    if (p.type === 'SUBSTITUTE')
      text = `${p.side === 'away' ? '선공' : '후공'} ${p.slot + 1}번 ${name(before.lineups[p.side][p.slot])} → ${name(p.playerId)} 정식 교체`;
    if (p.type === 'TEMP_RUNNER')
      text = `임시주자 ${name(p.originalId)} → ${name(p.replacementId)} (승인 ${p.approvedBy})`;
    if (p.type === 'DEFENSE')
      text =
        `${p.side === 'away' ? '선공' : '후공'} 수비 변경: ` +
        Object.entries(p.assignments)
          .map(([pos, id]) => `${pos} ${name(id)}`)
          .join(', ');
    if (p.type === 'RUNNER_VIOLATION')
      text = `${name(p.playerId)} ${outNames[p.violation]} 위반 아웃`;
    if (p.type === 'FINISH_GAME') text = `경기 종료: ${p.reason}`;
    return [
      {
        id: event.id,
        at: `${before.inning}회 ${before.side === 'away' ? '초' : '말'} · 다음 ${before.appearances + 1}번`,
        text,
      },
    ];
  });
  return { state, score: scoreboard(state), plays, changes, name };
}

export function chunks<T>(rows: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );
}
