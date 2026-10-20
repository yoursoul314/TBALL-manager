import type { PlateAppearance } from '../domain/model';
import { homeRunQualityKey, homeRunQualityLabel } from '../statistics/homeRuns';

export const resultLabels: Record<string, string> = {
  single: '1루타',
  double: '2루타',
  triple: '3루타',
  'home-run': '홈런',
  out: '아웃',
  error: '실책 출루',
  'fielders-choice': '야수선택 FC',
  'sacrifice-fly': '희생플라이 (임시 정책)',
  strikeout: '삼진',
};

export function playResultLabel(play: Pick<PlateAppearance, 'result' | 'quality' | 'strength'>) {
  if (play.result === 'home-run' && play.quality)
    return `홈런 · ${homeRunQualityLabel(homeRunQualityKey(play.quality, play.strength))}`;
  return resultLabels[play.result];
}
