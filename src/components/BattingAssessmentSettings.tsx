import { useState } from 'react';
import type { Workspace } from '../domain/model';
import { parseWorkspace } from '../data/schema';
import { Panel } from './ui';
export function BattingAssessmentSettings({
  data,
  onSave,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
}) {
  const [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const settings = data.battingSettings,
    zone = settings.zoneDefinitions.find((z) => z.version === settings.currentZoneVersion)!;
  const save = (next: Workspace) => {
    try {
      onSave(parseWorkspace(next));
      setError('');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    }
  };
  return (
    <Panel title="타격 기능평가 설정" eyebrow="ASSESSMENT SETTINGS">
      <p>
        회차 점수는 감독의 1~10점 판정입니다. 아래 정책은 경기 규칙·포지션 가중치·종합 선발 비율을
        변경하지 않습니다.
      </p>
      <form
        className="batting-settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const ratio = (name: string) =>
            String(f.get(name)).trim() === '' ? null : Number(f.get(name)) / 100;
          save({
            ...data,
            battingSettings: {
              ...settings,
              scoreSource: String(f.get('source')) as 'detailed' | 'legacy',
              classification: {
                minimumBalls: Number(f.get('minimum')),
                strongRatio: ratio('strong'),
                solidRatio: ratio('solid'),
                sideRatio: ratio('side'),
                spreadMaxRatio: ratio('spread'),
              },
            },
          });
        }}
      >
        <div className="form-row">
          <label>
            기능평가 점수 출처
            <select name="source" defaultValue={settings.scoreSource}>
              <option value="detailed">신규 상세 누적 평균 (기본)</option>
              <option value="legacy">이전 수동 점수 (별도 선택)</option>
            </select>
          </label>
          <label>
            유형 분석 최소 관찰 수
            <input
              name="minimum"
              type="number"
              min="1"
              max="10000"
              required
              defaultValue={settings.classification.minimumBalls}
            />
          </label>
        </div>
        <p className="hint">
          기본 최소 표본은 15개입니다. 아래 경계값은 TODO이며 빈 값이면 해당 유형 판정을 보류합니다.
          설정한 기준은 참고 분석에만 적용됩니다.
        </p>
        <div className="form-row">
          {(
            [
              ['strong', '강타형 강한 타구 비율 ≥', settings.classification.strongRatio, 0, 100],
              ['solid', '정확성 중심형 정타 비율 ≥', settings.classification.solidRatio, 0, 100],
              [
                'side',
                '좌·중·우 집중형 해당 방향 비율 ≥',
                settings.classification.sideRatio,
                50,
                100,
              ],
              [
                'spread',
                '분산형 각 방향 최대 비율 ≤',
                settings.classification.spreadMaxRatio,
                33.34,
                50,
              ],
            ] as const
          ).map(([name, label, value, min, max]) => (
            <label key={name}>
              {label} (%)
              <input
                name={name}
                type="number"
                min={min}
                max={max}
                step="any"
                defaultValue={value === null ? '' : value * 100}
                placeholder="TODO · 미확정"
              />
            </label>
          ))}
        </div>
        <p className="hint">
          각 유형은 해당 지표의 관찰 수가 최소 표본을 충족해야 합니다. 분산형은 좌·중·우 모두 관찰된
          경우에만 적용합니다. 표본 조건과 경계값은 확정된 교육 평가 기준이 아닙니다.
        </p>
        <button className="primary">평가 분석 설정 저장</button>
      </form>
      <h3>9구역 거리 정의</h3>
      <p>
        현재 버전 {zone.version}: 근거리 {zone.near} / 중거리 {zone.middle} / 원거리 {zone.far}
      </p>
      <p className="hint">
        평가 장소에 맞는 거리·경계를 직접 입력하세요. 저장하면 새 버전이 생기며 이후 생성하는 세션에
        적용됩니다. 과거 세션의 정의는 수정하지 않습니다.
      </p>
      <form
        className="batting-settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            version = 'zone-' + crypto.randomUUID();
          save({
            ...data,
            battingSettings: {
              ...settings,
              currentZoneVersion: version,
              zoneDefinitions: [
                ...settings.zoneDefinitions,
                {
                  version,
                  near: String(f.get('near')),
                  middle: String(f.get('middle')),
                  far: String(f.get('far')),
                },
              ],
            },
          });
        }}
      >
        <div className="form-row">
          {(
            [
              ['near', '근거리'],
              ['middle', '중거리'],
              ['far', '원거리'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label} 기준
              <input name={key} required maxLength={200} placeholder="거리 범위 또는 경기장 표식" />
            </label>
          ))}
        </div>
        <button>새 구역 정의 버전 저장</button>
      </form>
      <details>
        <summary>보존된 구역 정의 ({settings.zoneDefinitions.length}개)</summary>
        {settings.zoneDefinitions.map((z) => (
          <p key={z.version}>
            {z.version} · {z.near} / {z.middle} / {z.far}
          </p>
        ))}
      </details>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {saved && !error && <p role="status">평가 설정을 저장했습니다.</p>}
    </Panel>
  );
}
