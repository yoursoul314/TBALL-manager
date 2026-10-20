import { useState } from 'react';
import type { EventPayload, Game, Workspace } from '../domain/model';
import { effectiveEvents, stateBeforeEvent } from '../engine/game';
import { Modal, Badge } from './ui';
import { PlayForm } from './PlayForm';
import { resultLabels } from './playLabels';
export function HistoryEditor({
  data,
  game,
  targetId,
  onClose,
  onEvent,
}: {
  data: Workspace;
  game: Game;
  targetId: string;
  onClose: () => void;
  onEvent: (p: EventPayload) => boolean;
}) {
  const [author, setAuthor] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState('');
  const events = data.events.filter((e) => e.gameId === game.id);
  const target = effectiveEvents(events).find((e) => e.id === targetId);
  const original = events.find((e) => e.id === targetId);
  if (!target || target.payload.type !== 'END_PLAY' || original?.payload.type !== 'END_PLAY')
    return null;
  const before = stateBeforeEvent(game, events, targetId);
  return (
    <Modal title="과거 플레이 수정" onClose={onClose}>
      <div className="callout amber">
        원본은 보존됩니다. 저장 시 전체 경기를 재생하여 모든 통계를 다시 계산합니다. 후속 주자
        상태와 충돌하면 저장되지 않습니다.
      </div>
      <p>
        원본 판정: <b>{resultLabels[original.payload.result]}</b> ·{' '}
        {new Date(original.recordedAt).toLocaleString('ko-KR')}
      </p>
      <details>
        <summary>원본 및 수정 이력 확인</summary>
        <pre className="audit-json">{JSON.stringify(original.payload, null, 2)}</pre>
        {events.map(
          (e) =>
            e.payload.type === 'REVISE_PLAY' &&
            e.payload.targetId === targetId && (
              <div className="observation" key={e.id}>
                <Badge tone="neutral">{resultLabels[e.payload.replacement.result]}</Badge>
                <p>{e.payload.reason}</p>
                <small>
                  {e.payload.author} · {new Date(e.recordedAt).toLocaleString('ko-KR')}
                </small>
                <pre className="audit-json">{JSON.stringify(e.payload.replacement, null, 2)}</pre>
              </div>
            ),
        )}
      </details>
      <label>
        수정자 별칭
        <input
          aria-label="수정자 별칭"
          value={author}
          maxLength={100}
          onChange={(e) => setAuthor(e.target.value)}
        />
      </label>
      <label>
        수정 사유
        <input
          aria-label="수정 사유"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <PlayForm
        state={before}
        game={game}
        data={data}
        initial={target.payload}
        onEvent={(p) => {
          if (!author.trim() || !reason.trim()) {
            setError('수정자와 사유를 입력하세요.');
            return false;
          }
          if (p.type !== 'END_PLAY') return false;
          const saved = onEvent({ type: 'REVISE_PLAY', targetId, reason, author, replacement: p });
          if (saved) onClose();
          else
            setError(
              '저장되지 않았습니다. 오류 안내를 확인하고 후속 플레이와 맞는 결과를 입력하세요.',
            );
          return saved;
        }}
      />
    </Modal>
  );
}
