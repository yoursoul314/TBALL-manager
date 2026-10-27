import { QUALITY_SCALE } from '../config/battingQuality';
import { QUALITY_RUBRIC, rubricLabel } from '../config/battingQuality';
import type { Workspace } from '../domain/model';
import {
  ABILITIES,
  ABILITY_LABELS,
  POSITIONS,
  POSITION_LABELS,
  POSITION_WEIGHTS,
} from '../config/positions';
import { defenseEvaluation } from './defense';
import { summarizeBatting } from '../assessment/battingSummary';
import { calculateStats } from '../statistics/calculate';
import { positionScore } from './score';
import { parseWorkspace } from '../data/schema';
export interface ComparisonMetric {
  key: string;
  label: string;
  group: 'summary' | 'batting' | 'defense' | 'positions';
  value: number | null;
  unit: 'score' | 'rate' | 'number';
  sample: number | null;
  source: string;
  better: 'higher' | 'lower' | null;
}
const numeric = [
  'pa',
  'atBats',
  'hits',
  'homeRuns',
  'totalBases',
  'strikeouts',
  'runs',
  'rbi',
  'fieldersChoices',
  'putouts',
  'assists',
  'errors',
  'fieldingAttempts',
  'fieldingSuccesses',
] as const;
const distributions = [
  'directions',
  'qualities',
  'strengths',
  'zones',
  'homeRunQualities',
  'errorsByType',
  'fieldingActions',
  'positionAttempts',
  'positionSuccesses',
  'fieldingTypes',
] as const;
export function comparisonRows(data: Workspace, ids: string[]) {
  const all = data.games
    .filter((g) => !g.archivedAt)
    .flatMap(
      (g) =>
        calculateStats(
          g,
          data.events.filter((e) => e.gameId === g.id),
          data.policy,
          'record',
        ).rows,
    );
  return [...new Set(ids)].flatMap((id) => {
    const player = data.players.find((p) => p.id === id && !p.archivedAt);
    if (!player) return [];
    const batting = summarizeBatting(data, id),
      defense = defenseEvaluation(data, id),
      games = all.filter((s) => s.playerId === id);
    const stats = Object.fromEntries(
      numeric.map((k) => [k, games.reduce((s, r) => s + r[k], 0)]),
    ) as Record<(typeof numeric)[number], number>;
    const maps = Object.fromEntries(
      distributions.map((k) => {
        const counts: Record<string, number> = {};
        for (const r of games)
          for (const [key, n] of Object.entries(r[k])) counts[key] = (counts[key] ?? 0) + n;
        return [k, counts];
      }),
    ) as Record<(typeof distributions)[number], Record<string, number>>;
    const defenseSource =
      defense.source === 'checklist'
        ? (defense.summary.mixedRubrics ? 'mixed:' + id + ':' : 'checklist:') +
          JSON.stringify(
            [
              ...new Set(
                data.defenseAssessments
                  .filter((r) => r.playerId === id && r.revisions.at(-1)!.status === 'active')
                  .map((r) => JSON.stringify(r.revisions.at(-1)!.rubric)),
              ),
            ].sort(),
          )
        : 'manual';
    const battingSource = 'detailed:' + batting.rubric;
    const metrics: ComparisonMetric[] = [];
    const add = (
      key: string,
      label: string,
      group: ComparisonMetric['group'],
      value: number | null,
      unit: ComparisonMetric['unit'],
      sample: number | null,
      source: string,
      better: ComparisonMetric['better'] = null,
    ) => metrics.push({ key, label, group, value, unit, sample, source, better });
    add(
      'batting-skill',
      '타격 기능평가',
      'summary',
      batting.selectedScore,
      'score',
      data.battingSettings.scoreSource === 'detailed' ? batting.count : null,
      data.battingSettings.scoreSource === 'detailed' ? battingSource : 'legacy',
      'higher',
    );
    add(
      'detail-score',
      '상세 타격 기능점수',
      'batting',
      batting.score,
      'score',
      batting.count,
      battingSource,
    );
    add(
      'legacy-score',
      '이전 수동 타격점수 (참고)',
      'batting',
      batting.legacy,
      'score',
      null,
      'manual',
    );
    add(
      'detail-average',
      '누적 회차 평균 · ' + rubricLabel(batting.rubric),
      'batting',
      batting.average,
      'score',
      batting.count,
      battingSource,
    );
    add(
      'observed-results',
      '관찰한 타격 결과 수',
      'batting',
      batting.observed,
      'number',
      null,
      battingSource,
    );
    add(
      'observed-balls',
      '관찰한 유효 타구 수',
      'batting',
      batting.balls,
      'number',
      null,
      battingSource,
    );
    add(
      'batting-rounds',
      '유효 타격 평가 횟수',
      'batting',
      batting.count,
      'number',
      null,
      battingSource,
    );
    add('batting-days', '타격 평가 일수', 'batting', batting.days, 'number', null, battingSource);
    add(
      'recent',
      '최근 타격 평균 · ' + rubricLabel(batting.rubric),
      'batting',
      batting.recent?.average ?? null,
      'score',
      batting.recent?.count ?? 0,
      battingSource,
    );
    add(
      'change',
      '최근 날짜 평균 변화 · ' + rubricLabel(batting.rubric),
      'batting',
      batting.change,
      'score',
      null,
      battingSource,
    );
    for (const [key, label, dist, value] of [
      ['solid', '정타율', batting.contacts, 'solid'],
      ['strong', '강한 타구 비율', batting.intensities, 'strong'],
      ['fair', '정상 타격률', batting.results, 'fair'],
      ['foul', '파울 비율', batting.results, 'foul'],
      [
        'miss',
        batting.rubric === QUALITY_RUBRIC ? '티 타격·헛스윙 비율' : '헛스윙 비율',
        batting.results,
        'miss',
      ],
    ] as const)
      add(
        key,
        label,
        'batting',
        dist.ratio(value),
        'rate',
        dist.total,
        battingSource,
        ['solid', 'strong', 'fair'].includes(key) ? 'higher' : key === 'miss' ? 'lower' : null,
      );
    if (batting.rubric === QUALITY_RUBRIC)
      for (const [key, grade] of Object.entries(QUALITY_SCALE))
        add(
          'grade-' + key,
          grade.label + ' (' + grade.score + '점) 비율',
          'batting',
          batting.grades.ratio(key),
          'rate',
          batting.grades.total,
          battingSource,
          grade.score >= 4 ? 'higher' : 'lower',
        );
    const rate = (a: number, b: number) => (b ? a / b : null);
    add(
      'avg',
      '실전 타율',
      'summary',
      rate(stats.hits, stats.atBats),
      'rate',
      stats.atBats,
      'game',
      'higher',
    );
    add(
      'slg',
      '실전 장타율',
      'summary',
      rate(stats.totalBases, stats.atBats),
      'rate',
      stats.atBats,
      'game',
      'higher',
    );
    add(
      'k-rate',
      '실전 삼진 비율',
      'batting',
      rate(stats.strikeouts, stats.pa),
      'rate',
      stats.pa,
      'game',
      'lower',
    );
    const labels = {
      pa: '타석',
      atBats: '타수',
      hits: '안타',
      homeRuns: '홈런',
      totalBases: '총 루타',
      strikeouts: '삼진',
      runs: '득점',
      rbi: '기록된 타점',
      fieldersChoices: '야수선택',
      putouts: '기록된 자살',
      assists: '기록된 보살',
      errors: '기록된 실책',
      fieldingAttempts: '수비 관찰 기회',
      fieldingSuccesses: '수비 관찰 성공',
    };
    for (const k of numeric)
      add(
        k,
        labels[k],
        ['putouts', 'assists', 'errors', 'fieldingAttempts', 'fieldingSuccesses'].includes(k)
          ? 'defense'
          : 'batting',
        stats[k],
        'number',
        null,
        'game',
      );
    add(
      'fielding-rate',
      '실전 수비 관찰 성공률',
      'summary',
      rate(stats.fieldingSuccesses, stats.fieldingAttempts),
      'rate',
      stats.fieldingAttempts,
      'game',
      'higher',
    );
    for (const k of ABILITIES)
      add(
        k,
        k + ' ' + ABILITY_LABELS[k],
        'defense',
        defense.abilities[k] ?? null,
        'score',
        defense.source === 'checklist' ? defense.summary.abilities[k].count : null,
        defenseSource,
        'higher',
      );
    for (const pos of POSITIONS)
      add(
        pos,
        POSITION_LABELS[pos],
        'positions',
        positionScore(defense.abilities, pos),
        'score',
        defense.source === 'checklist'
          ? Math.min(
              ...ABILITIES.filter((_, i) => POSITION_WEIGHTS[pos][i] > 0).map(
                (k) => defense.summary.abilities[k].count,
              ),
            )
          : null,
        defense.source,
      );
    return [{ player, batting, defense, stats, maps, metrics }];
  });
}
export type ComparisonRow = ReturnType<typeof comparisonRows>[number];
export function comparisonInsights(row: ComparisonRow, rows: ComparisonRow[], minimum: number) {
  if (!Number.isInteger(minimum) || minimum < 1) throw new Error('최소 관찰 수는 1 이상 정수');
  const evidence = row.metrics.flatMap((m) => {
    if (!m.better || m.value === null || m.sample === null || m.sample < minimum) return [];
    const peers = rows
      .filter((r) => r.player.id !== row.player.id)
      .map((r) => r.metrics.find((x) => x.key === m.key)!)
      .filter(
        (x) =>
          x.source === m.source && x.value !== null && x.sample !== null && x.sample >= minimum,
      );
    if (!peers.length) return [];
    const average = peers.reduce((s, p) => s + p.value!, 0) / peers.length,
      delta = m.value - average;
    if (Math.abs(delta) < 1e-9) return [];
    return [
      {
        metric: m,
        average,
        delta,
        peers: peers.length,
        strength: delta > 0 === (m.better === 'higher'),
      },
    ];
  });
  return {
    strengths: evidence.filter((e) => e.strength),
    weaknesses: evidence.filter((e) => !e.strength),
  };
}
export function saveComparisonSelection(data: Workspace, ids: string[], note: string, at: string) {
  if (ids.some((id) => !data.players.some((p) => p.id === id && !p.archivedAt && p.active)))
    throw new Error('출전 가능한 등록 학생만 검토 후보로 저장하세요');
  return parseWorkspace({
    ...data,
    comparisonSelection: { playerIds: [...new Set(ids)], note, updatedAt: at, status: 'draft' },
  });
}
