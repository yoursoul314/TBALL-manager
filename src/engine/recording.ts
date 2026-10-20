import type { BatResult, GameState, RunnerOutcome } from '../domain/model';
/** UI suggestions only: the user must confirm every actual result before END_PLAY. */
export function suggestOutcomes(state: GameState, result: BatResult): RunnerOutcome[] {
  if (!state.live) return [];
  const bases = { single: 1, double: 2, triple: 3, 'home-run': 4 }[result as 'single'] ?? 0;
  const runners: RunnerOutcome[] = Object.entries(state.live.bases).map(([base, playerId]) => {
    const to = Number(base) + bases;
    return {
      playerId,
      to: to >= 4 ? 'home' : (to as 1 | 2 | 3),
      action: bases ? 'advance' : 'hold',
    };
  });
  runners.push({
    playerId: state.live.batterId,
    to:
      result === 'out' || result === 'sacrifice-fly'
        ? 'out'
        : bases === 4
          ? 'home'
          : ((bases || 1) as 1 | 2 | 3),
    action: 'advance',
  });
  return runners;
}
export function confirmationError(
  outcomes: RunnerOutcome[],
  participants: string[],
  confirmed: string[],
  time: boolean,
) {
  if (
    outcomes.length !== participants.length ||
    new Set(outcomes.map((o) => o.playerId)).size !== participants.length ||
    participants.some((id) => !outcomes.some((o) => o.playerId === id))
  )
    return '타자와 모든 주자의 결과가 필요합니다.';
  if (outcomes.some((o) => o.to === 'out' && (!o.outReason || !o.outAt)))
    return '아웃 종류와 아웃 위치를 판정하세요.';
  const bases = outcomes.filter((o) => typeof o.to === 'number').map((o) => o.to);
  if (new Set(bases).size !== bases.length)
    return '한 베이스에 두 주자가 있습니다. 실제 위치를 수정하세요.';
  if (participants.some((id) => !confirmed.includes(id)))
    return '모든 주자의 실제 결과를 확인하세요.';
  if (!time) return '심판 타임 선언을 확인하세요.';
  return null;
}
