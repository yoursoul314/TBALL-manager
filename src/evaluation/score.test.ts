import { describe, it, expect } from 'vitest';
import { ABILITIES, POSITIONS, POSITION_WEIGHTS } from '../config/positions';
import { DEFAULT_POLICY } from '../config/evaluation';
import { blend, composite, positionScore, recommendPositions } from './score';
const full = (score: number) => Object.fromEntries(ABILITIES.map((k) => [k, score]));
describe('TYPE1 v2.0과 평가', () => {
  it('사용자가 확정한 가중치 전부를 그대로 유지하고 각 행 합계는 100이다', () => {
    expect(POSITIONS.map((p) => POSITION_WEIGHTS[p])).toEqual([
      [10, 5, 30, 5, 5, 5, 5, 10, 25],
      [20, 5, 10, 20, 5, 10, 10, 15, 5],
      [20, 5, 5, 20, 10, 10, 10, 15, 5],
      [20, 5, 5, 20, 15, 15, 5, 10, 5],
      [5, 5, 30, 10, 5, 10, 5, 15, 15],
      [30, 5, 5, 20, 5, 20, 5, 10, 0],
      [10, 30, 5, 15, 15, 5, 15, 5, 0],
      [5, 30, 5, 15, 10, 5, 25, 5, 0],
      [5, 30, 5, 15, 10, 5, 25, 5, 0],
      [10, 30, 5, 15, 15, 5, 15, 5, 0],
    ]);
    for (const p of POSITIONS) expect(POSITION_WEIGHTS[p].reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('1루수 송구 포구 100, 나머지 0일 때 30점', () =>
    expect(positionScore({ ...full(0), C: 100 }, '1B')).toBe(30));
  it('결측을 0으로 처리하지 않고, 가중치 0인 능력의 결측은 허용', () => {
    expect(positionScore({ G: 100 }, '1B')).toBeNull();
    const abilities = full(70);
    delete abilities.B;
    expect(positionScore(abilities, 'P')).toBe(70);
  });
  it('주루 40/60 확정과 미확정 최종 영역 비율을 구분', () => {
    expect(blend(100, 50, DEFAULT_POLICY.runningMix)).toBe(70);
    expect(blend(null, 50, DEFAULT_POLICY.runningMix)).toBeNull();
    expect(
      composite({ batting: 100, defense: 100, running: 100, teamwork: 100 }, DEFAULT_POLICY),
    ).toEqual({ score: 100, provisional: true });
    expect(DEFAULT_POLICY.domainWeights.status).toBe('TODO');
  });
  it('잘못된 점수와 비율 합계를 거부', () => {
    expect(() => positionScore(full(101), 'SS')).toThrow();
    expect(() => blend(40, 40, { skill: 30, game: 60 })).toThrow();
  });
  it('10개 포지션은 중복 없는 선수로 전역 합계를 최대화', () => {
    const candidates = Array.from({ length: 11 }, (_, i) => ({
      playerId: 'p' + i,
      abilities: full(i === 10 ? 100 : 50),
    }));
    const result = recommendPositions(candidates)!;
    expect(result.assignments).toHaveLength(10);
    expect(new Set(result.assignments.map((a) => a.playerId)).size).toBe(10);
    expect(result.total).toBe(550);
    expect(result.assignments.some((a) => a.playerId === 'p10')).toBe(true);
  });
  it('9명이거나 필요한 데이터가 부족하면 배치안을 만들지 않는다', () => {
    expect(
      recommendPositions(
        Array.from({ length: 9 }, (_, i) => ({ playerId: 'p' + i, abilities: full(100) })),
      ),
    ).toBeNull();
    expect(
      recommendPositions(
        Array.from({ length: 10 }, (_, i) => ({ playerId: 'p' + i, abilities: {} })),
      ),
    ).toBeNull();
  });
  it('후보 중복을 거부한다', () =>
    expect(() =>
      recommendPositions([
        { playerId: 'a', abilities: full(50) },
        { playerId: 'a', abilities: full(90) },
      ]),
    ).toThrow('중복'));
});
