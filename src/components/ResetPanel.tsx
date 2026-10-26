import { useState, useRef } from 'react';
import type { Workspace } from '../domain/model';
import { RESET_LABELS, type ResetScope } from '../domain/reset';
import { serializeBackup, downloadFile } from '../data/repository';
import { serializePhotoBackup } from '../data/photoBackup';
import { photoRepository } from '../data/photos';
import { Panel, Modal } from './ui';
export function ResetPanel({
  data,
  onReset,
  onNotify,
}: {
  data: Workspace;
  onReset: (scope: ResetScope) => Promise<void>;
  onNotify: (m: string, error?: boolean) => void;
}) {
  const [scope, setScope] = useState<ResetScope>('records'),
    [open, setOpen] = useState(false),
    [password, setPassword] = useState(''),
    [text, setText] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [prepared, setPrepared] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const locked = useRef(false);
  const phrase = scope === 'all' ? '전체 초기화' : '기록 초기화';
  const run = async (task: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : '초기화 처리 실패');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <Panel title="기록 초기화" eyebrow="RESET WORKSPACE">
      <p>
        초기화할 범위를 직접 선택하세요. 선수 삭제·복원과 달리 초기화한 내용은 백업 파일로
        복원합니다.
      </p>
      <div className="reset-options">
        {(Object.keys(RESET_LABELS) as ResetScope[]).map((value) => (
          <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>
            {RESET_LABELS[value]}
          </button>
        ))}
      </div>
      <p className="hint">
        경기 기록만 초기화하면 해당 경기의 팀워크 관찰도 제외됩니다. 전체 초기화는 사진과 이전 버전
        저장본까지 지웁니다.
      </p>
      <button
        className="danger-button"
        onClick={() => {
          setPrepared(null);
          setConfirmed(false);
          setText('');
          setPassword('');
          setError('');
          setOpen(true);
        }}
      >
        초기화 준비
      </button>
      {data.lastReset && (
        <p className="hint">
          최근 초기화: {new Date(data.lastReset.at).toLocaleString()} ·{' '}
          {RESET_LABELS[data.lastReset.scope]}
        </p>
      )}
      {open && (
        <Modal
          title="초기화 범위 확인"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (prepared !== data.revision || !confirmed || text !== phrase) return;
              void run(async () => {
                await onReset(scope);
                setOpen(false);
                onNotify('선택한 범위를 초기화했습니다. 백업 파일은 보관하세요');
              });
            }}
          >
            <fieldset disabled={busy} className="plain-fieldset">
              <p>
                <b>{RESET_LABELS[scope]}</b>
              </p>
              <p>
                현재 팀 {data.teams.length}개 · 선수 {data.players.length}명 · 경기{' '}
                {data.games.length}개 · 기능평가 {data.assessments.length}건 · 타격 회차{' '}
                {data.battingAttempts.length}건
              </p>
              <p>
                {scope === 'all'
                  ? '팀·선수·사진·경기·평가·설정과 이 기기의 이전 버전 저장본을 비웁니다. 예시 선수는 다시 생성하지 않습니다.'
                  : '선수·팀·사진과 설정은 유지합니다. 선택한 기록만 비웁니다.'}
              </p>
              {scope === 'all' && (
                <label>
                  초기화 백업 암호
                  <input
                    type="password"
                    autoComplete="off"
                    minLength={10}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPrepared(null);
                      setConfirmed(false);
                    }}
                    placeholder="사진 포함 백업용 · 10자 이상"
                  />
                </label>
              )}
              <button
                type="button"
                disabled={scope === 'all' && password.length < 10}
                onClick={() =>
                  void run(async () => {
                    const backup =
                      scope === 'all'
                        ? await serializePhotoBackup(data, photoRepository, password)
                        : serializeBackup(data);
                    downloadFile(
                      'TB-Manager-before-reset-' + Date.now() + '.json',
                      backup,
                      'application/json',
                    );
                    setPrepared(data.revision);
                    setConfirmed(false);
                  })
                }
              >
                초기화 전 백업 다운로드
              </button>
              {prepared === data.revision && (
                <p role="status">
                  백업 파일을 만들었습니다. 파일 앱/다운로드에서 저장 여부를 확인하세요.
                </p>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={prepared !== data.revision}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                백업 파일이 저장된 것을 확인했습니다
              </label>
              <label>
                확인 문구
                <input
                  autoComplete="off"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={phrase + ' 입력'}
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <button
                type="submit"
                className="danger-button wide"
                disabled={busy || prepared !== data.revision || !confirmed || text !== phrase}
              >
                {phrase} 실행
              </button>
              <p className="hint">
                다른 탭의 기록이 바뀌면 백업부터 다시 진행해야 합니다. 처리 중 앱을 닫지 마세요.
              </p>
            </fieldset>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
