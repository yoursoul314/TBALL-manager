import { useState, useRef } from 'react';
import type { Workspace } from '../domain/model';
import { archiveSelection, planPermanentDeletion, type ManagementKind } from '../domain/management';
import { photoRepository } from '../data/photos';
import { serializePhotoBackup } from '../data/photoBackup';
import { downloadFile } from '../data/repository';
import { Modal } from './ui';
export type ManagementRequest = {
  kind: ManagementKind;
  ids: string[];
  action: 'archive' | 'restore' | 'purge';
};
export function ManagementDialog({
  data,
  request,
  onSave,
  onPurge,
  onClose,
}: {
  data: Workspace;
  request: ManagementRequest;
  onSave: (d: Workspace) => void;
  onPurge: (kind: ManagementKind, ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState(''),
    [password, setPassword] = useState(''),
    [prepared, setPrepared] = useState<number | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [phrase, setPhrase] = useState(''),
    [busy, setBusy] = useState(false),
    [photoCount, setPhotoCount] = useState<number | null>(null);
  const lock = useRef(false);
  const noun = request.kind === 'players' ? '선수' : '팀',
    verb =
      request.action === 'archive' ? '삭제' : request.action === 'restore' ? '복원' : '완전삭제';
  let plan: ReturnType<typeof planPermanentDeletion> | null = null,
    problem = '';
  if (request.action === 'purge')
    try {
      plan = planPermanentDeletion(data, request.kind, request.ids);
    } catch (e) {
      problem = e instanceof Error ? e.message : '삭제 계획 오류';
    }
  const names = (request.kind === 'players' ? data.players : data.teams)
    .filter((r) => request.ids.includes(r.id))
    .map((r) => r.name);
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={noun + ' 선택 ' + verb}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        <b>{names.length}개 선택</b> · {names.join(', ')}
      </p>
      {request.action !== 'purge' ? (
        <>
          <p>원본 기록과 사진은 보존됩니다. 선택한 항목 전체에 적용합니다.</p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                onSave(
                  archiveSelection(
                    data,
                    request.kind,
                    request.ids,
                    request.action === 'archive',
                    new Date().toISOString(),
                  ),
                );
                onClose();
              })
            }
          >
            {noun} 선택 {verb} 확정
          </button>
        </>
      ) : (
        <>
          {problem ? (
            <p role="alert">{problem}</p>
          ) : (
            plan && (
              <>
                <p className="alert">
                  복원 버튼으로 되돌릴 수 없습니다. 연결된 경기는 다른 학생 기록을 포함한 경기
                  전체를 삭제합니다. 팀 완전삭제 시 등록 학생과 그 학생의 독립 평가는 유지합니다.
                </p>
                <dl className="purge-counts">
                  <div>
                    <dt>경기 전체</dt>
                    <dd>{plan.counts.games}개</dd>
                  </div>
                  <div>
                    <dt>경기 이벤트</dt>
                    <dd>{plan.counts.events}건</dd>
                  </div>
                  <div>
                    <dt>기능평가</dt>
                    <dd>
                      수동 {plan.counts.assessments}건 · 수비 체크 {plan.counts.defenseAssessments}
                      건
                    </dd>
                  </div>
                  <div>
                    <dt>타격 세션 / 회차</dt>
                    <dd>
                      {plan.counts.sessions} / {plan.counts.attempts}건
                    </dd>
                  </div>
                  <div>
                    <dt>팀워크 / 추천</dt>
                    <dd>
                      {plan.counts.teamwork} / {plan.counts.selections}건
                    </dd>
                  </div>
                  <div>
                    <dt>삭제할 사진</dt>
                    <dd>{photoCount === null ? '백업 준비 시 확인' : photoCount + '장'}</dd>
                  </div>
                </dl>
                <p className="hint">
                  현재 기록·사진 전체를 암호화 백업한 뒤 진행합니다. 삭제 항목이 다시 나타나지
                  않도록 이 기기의 이전 버전 저장본과 이전 원문 출처도 제거합니다.
                </p>
                <fieldset disabled={busy} className="plain-fieldset">
                  <label>
                    완전삭제 백업 암호
                    <input
                      type="password"
                      autoComplete="off"
                      value={password}
                      minLength={10}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPrepared(null);
                        setConfirmed(false);
                      }}
                      placeholder="10자 이상"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={password.length < 10}
                    onClick={() =>
                      void run(async () => {
                        const photos = await photoRepository.all();
                        setPhotoCount(
                          photos.filter((p) => plan!.photoIds.includes(p.playerId)).length,
                        );
                        const backup = await serializePhotoBackup(data, photoRepository, password);
                        downloadFile(
                          'tb-manager-before-permanent-delete-' +
                            new Date().toISOString().slice(0, 10) +
                            '.json',
                          backup,
                          'application/json',
                        );
                        setPrepared(data.revision);
                        setConfirmed(false);
                      })
                    }
                  >
                    완전삭제 전 백업 다운로드
                  </button>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={prepared !== data.revision}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    백업 파일과 삭제 범위를 확인했습니다
                  </label>
                  <label>
                    완전삭제 확인 문구
                    <input
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder="완전삭제"
                    />
                  </label>
                  <button
                    className="danger-button"
                    disabled={prepared !== data.revision || !confirmed || phrase !== '완전삭제'}
                    onClick={() =>
                      void run(async () => {
                        await onPurge(request.kind, request.ids);
                        onClose();
                      })
                    }
                  >
                    선택 항목 완전삭제 실행
                  </button>
                </fieldset>
              </>
            )
          )}
        </>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
