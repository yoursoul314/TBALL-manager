import type { Bases, EndPlayPayload, Game, Id, Side } from '../domain/model';
import { DISTANCES, STRENGTHS, ERROR_LABELS } from '../config/recording';
import { POSITIONS } from '../config/positions';

export function validateDetails(
  p: EndPlayPayload,
  before: Bases,
  batter: Id,
  game: Game,
  side: Side,
) {
  const require = (ok: unknown, message: string) => {
    if (!ok) throw new Error(message);
  };
  require(p.distance == null || DISTANCES.includes(p.distance), '타구 거리 구역 오류');
  require(p.strength == null || STRENGTHS.includes(p.strength), '타구 강도 오류');
  const details = p.details ?? [];
  require(new Set(details.map((d) => d.id)).size === details.length, '세부 이벤트 ID 중복');
  const participants = [...Object.values(before), batter];
  const defenders = game.rosters[side === 'away' ? 'home' : 'away'];
  const choice = details.filter((d) => d.type === 'FIELDERS_CHOICE');
  require(choice.length ===
    (p.result === 'fielders-choice' ? 1 : 0), 'FC 결과에는 야수선택 대상 주자를 하나 기록하세요');
  const rbis = new Set<Id>(),
    putouts = new Set<Id>(),
    assists = new Set<string>();
  const advancementEnd = new Map<Id, number>();
  for (const d of details) {
    require(d.id.trim(), '세부 이벤트 ID 누락');
    if (d.type === 'FIELDERS_CHOICE') {
      require(d.targetRunnerId !== batter &&
        Object.values(before).includes(d.targetRunnerId), '야수선택 대상은 기존 주자여야 합니다');
    } else if (d.type === 'RBI') {
      require(p.outcomes.some(
        (o) => o.playerId === d.runnerId && o.to === 'home',
      ), 'RBI는 해당 플레이 득점 주자에만 부여하세요');
      require(!rbis.has(d.runnerId), '동일 득점의 RBI 중복');
      rbis.add(d.runnerId);
    } else if (d.type === 'ERROR_ADVANCE') {
      require(participants.includes(d.playerId), '실책 진루 대상이 없습니다');
      require(details.some(
        (e) => e.id === d.errorId && e.type === 'DEFENSIVE_ERROR',
      ), '실책 진루의 원인 실책이 없습니다');
      const start =
        d.playerId === batter
          ? ({ single: 1, double: 2, triple: 3, 'home-run': 4 }[p.result as 'single'] ?? 0)
          : Number(Object.entries(before).find(([, id]) => id === d.playerId)?.[0]);
      const to = d.to === 'home' ? 4 : d.to;
      const outcome = p.outcomes.find((o) => o.playerId === d.playerId);
      const final = outcome?.to === 'home' ? 4 : typeof outcome?.to === 'number' ? outcome.to : -1;
      require(d.from >= (advancementEnd.get(d.playerId) ?? start) &&
        to > d.from &&
        to <= final, '실책 추가 진루 구간이 안타·최종 위치와 일치하지 않습니다');
      advancementEnd.set(d.playerId, to);
    } else {
      require(defenders.includes(d.playerId), '세부 수비 기록의 선수가 상대 팀 명단에 없습니다');
      if (d.type === 'DEFENSIVE_ERROR') require(d.errorType in ERROR_LABELS, '실책 유형 오류');
      if (d.type === 'FIELDING_ACTION') {
        require(POSITIONS.includes(d.position), '수비 포지션 오류');
        if (d.runnerId)
          require(participants.includes(d.runnerId), '아웃 기여의 대상 주자가 없습니다');
        if (d.action === 'out') {
          require(d.runnerId, '아웃 기여의 대상 주자를 지정하세요');
          if (d.success)
            require(p.outcomes.some(
              (o) => o.playerId === d.runnerId && o.to === 'out',
            ), '성공한 아웃 기여와 실제 아웃 결과 불일치');
        }
      }
      if (d.type === 'DEFENSIVE_CREDIT') {
        require(p.outcomes.some(
          (o) => o.playerId === d.runnerId && o.to === 'out',
        ), '자살·보살의 실제 아웃 대상이 없습니다');
        if (d.credit === 'putout') {
          require(!putouts.has(d.runnerId), '한 아웃에 자살을 중복 부여할 수 없습니다');
          putouts.add(d.runnerId);
        } else {
          const key = d.playerId + ':' + d.runnerId;
          require(!assists.has(key), '같은 수비수·아웃의 보살 중복');
          assists.add(key);
        }
      }
    }
  }
}
