import type { BattingRubric } from '../domain/batting';
import { QUALITY_RUBRIC, LEGACY_RUBRIC, rubricOf, toBatting100 } from '../config/battingQuality';
import type { Workspace } from '../domain/model';
import type { BattingAssessmentAttempt as Attempt } from '../domain/batting';
export interface AssessmentPeriod {
  rubric?: BattingRubric;
  from?: string;
  to?: string;
}
export function summarizeBatting(data: Workspace, playerId: string, period: AssessmentPeriod = {}) {
  const allSessions = data.battingSessions.filter(
    (s) =>
      s.playerId === playerId &&
      s.status !== 'cancelled' &&
      (!period.from || s.date >= period.from) &&
      (!period.to || s.date <= period.to),
  );
  const hasNewScore = data.battingAttempts.some(
    (a) =>
      a.status === 'active' &&
      a.score !== null &&
      a.result !== null &&
      allSessions.some((s) => s.id === a.sessionId && rubricOf(s) === QUALITY_RUBRIC),
  );
  const availableRubrics = [...new Set(allSessions.map(rubricOf))];
  const rubric =
    period.rubric ??
    (hasNewScore
      ? QUALITY_RUBRIC
      : availableRubrics.includes(LEGACY_RUBRIC)
        ? LEGACY_RUBRIC
        : QUALITY_RUBRIC);
  const sessions = allSessions.filter((s) => rubricOf(s) === rubric);
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const attempts = data.battingAttempts.filter(
    (a) => sessionMap.has(a.sessionId) && a.status === 'active',
  );
  const scored = attempts.filter(
    (a): a is Attempt & { score: number } => a.score !== null && a.result !== null,
  );
  const total = scored.reduce((s, a) => s + a.score, 0),
    count = scored.length;
  let runningSum = 0,
    runningCount = 0;
  const daily = [...new Set(sessions.map((s) => s.date))].sort().map((date) => {
    const rounds = scored.filter((a) => sessionMap.get(a.sessionId)!.date === date);
    const sum = rounds.reduce((s, a) => s + a.score, 0);
    runningSum += sum;
    runningCount += rounds.length;
    return {
      date,
      count: rounds.length,
      sum,
      average: rounds.length ? sum / rounds.length : null,
      cumulative: runningCount ? runningSum / runningCount : null,
      provisional: sessions.some((s) => s.date === date && s.status === 'in-progress'),
    };
  });
  const observed = attempts.filter((a) => a.result !== null);
  const balls = observed.filter(
    (a) =>
      a.result !== 'miss' &&
      [
        a.direction ?? null,
        a.directionZone,
        a.trajectory,
        a.intensity,
        a.contactQuality,
        a.qualityGrade ?? null,
      ].some((v) => v !== null),
  );
  const distribution = (
    key:
      | 'direction'
      | 'directionZone'
      | 'trajectory'
      | 'intensity'
      | 'contactQuality'
      | 'result'
      | 'qualityGrade',
  ) => {
    const value = (a: Attempt) =>
      key === 'direction' ? (a.direction ?? a.directionZone?.split('-')[0] ?? null) : a[key];
    const rows = observed.filter((a) => value(a) != null);
    const counts: Record<string, number> = {};
    for (const a of rows) {
      const k = value(a)!;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return {
      counts,
      total: rows.length,
      ratio: (value: string) => (rows.length ? (counts[value] ?? 0) / rows.length : null),
    };
  };
  const directions = distribution('direction'),
    zones = distribution('directionZone'),
    trajectories = distribution('trajectory'),
    intensities = distribution('intensity'),
    contacts = distribution('contactQuality'),
    results = distribution('result'),
    grades = distribution('qualityGrade');
  const settings = data.battingSettings.classification,
    types: string[] = [];
  const sides = { left: 0, center: 0, right: 0 };
  for (const [key, n] of Object.entries(directions.counts))
    sides[key.split('-')[0] as keyof typeof sides] += n;
  const eligible = (n: number) => n >= settings.minimumBalls;
  if (
    eligible(intensities.total) &&
    settings.strongRatio !== null &&
    intensities.ratio('strong')! >= settings.strongRatio
  )
    types.push('강타형');
  if (
    eligible(contacts.total) &&
    settings.solidRatio !== null &&
    contacts.ratio('solid')! >= settings.solidRatio
  )
    types.push('정확성 중심형');
  if (eligible(directions.total)) {
    if (settings.sideRatio !== null)
      for (const [side, label] of [
        ['left', '좌측'],
        ['center', '중앙'],
        ['right', '우측'],
      ] as const)
        if (sides[side] / directions.total >= settings.sideRatio) types.push(label + ' 집중형');
    if (
      settings.spreadMaxRatio !== null &&
      Object.values(sides).every((n) => n > 0 && n / directions.total <= settings.spreadMaxRatio!)
    )
      types.push('분산 타격형');
  }
  const validDays = daily.filter((d) => d.count > 0),
    recent = validDays.at(-1) ?? null,
    previous = validDays.at(-2) ?? null;
  const legacy =
    data.assessments.filter((a) => a.playerId === playerId).at(-1)?.battingSkill ?? null;
  const score = count ? toBatting100(total / count, rubric) : null;
  return {
    rubric,
    availableRubrics,
    grades,
    count,
    total,
    average: count ? total / count : null,
    score,
    batting10: count
      ? rubric === QUALITY_RUBRIC
        ? ((total / count + 1) / 6) * 10
        : total / count
      : null,
    days: validDays.length,
    daily,
    recent,
    change: recent && previous ? recent.average! - previous.average! : null,
    provisional: sessions.some((s) => s.status === 'in-progress'),
    balls: balls.length,
    observed: observed.length,
    zones,
    directions,
    trajectories,
    intensities,
    contacts,
    results,
    types,
    classificationNote:
      balls.length < settings.minimumBalls
        ? `분석 보류 · 유효 타구 ${balls.length}/${settings.minimumBalls}개`
        : [
              settings.strongRatio,
              settings.solidRatio,
              settings.sideRatio,
              settings.spreadMaxRatio,
            ].every((v) => v === null)
          ? '분석 보류 · 분류 경계값 TODO'
          : '설정된 기준에 따른 참고 분석 · 항목별 관찰 표본이 부족하거나 기준이 없으면 판정 보류',
    legacy,
    selectedScore: data.battingSettings.scoreSource === 'detailed' ? score : legacy,
  };
}
