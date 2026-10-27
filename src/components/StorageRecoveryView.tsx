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
  const quota = isQuotaError(new Error(error));
  const inspect = () => {
    try {
      const data = repository.load(false);
      if (!data) throw Error('읽을 기존 기록이 없습니다');
      setVerified(data);
      setMessage('기존 기록 검증 완료 · 저장소에 쓰지 않고 확인했습니다.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '원본 확인 실패');
    }
  };
  return (
    <main className="fatal storage-recovery">
      <AlertCircle />
      <h1>{quota ? '브라우저 저장 공간이 부족합니다' : '저장된 데이터를 확인해야 합니다'}</h1>
      <p>기존 데이터를 덮어쓰지 않았습니다.</p>
      {quota && (
        <p>
          새 저장본을 만들 공간이 부족해 중단했습니다. 평가 척도 오류가 아닙니다. 아래에서 기존
          기록을 확인하고 백업할 수 있습니다.
        </p>
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
        <button onClick={inspect}>기존 기록 확인</button>
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
        <button disabled={update.checking} onClick={() => void update.check()}>
          앱 업데이트 확인
        </button>
        {update.available && (
          <button disabled={update.checking} onClick={() => void update.apply()}>
            새 버전 적용
          </button>
        )}
        <button onClick={() => location.reload()}>다시 열기</button>
      </div>
      {update.message && <p role="status">{update.message}</p>}
      <p>백업을 보관하고 앱 삭제·사이트 데이터 초기화는 하지 마세요.</p>
    </main>
  );
}
