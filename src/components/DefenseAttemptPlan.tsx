import { useState } from 'react';
import type { Workspace } from '../domain/model';
import { createDefenseDay, defenseProgress, setDefenseTarget } from '../assessment/defenseDays';
export function DefenseAttemptPlan({
  data,
  playerId,
  date,
  assessor,
  disabled,
  onSave,
}: {
  data: Workspace;
  playerId: string;
  date: string;
  assessor: string;
  disabled: boolean;
  onSave: (d: Workspace) => void;
}) {
  const progress = defenseProgress(data, playerId, date);
  const [open, setOpen] = useState(false),
    [value, setValue] = useState(''),
    [error, setError] = useState('');
  return (
    <div className="defense-attempt-plan">
      <strong aria-label="수비 기록 진행">
        {progress.count} / {progress.target ?? '미설정'}회
        {progress.complete ? ' · 완료' : ' · 진행'}
      </strong>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setValue(String(progress.target ?? 10));
          setError('');
        }}
      >
        수비 횟수 설정
      </button>
      {open && (
        <div className="defense-target-editor">
          <label>
            학생당 수비 횟수
            <input
              type="number"
              min="1"
              max="200"
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              try {
                const target = Number(value);
                if (!Number.isInteger(target) || target < 1 || target > 200)
                  throw new Error('횟수는 1~200 사이 정수로 입력하세요');
                const next = data.defenseDays.some((d) => d.date === date)
                  ? setDefenseTarget(data, date, target)
                  : createDefenseDay(data, {
                      date,
                      assessor,
                      purpose: '수비 기능평가',
                      note: '',
                      playerIds: [playerId],
                      createdAt: new Date().toISOString(),
                      targetAttempts: target,
                    });
                // Also validate limits when a legacy individual date receives its first plan.
                onSave(setDefenseTarget(next, date, target));
                setOpen(false);
                setError('');
              } catch (e) {
                setError(e instanceof Error ? e.message : '횟수 저장 실패');
              }
            }}
          >
            횟수 저장
          </button>
          <small>
            해당 날짜의 학생별 목표 횟수입니다. 상황 1건 저장 = 1회, 취소는 제외합니다. 점수는 실제
            관찰만 반영합니다.
          </small>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
