import { useEffect, useRef, useState } from 'react';
import type { Player, Workspace } from '../domain/model';
import { captureLegacyEntry } from '../domain/roster';
import { playerSchema } from '../data/schema';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import { photoRepository, preparePhoto, saveWithPhoto } from '../data/photos';
import { PlayerAvatar } from './PlayerAvatar';
import { Modal } from './ui';
export function PlayerEditor({
  player,
  data,
  onSave,
  onClose,
}: {
  player?: Player;
  data: Workspace;
  onSave: (d: Workspace) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Player>(
    () =>
      player ?? {
        id: crypto.randomUUID(),
        teamId: null,
        name: '',
        number: 1,
        active: true,
        grade: null,
        classroom: null,
        studentNumber: null,
        primaryPosition: null,
        secondaryPosition: null,
        note: '',
      },
  );
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined),
    [preview, setPreview] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : null;
    setPreview(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);
  const patch = (value: Partial<Player>) => setDraft((d) => ({ ...d, ...value }));
  return (
    <Modal
      className="player-editor-modal"
      title={player ? '선수 정보 수정' : '선수 등록'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (locked.current) return;
          locked.current = true;
          setBusy(true);
          setError('');
          try {
            const validated = playerSchema.parse(draft);
            if (validated.pref1 && validated.pref1 === validated.pref2)
              throw Error('1·2지망 포지션은 다르게 선택하세요');
            const next = {
              ...data,
              games: data.games.map((g) => ({
                ...g,
                entry: g.entry ?? captureLegacyEntry(g, data),
              })),
              players: player
                ? data.players.map((p) => (p.id === player.id ? validated : p))
                : [...data.players, validated],
            };
            await saveWithPhoto(photoRepository, draft.id, photo, () => onSave(next));
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : '저장 실패');
          } finally {
            locked.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="plain-fieldset">
          <p className="hint">학생 고유 ID: {draft.id} · 학년·반·번호와 별개로 유지됩니다.</p>
          <label>
            선수 이름
            <input
              required
              maxLength={80}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="수업용 별칭"
            />
          </label>
          <div className="form-row">
            <label>
              학년
              <select
                aria-label="학년"
                value={draft.grade ?? ''}
                onChange={(e) =>
                  patch({ grade: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null })
                }
              >
                <option value="">미설정</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}학년
                  </option>
                ))}
              </select>
            </label>
            <label>
              반
              <input
                value={draft.classroom ?? ''}
                maxLength={30}
                onChange={(e) => patch({ classroom: e.target.value || null })}
              />
            </label>
            <label>
              학생 번호
              <input
                type="number"
                min="1"
                max="999"
                value={draft.studentNumber ?? ''}
                onChange={(e) =>
                  patch({ studentNumber: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              등번호
              <input
                required
                type="number"
                min="0"
                max="999"
                value={draft.number}
                onChange={(e) => patch({ number: Number(e.target.value) })}
              />
            </label>
            <p className="hint">
              학생은 공통 명단에 등록합니다. 팀은 새 경기의 등록 선수 불러오기에서 배정하세요. 기존
              경기의 팀 정보는 유지됩니다.
            </p>
          </div>
          <div className="form-row">
            {(['primaryPosition', 'secondaryPosition'] as const).map((key, i) => (
              <label key={key}>
                {i ? '보조 포지션' : '주 포지션'}
                <select
                  value={draft[key] ?? ''}
                  onChange={(e) => patch({ [key]: (e.target.value || null) as Position | null })}
                >
                  <option value="">미설정</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="form-row">
            {(['pref1', 'pref2'] as const).map((key, i) => (
              <label key={key}>
                {i + 1}지망 포지션
                <select
                  aria-label={i + 1 + '지망 포지션'}
                  value={draft[key] ?? ''}
                  onChange={(e) => patch({ [key]: (e.target.value || null) as Position | null })}
                >
                  <option value="">미설정</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => patch({ active: e.target.checked })}
            />
            출전 가능
          </label>
          <label>
            비고
            <textarea
              maxLength={2000}
              value={draft.note ?? ''}
              onChange={(e) => patch({ note: e.target.value })}
            />
          </label>
          <section className="photo-editor">
            <h3>학생 사진 · 이 기기에서만 저장</h3>
            {preview ? (
              <img className="photo-preview" src={preview} alt="선수 사진 미리보기" />
            ) : photo === null ? (
              <span className="avatar">{draft.number}</span>
            ) : (
              <PlayerAvatar player={draft} />
            )}
            <label className="button file-button">
              사진 선택·교체
              <input
                aria-label="학생 사진 선택"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setBusy(true);
                  setError('');
                  try {
                    setPhoto(await preparePhoto(file));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '사진 처리 실패');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <button type="button" onClick={() => setPhoto(null)}>
              사진 삭제
            </button>
            <p className="hint">
              JPEG·PNG·WebP, 최대8MB. 방향 보정 후320px 이하로 축소합니다. 사진 변경·삭제는 선수
              저장 시 적용됩니다. 서버 인증 전 실제 학생의 얼굴 사진 사용을 피하세요. GitHub나
              서버로 전송하지 않습니다.
            </p>
          </section>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <p className="hint">
            팀은 경기별로 편성합니다. 과거 경기의 팀·엔트리와 통계는 당시 기록으로 유지됩니다.
          </p>
          <div className="editor-save-bar">
            <button className="primary wide">{busy ? '저장 중…' : '선수 저장'}</button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
