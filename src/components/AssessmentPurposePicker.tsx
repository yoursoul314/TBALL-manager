import { useState } from 'react';

/** Keep the existing string field and custom purposes compatible with backups. */
export function AssessmentPurposePicker({
  label,
  defaultValue = '',
}: {
  label: string;
  defaultValue?: string;
}) {
  const [purpose, setPurpose] = useState(defaultValue);
  return (
    <div className="assessment-purpose-picker" role="group" aria-label={label + ' 선택'}>
      <span>{label}</span>
      <div className="assessor-buttons">
        {['타격 평가', '수비 평가'].map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={purpose === value}
            onClick={() => setPurpose(value)}
          >
            {purpose === value ? '✓ ' : ''}
            {value}
          </button>
        ))}
      </div>
      <label>
        직접 입력 · 선택한 목적
        <input
          aria-label={label}
          name="purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="위 버튼을 선택하거나 직접 입력"
          maxLength={200}
          required
        />
      </label>
    </div>
  );
}
