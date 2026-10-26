import { useState } from 'react';
import type { Workspace } from '../domain/model';
import { photoRepository, type PhotoRecord } from '../data/photos';
import {
  readPhotoBackup,
  serializePhotoBackup,
  restorePhotosAndWorkspace,
} from '../data/photoBackup';
import { downloadFile } from '../data/repository';
import { localDate } from '../domain/roster';
import { Modal, Panel } from './ui';
export function PhotoBackupPanel({
  data,
  onSave,
  onNotify,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onNotify: (m: string, error?: boolean) => void;
}) {
  const [include, setInclude] = useState(false),
    [password, setPassword] = useState(''),
    [fileText, setFileText] = useState(''),
    [busy, setBusy] = useState(false),
    [restoring, setRestoring] = useState<{ workspace: Workspace; photos: PhotoRecord[] } | null>(
      null,
    );
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '사진 백업 처리 실패', true);
    } finally {
      setBusy(false);
    }
  };
  const exportProtected = async () =>
    downloadFile(
      'TB-Manager-protected-' + localDate() + '.json',
      await serializePhotoBackup(data, photoRepository, password),
      'application/json',
    );
  return (
    <Panel title="사진 백업 · 선택" eyebrow="LOCAL PHOTOS">
      <p>
        일반 JSON 백업에는 사진이 없습니다. 사진을 포함할 때는 암호화된 파일로 내려받습니다. 사진과
        암호는 서버로 전송하지 않습니다.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => setInclude(e.target.checked)}
          disabled={busy}
        />
        사진을 포함한 암호화 백업 만들기
      </label>
      <label>
        사진 백업 암호
        <input
          type="password"
          autoComplete="off"
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="10자 이상 · 별도 안전한 곳에 보관"
        />
      </label>
      <p className="hint">
        암호를 잃어버리면 복원할 수 없습니다. 일반 JSON과 이 기기의 사진 저장소 자체는 암호화되지
        않습니다. 실제 학생 사진 사용 전 기기·동의·접근 권한을 확인하세요.
      </p>
      {include && (
        <button
          className="primary"
          disabled={busy || password.length < 10}
          onClick={() =>
            void run(async () => {
              await exportProtected();
              onNotify('사진 포함 암호화 백업을 내려받았습니다');
            })
          }
        >
          사진 포함 암호화 백업
        </button>
      )}
      <div className="button-row">
        <label className="button file-button">
          사진 포함 백업 선택
          <input
            aria-label="암호화 사진 백업 파일"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > 100_000_000) {
                onNotify('100MB 이하 파일만 지원합니다', true);
                return;
              }
              setFileText(await file.text());
            }}
          />
        </label>
        <button
          disabled={busy || !fileText || !password}
          onClick={() =>
            void run(async () => setRestoring(await readPhotoBackup(fileText, password)))
          }
        >
          암호로 백업 확인
        </button>
      </div>
      {restoring && (
        <Modal
          title="사진 포함 백업 복원"
          onClose={() => {
            if (!busy) setRestoring(null);
          }}
        >
          <p>
            선수 {restoring.workspace.players.length}명 · 사진 {restoring.photos.length}장. 현재
            기록과 사진을 교체합니다. 먼저 현재 기록·사진의 암호화 백업을 다운로드합니다.
          </p>
          <button
            className="primary wide"
            disabled={busy || password.length < 10}
            onClick={() =>
              void run(async () => {
                await exportProtected();
                await restorePhotosAndWorkspace(
                  photoRepository,
                  restoring.photos,
                  { ...restoring.workspace, revision: data.revision },
                  onSave,
                );
                setRestoring(null);
                setFileText('');
                setPassword('');
                onNotify('사진과 경기 기록을 복원했습니다');
              })
            }
          >
            현재 기록·사진 백업 후 복원
          </button>
        </Modal>
      )}
    </Panel>
  );
}
