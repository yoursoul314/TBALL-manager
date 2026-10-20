import { expect, it } from 'vitest';
import { TEAMWORK_WEIGHTS } from '../config/recording';
import { teamworkSummary } from './teamwork';
import type { TeamworkObservation } from '../domain/model';
it('5영역 가중치 확정값과 평가 기회·수행 결과를 구분한다', () => {
  expect(TEAMWORK_WEIGHTS).toEqual({
    communication: 25,
    coverBackup: 25,
    roleExecution: 20,
    teammateSupport: 15,
    teamTactics: 15,
  });
  const base: TeamworkObservation = {
    id: 'a',
    playerId: 'fake',
    gameId: null,
    recordedAt: '2026-10-20T00:00:00.000Z',
    observer: '테스트',
    note: '',
    category: 'communication',
    opportunity: 'offered',
    outcome: 'performed',
  };
  const result = teamworkSummary([
    base,
    { ...base, id: 'b', opportunity: 'not-offered', outcome: 'unobserved' },
    { ...base, id: 'c', outcome: 'unobserved' },
    { ...base, id: 'd', outcome: 'partial' },
    { ...base, id: 'e', outcome: 'not-performed' },
  ]);
  expect(result.domains[0]).toMatchObject({
    opportunities: 4,
    observed: 3,
    performed: 1,
    partial: 1,
    notPerformed: 1,
  });
  expect(result.finalScore).toBeNull();
});
