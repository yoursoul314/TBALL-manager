import type { Quality, Strength } from '../domain/model';

export const HOME_RUN_TRAJECTORIES: Record<Quality, { label: string; description: string }> = {
  ground: { label: '땅볼형', description: '낮게 굴러가는 타구' },
  line: { label: '직선타형', description: '낮고 곧게 뻗는 타구' },
  fly: { label: '뜬공형', description: '높은 궤적으로 날아가는 타구' },
};
const strengthDescriptions: Record<Strength, string> = {
  strong: '강한',
  normal: '보통 강도의',
  weak: '약한',
};

/** A projection of recorded trajectory and strength, never a new scoring judgment. */
export function homeRunQualityKey(quality: Quality, strength?: Strength | null) {
  return `${quality}:${strength ?? 'unrecorded'}`;
}
export function homeRunQualityLabel(key: string) {
  const [quality, strength] = key.split(':');
  const trajectory = HOME_RUN_TRAJECTORIES[quality as Quality]?.label;
  if (!trajectory) return '타구 유형 미기록';
  const description = strengthDescriptions[strength as Strength];
  return description ? `${description} ${trajectory}` : `${trajectory} · 강도 미기록`;
}
