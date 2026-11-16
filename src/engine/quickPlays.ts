import type { GameState, RunnerOutcome } from '../domain/model';
import type { DefenseStep } from '../domain/defense';
import type { Position } from '../config/positions';
import { suggestOutcomes } from './recording';
import { projectDefenseSequence } from './defenseSequence';
export type QuickOut = 'ground' | 'fly' | 'double';
export const QUICK_OUT_LABELS: Record<QuickOut, string> = {
  ground: '땅볼 아웃 · 1루',
  fly: '뜬공 아웃',
  double: '병살 · 2루→1루',
};
/** Unconfirmed proposals only. Other runners stay as a visible proposal, never inferred facts. */
export function quickOutcomes(state: GameState, kind: QuickOut): RunnerOutcome[] {
  if (!state.live) throw new Error('플레이를 시작하세요');
  if (kind === 'double' && !state.live.bases[1])
    throw new Error('2루→1루 병살은 1루 주자가 필요합니다');
  return suggestOutcomes(state, 'out').map((o) =>
    o.playerId === state.live!.batterId
      ? { ...o, to: 'out', outReason: kind === 'fly' ? 'fly' : 'force', outAt: 1 }
      : kind === 'double' && o.playerId === state.live!.bases[1]
        ? { ...o, to: 'out', action: 'advance', outReason: 'force', outAt: 2 }
        : o,
  );
}
/** The recorder explicitly confirms the displayed complete sequence. No guessed fielder. */
export function quickDefenseSteps(
  state: GameState,
  kind: QuickOut,
  positions: { first: Position; relay?: Position; finish?: Position },
  id: () => string = () => crypto.randomUUID(),
): DefenseStep[] {
  quickOutcomes(state, kind);
  const live = state.live!,
    defense = state.defense[state.side === 'away' ? 'home' : 'away'];
  const steps: DefenseStep[] = [];
  const add = (
    position: Position | undefined,
    action: DefenseStep['action'],
    targetBase: DefenseStep['targetBase'] = null,
    runnerId: string | null = null,
    assistIds: string[] = [],
  ) => {
    if (!position || !defense[position]) throw new Error('실제 배치된 수비수를 모두 선택하세요');
    steps.push({
      id: id(),
      playerId: defense[position]!,
      position,
      action,
      targetBase,
      runnerId,
      catchSkill: null,
      errorType: null,
      assistIds,
    });
  };
  if (kind === 'fly') add(positions.first, 'fly-catch', 1, live.batterId);
  else {
    add(positions.first, 'ground-catch');
    const link = (from: Position, to: Position | undefined, base: 1 | 2, runner: string) => {
      if (!to || !defense[to]) throw new Error('아웃 처리 수비수를 선택하세요');
      if (from !== to) {
        add(from, 'throw', base);
        add(to, 'receive');
      }
      // force-out already records B (base handling); do not count it twice.
      add(to, 'force-out', base, runner, from === to ? [] : [defense[from]!]);
    };
    if (kind === 'double') {
      link(positions.first, positions.relay, 2, live.bases[1]!);
      link(positions.relay!, positions.finish, 1, live.batterId);
    } else link(positions.first, positions.finish, 1, live.batterId);
  }
  projectDefenseSequence(state, steps);
  return steps;
}
