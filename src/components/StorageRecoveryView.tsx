import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { Workspace } from '../domain/model';
import { APP_VERSION } from '../config/version';
import { LocalWorkspaceRepository, downloadFile, serializeBackup } from '../data/repository';
import { isQuotaError } from '../data/storageCodec';
import { useAppUpdate } from '../hooks/useAppUpdate';
export function StorageRecoveryView({
  error,
  repository,
}: {
  error: string;
  repository: LocalWorkspaceRepository;
}) {
  const update = useAppUpdate(false);
  const [verified, setVerified] = useState<Workspace | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const pending = repository.hasPendingRecovery();
  const quota = isQuotaError(new Error(error));
  const inspect = async () => {
    try {
      const data = await repository.inspectStoredWorkspace();
      if (!data) throw Error('읽을 기존 기록이 없습니다');
      setVerified(data);
      setMessage('기존 기록 검증 완료 · 저장소에 쓰지 않고 확인했습니다.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '원본 확인 실패');
    }
  };
  const repair = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('원본을 기기에 보관하고 검증 중입니다. 앱을 열어두세요.');
    try {
      const data = await repository.recoverStorage();
      setVerified(data);
      setRecovered(true);
      setMessage('저장 공간 복구 완료. 기존 기록과 수정 이력을 확인했습니다.');
    } catch (e) {
      setMessage(
        (e instanceof Error ? e.message : String(e)) +
          ' · 원본 보관본은 지우지 않았습니다. 복구를 다시 시도하거나 보관 원본을 백업하세요.',
      );
    } finally {
      setBusy(false);
    }
  };
  const archiveBackup = async () => {
    try {
      downloadFile(
        'TB-Manager-recovery-with-archives.json',
        await repository.exportRecoveryWithArchives(),
        'application/json',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <main className="fatal storage-recovery">
      <AlertCircle />
      <h1>
        {recovered
          ? '기존 기록을 복구했습니다'
          : quota
            ? '브라우저 저장 공간이 부족합니다'
            : '저장된 데이터를 확인해야 합니다'}
      </h1>
      <p>
        {recovered
          ? '기존 원본은 기기 내 보관소에 안전하게 보관했습니다.'
          : '기존 기록을 보존하고 있습니다.'}
      </p>
      {quota && !recovered && (
        <p>
          새 저장본을 만들 공간이 부족해 중단했습니다. 평가 척도 오류가 아닙니다. 아래에서 기존
          기록을 확인하고 백업할 수 있습니다.
        </p>
      )}
      {(quota || pending) && !recovered && (
        <section aria-label="저장 공간 복구">
          <p>
            다른 TB Manager 탭을 닫고 아래 버튼을 누르세요. 원본을 기기 내 보관소에 복사·검증한 뒤
            티볼의 중복 저장본을 정리합니다. 사진과 다른 앱의 데이터는 유지합니다.
          </p>
          <button className="primary" disabled={busy} onClick={() => void repair()}>
            {busy
              ? '원본 보관·공간 복구 중…'
              : pending
                ? '중단된 복구 이어하기'
                : '원본 보관 후 저장 공간 복구'}
          </button>
        </section>
      )}
      {recovered && (
        <button className="primary" onClick={() => location.reload()}>
          복구된 기록 열기
        </button>
      )}
      {repository.hasStorageArchive() && (
        <button disabled={busy} onClick={() => void archiveBackup()}>
          보관 원본 포함 백업
        </button>
      )}
      <details>
        <summary>상세 오류 · BETA {APP_VERSION}</summary>
        <pre>{error}</pre>
      </details>
      <div className="recovery-actions">
        <button
          onClick={() =>
            downloadFile(
              'TB-Manager-recovery.json',
              repository.recoverySnapshot(),
              'application/json',
            )
          }
        >
          원본 복구 파일 다운로드
        </button>
        <button disabled={busy} onClick={() => void inspect()}>
          기존 기록 확인
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {verified && (
        <section aria-label="검증된 기존 기록">
          <p>
            선수 {verified.players.length}명 · 경기 {verified.games.length}개 · 타격 평가{' '}
            {verified.battingAttempts.length}회 · 수비 관찰 {verified.defenseAssessments.length}건 ·
            펑고 평가 {verified.fungoAssessments.length}건
          </p>
          <button
            onClick={() =>
              downloadFile(
                'TB-Manager-verified-backup.json',
                serializeBackup(verified),
                'application/json',
              )
            }
          >
            검증된 기록 JSON 백업
          </button>
          <p>기록 원본과 수정 이력을 포함합니다. 사진은 기기 내 별도 저장소에 그대로 있습니다.</p>
        </section>
      )}
      <div className="recovery-actions">
        <button disabled={busy || update.checking} onClick={() => void update.check()}>
          앱 업데이트 확인
        </button>
        {update.available && (
          <button disabled={update.checking} onClick={() => void update.apply()}>
            새 버전 적용
          </button>
        )}
        <button disabled={busy} onClick={() => location.reload()}>
          다시 열기
        </button>
      </div>
      {update.message && <p role="status">{update.message}</p>}
      <p>백업을 보관하고 앱 삭제·사이트 데이터 초기화는 하지 마세요.</p>
    </main>
  );
}
