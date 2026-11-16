import { useState } from 'react';
import type {
  Workspace,
  Game,
  EventPayload,
  Direction,
  Distance,
  Quality,
  Strength,
} from '../domain/model';
import { effectiveEvents } from '../engine/game';
import { Modal } from './ui';
import { BattedBallMap } from './BattedBallMap';
/** Metadata-only revision: runner decisions and the live next-batter draft stay intact. */
export function BattingDetailEditor({
  data,
  game,
  targetId,
  onEvent,
  onClose,
}: {
  data: Workspace;
  game: Game;
  targetId: string;
  onEvent: (p: EventPayload) => boolean;
  onClose: () => void;
}) {
  const target = effectiveEvents(data.events.filter((e) => e.gameId === game.id)).find(
    (e) => e.id === targetId,
  );
  const p = target?.payload.type === 'END_PLAY' ? target.payload : null;
  const [direction, setDirection] = useState<Direction | null>(p?.direction ?? null),
    [distance, setDistance] = useState<Distance | null>(p?.distance ?? null),
    [quality, setQuality] = useState<Quality | null>(p?.quality ?? null),
    [strength, setStrength] = useState<Strength | null>(p?.strength ?? null),
    [author, setAuthor] = useState(''),
    [reason, setReason] = useState('타구 상세 추가 관찰'),
    [error, setError] = useState('');
  if (!p) return null;
  return (
    <Modal title="직전 타구 상세 보완" onClose={onClose}>
      <p>
        다음 타자 기록을 유지하면서 방향·유형·강도를 보완합니다. 타격 결과·주자·득점 변경은 볼
        데드에서 ‘직전 플레이 수정’을 사용하세요.
      </p>
      <BattedBallMap
        direction={direction}
        distance={distance}
        onChange={(d, l) => {
          setDirection(d);
          setDistance(l);
        }}
      />
      <fieldset>
        <legend>타구 유형</legend>
        <div className="button-row">
          {(
            [
              ['ground', '땅볼'],
              ['line', '직선타'],
              ['fly', '뜬공'],
            ] as const
          ).map(([v, label]) => (
            <button
              type="button"
              key={v}
              aria-pressed={quality === v}
              onClick={() => setQuality(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>타구 강도</legend>
        <div className="button-row">
          {(
            [
              ['strong', '강'],
              ['normal', '보통'],
              ['weak', '약'],
            ] as const
          ).map(([v, label]) => (
            <button
              type="button"
              key={v}
              aria-pressed={strength === v}
              onClick={() => setStrength(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        onClick={() => {
          setDirection(null);
          setDistance(null);
          setQuality(null);
          setStrength(null);
        }}
      >
        타구 관찰 미기록으로
      </button>
      <label>
        수정자 별칭
        <input value={author} maxLength={100} onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <label>
        수정 사유
        <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="primary"
        disabled={!author.trim() || !reason.trim()}
        onClick={() => {
          const ok = onEvent({
            type: 'REVISE_PLAY',
            targetId,
            author: author.trim(),
            reason: reason.trim(),
            replacement: { ...p, direction, distance, quality, strength },
          });
          if (ok) onClose();
          else
            setError(
              '저장 실패: 수비 연결의 타구 유형 등 기존 판정과의 충돌 또는 저장 오류를 확인하세요. 입력은 유지됩니다.',
            );
        }}
      >
        타구 상세 저장 · 이력 보존
      </button>
    </Modal>
  );
}
