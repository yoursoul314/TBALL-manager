import { TEAMWORK_WEIGHTS, type TeamworkCategory } from '../config/recording';
import type { TeamworkObservation } from '../domain/model';
export function teamworkSummary(observations: TeamworkObservation[]) {
  const domains = (Object.keys(TEAMWORK_WEIGHTS) as TeamworkCategory[]).map((category) => {
    const records = observations.filter((o) => o.category === category);
    const offered = records.filter((o) => o.opportunity === 'offered');
    const observed = offered.filter((o) => o.outcome !== 'unobserved');
    return {
      category,
      weight: TEAMWORK_WEIGHTS[category],
      opportunities: offered.length,
      observed: observed.length,
      performed: observed.filter((o) => o.outcome === 'performed').length,
      partial: observed.filter((o) => o.outcome === 'partial').length,
      notPerformed: observed.filter((o) => o.outcome === 'not-performed').length,
    };
  });
  // TODO: score conversion for partial performance; do not invent a final selection score.
  return { domains, finalScore: null, provisional: true as const };
}
