import type { DefenseStep } from '../domain/defense';
import type {
  EndPlayPayload,
  FieldingObservation,
  GameState,
  PlayDetail,
  RunnerOutcome,
  Quality,
  BatResult,
} from '../domain/model';
export const DEFENSE_LABELS: Record<DefenseStep['action'], string> = {
  'ground-catch': '땅볼 포구 성공',
  'fly-catch': '뜬공 포구 성공',
  'catch-fail': '포구 실패',
  throw: '송구 성공',
  'bad-throw': '악송구',
  receive: '송구 포구 성공',
  'receive-fail': '송구 포구 실패',
  'tag-out': '태그아웃',
  'force-out': '포스아웃',
  base: '베이스 처리',
  'fielders-choice': '야수선택',
};
const same = (a: object, b: object) =>
  Object.entries(b).every(([k, v]) => (a as Record<string, unknown>)[k] === v);
const require = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
export function assistCandidates(
  steps: DefenseStep[],
  target: DefenseStep['targetBase'],
  fielder: string,
) {
  const lastOut = steps
    .map(
      (s) =>
        s.action === 'force-out' ||
        s.action === 'tag-out' ||
        (s.action === 'fly-catch' && !!s.runnerId),
    )
    .lastIndexOf(true);
  return [
    ...new Set(
      steps
        .slice(lastOut + 1)
        .filter((s) => s.action === 'throw' && s.targetBase === target && s.playerId !== fielder)
        .map((s) => s.playerId),
    ),
  ];
}
/** Deterministic projection of explicitly entered actions; no unobserved ability is invented. */
export function projectDefenseSequence(state: GameState, steps: DefenseStep[]) {
  require(state.live, '플레이 시작 후 수비를 기록하세요');
  const live = state.live!;
  const side = state.side === 'away' ? 'home' : 'away';
  const participants = [...Object.values(live.bases), live.batterId];
  const fielding: FieldingObservation[] = [],
    details: PlayDetail[] = [],
    outcomes: RunnerOutcome[] = [];
  let quality: Quality | null = null,
    result: BatResult | null = null;
  require(new Set(steps.map((s) => s.id)).size === steps.length, '수비 행동 ID 중복');
  const outRunners = new Set<string>();
  steps.forEach((s, index) => {
    require(state.defense[side][s.position] ===
      s.playerId, '실제 수비 배치와 행동 선수가 다릅니다');
    if (s.runnerId) require(participants.includes(s.runnerId), '플레이에 없는 주자');
    const observation = (skill: FieldingObservation['skill'], success: boolean) =>
      fielding.push({ playerId: s.playerId, position: s.position, skill, success });
    const action = (
      action: 'receive' | 'throw' | 'base' | 'out',
      success: boolean,
      runnerId?: string,
    ) =>
      details.push({
        id: s.id + ':action',
        type: 'FIELDING_ACTION',
        playerId: s.playerId,
        position: s.position,
        action,
        success,
        ...(runnerId ? { runnerId } : {}),
      });
    switch (s.action) {
      case 'ground-catch':
        observation('G', true);
        action('receive', true);
        quality = 'ground';
        break;
      case 'fly-catch':
        observation('F', true);
        action('receive', true);
        quality = 'fly';
        break;
      case 'catch-fail':
        if (s.catchSkill) observation(s.catchSkill, false);
        action('receive', false);
        break;
      case 'throw':
        require(s.targetBase, '송구 목표 베이스가 필요합니다');
        observation('A', true);
        action('throw', true);
        break;
      case 'bad-throw':
        observation('A', false);
        action('throw', false);
        break;
      case 'receive':
        observation('C', true);
        action('receive', true);
        break;
      case 'receive-fail':
        observation('C', false);
        action('receive', false);
        break;
      case 'base':
        observation('B', true);
        action('base', true);
        break;
      case 'force-out':
      case 'tag-out':
        observation('B', true);
        break;
      case 'fielders-choice':
        require(s.runnerId &&
          s.runnerId !== live.batterId &&
          Object.values(live.bases).includes(s.runnerId), '야수선택 대상은 기존 주자여야 합니다');
        require(!details.some((d) => d.type === 'FIELDERS_CHOICE'), '야수선택 대상 중복');
        details.push({ id: s.id + ':fc', type: 'FIELDERS_CHOICE', targetRunnerId: s.runnerId! });
        result = 'fielders-choice';
        break;
    }
    const isOut =
      s.action === 'force-out' ||
      s.action === 'tag-out' ||
      (s.action === 'fly-catch' && s.runnerId !== null);
    if (isOut) {
      require(s.runnerId && s.targetBase, '아웃 대상과 위치를 지정하세요');
      require(!outRunners.has(s.runnerId!), '같은 주자를 두 번 아웃 처리할 수 없습니다');
      outRunners.add(s.runnerId!);
      if (s.action === 'fly-catch')
        require(s.runnerId === live.batterId, '뜬공 포구 아웃은 타자에 연결하세요');
      outcomes.push({
        playerId: s.runnerId!,
        to: 'out',
        action: 'advance',
        outReason: s.action === 'force-out' ? 'force' : s.action === 'tag-out' ? 'tag' : 'fly',
        outAt: s.targetBase!,
      });
      if (s.action !== 'fly-catch') action('out', true, s.runnerId!);
      details.push({
        id: s.id + ':po',
        type: 'DEFENSIVE_CREDIT',
        playerId: s.playerId,
        credit: 'putout',
        runnerId: s.runnerId!,
      });
      const candidates = assistCandidates(steps.slice(0, index), s.targetBase, s.playerId);
      require(new Set(s.assistIds).size === s.assistIds.length &&
        s.assistIds.every((id) =>
          candidates.includes(id),
        ), '실제 연결된 송구 수비수만 보살에 지정하세요');
      s.assistIds.forEach((id) =>
        details.push({
          id: s.id + ':assist:' + id,
          type: 'DEFENSIVE_CREDIT',
          playerId: id,
          credit: 'assist',
          runnerId: s.runnerId!,
        }),
      );
      if (s.runnerId === live.batterId) result = 'out';
    } else require(s.assistIds.length === 0, '보살은 확인할 아웃에 연결하세요');
    if (s.errorType) {
      require(['catch-fail', 'bad-throw', 'receive-fail'].includes(
        s.action,
      ), '실패 행동에 공식 실책 판정을 연결하세요');
      details.push({
        id: s.id + ':error',
        type: 'DEFENSIVE_ERROR',
        playerId: s.playerId,
        errorType: s.errorType,
        note: '기록원의 수비 행동 실책 판정',
      });
    }
  });
  if (outRunners.has(live.batterId))
    require(!details.some(
      (d) => d.type === 'FIELDERS_CHOICE',
    ), '타자 아웃과 야수선택 출루를 동시에 기록할 수 없습니다');
  return { fielding, details, outcomes, quality, result };
}
export function validateDefenseSequence(state: GameState, payload: EndPlayPayload) {
  if (!payload.defenseSequence?.length) return;
  const projection = projectDefenseSequence(state, payload.defenseSequence);
  for (const d of projection.details)
    require(payload.details?.some((actual) =>
      same(actual, d),
    ), '수비 행동과 파생 기록이 일치하지 않습니다');
  const available = [...payload.fielding];
  for (const o of projection.fielding) {
    const i = available.findIndex((actual) => same(actual, o));
    require(i >= 0, '수비 능력 관찰 누락');
    available.splice(i, 1);
  }
  for (const o of projection.outcomes)
    require(payload.outcomes.some(
      (a) =>
        a.playerId === o.playerId &&
        a.to === o.to &&
        a.outAt === o.outAt &&
        a.outReason === o.outReason,
    ), '수비 아웃과 실제 주자 판정이 다릅니다. 수비 행동을 수정하세요');
  if (projection.result)
    require(payload.result === projection.result, '수비 연결과 타격 결과 불일치');
  if (projection.quality)
    require(payload.quality === projection.quality, '수비 포구 유형과 타구 유형 불일치');
}
