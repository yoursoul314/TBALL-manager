import { useState } from 'react';
import { Download, Upload, ShieldCheck } from 'lucide-react';
import type { Workspace } from '../domain/model';
import { RULES } from '../config/rules';
import { ABILITIES, POSITIONS, POSITION_LABELS, POSITION_WEIGHTS } from '../config/positions';
import { readBackup, serializeBackup, downloadFile } from '../data/repository';
import { Badge, Panel, Modal } from './ui';
export function SettingsView({
  data,
  onSave,
  onNotify,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onNotify: (m: string, error?: boolean) => void;
}) {
  const [restoring, setRestoring] = useState<Workspace | null>(null);
  const backup = () =>
    downloadFile(
      'TB-Manager-backup-' + new Date().toISOString().slice(0, 10) + '.json',
      serializeBackup(data),
      'application/json',
    );
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">RULES & WORKSPACE</div>
          <h1>
            흔들리지 않는 기준<span className="title-dot">.</span>
          </h1>
          <p>확정 규칙은 그대로, 결정이 필요한 항목은 명확하게.</p>
        </div>
        <Badge tone="neutral">v0.2.0</Badge>
      </div>
      <div className="two-col">
        <Panel title="저장과 백업" eyebrow="YOUR DATA">
          <div className="storage-status">
            <ShieldCheck size={30} />
            <div>
              <b>이 브라우저에 저장</b>
              <p>자동 기기 간 동기화는 아직 지원하지 않습니다.</p>
            </div>
          </div>
          <p className="muted">
            기기를 바꾸려면 JSON 백업을 내보내고 새 기기에서 복원하세요. 앱 삭제나 브라우저 데이터
            삭제 전에 백업을 보관하세요.
          </p>
          <div className="button-row">
            <button className="primary" onClick={backup}>
              <Download size={17} />
              JSON 백업
            </button>
            <label className="button file-button">
              <Upload size={17} />
              백업 불러오기
              <input
                aria-label="백업 파일 선택"
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 10_000_000) throw new Error('10MB 이하 파일만 지원합니다');
                    setRestoring(readBackup(await file.text()));
                  } catch (error) {
                    onNotify(error instanceof Error ? error.message : '백업 읽기 실패', true);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="callout">
            현재 리비전 {data.revision} · 경기 {data.games.length}개 · 이벤트 {data.events.length}개
            <br />
            정정 이력과 평가 정책도 백업에 포함됩니다. v1·v2 백업을 읽을 수 있고 내보내기는
            v2입니다. v2 백업은 구버전 앱에서 열 수 없습니다. 이전 팀워크{' '}
            {data.legacyTeamwork.length}건을 보존하고 있습니다.
          </div>
        </Panel>
        <Panel title="PWA · 어디서든 준비" eyebrow="IPAD & DESKTOP">
          <div className="pwa-art">
            <span>TB</span>
            <div>
              <b>TB Manager</b>
              <small>티볼 통합 매니지먼트 시스템</small>
            </div>
          </div>
          <p>
            iPad Safari의 공유 메뉴에서 <b>홈 화면에 추가</b>하세요. PC에서는 주소창의 앱 설치
            메뉴를 사용할 수 있습니다.
          </p>
          <p className="muted">
            온라인에서 처음 실행한 뒤 앱 화면을 오프라인으로 사용할 수 있습니다. 기록은 기기별로
            분리됩니다.
          </p>
          <Badge tone="amber">서버 동기화 · 로그인 TODO</Badge>
        </Panel>
      </div>
      <Panel
        title="평가 정책 초안"
        eyebrow="OPEN DECISIONS"
        action={<Badge tone="amber">모든 변경은 TODO 초안으로 저장</Badge>}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const n = (k: string) => Number(f.get(k));
            const next = structuredClone(data.policy);
            next.version = 'draft-' + crypto.randomUUID().slice(0, 8);
            next.domainWeights.value = {
              batting: n('batting'),
              defense: n('defense'),
              running: n('running'),
              teamwork: n('teamwork'),
            };
            next.battingMix.value = { skill: n('battingSkill'), game: 100 - n('battingSkill') };
            next.defenseMix.value = { skill: n('defenseSkill'), game: 100 - n('defenseSkill') };
            next.sacrificeFly.value = String(f.get('sacrifice')) as typeof next.sacrificeFly.value;
            next.incompleteInnings.value = String(
              f.get('incomplete'),
            ) as typeof next.incompleteInnings.value;
            for (const key of [
              'domainWeights',
              'battingMix',
              'defenseMix',
              'conversion',
              'sacrificeFly',
              'incompleteInnings',
            ] as const)
              next[key].status = 'TODO';
            onSave({ ...data, policy: next });
          }}
        >
          <div className="policy-grid">
            {(['batting', 'defense', 'running', 'teamwork'] as const).map((key, i) => (
              <label key={key}>
                {['타격', '수비', '주루', '팀워크'][i]} 영역 비율 (%)
                <input
                  name={key}
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={data.policy.domainWeights.value[key]}
                  required
                />
              </label>
            ))}
          </div>
          <div className="form-row">
            <label>
              타격 기능 비율 (%)
              <input
                type="number"
                name="battingSkill"
                min="0"
                max="100"
                defaultValue={data.policy.battingMix.value.skill}
                required
              />
            </label>
            <label>
              수비 기능 비율 (%)
              <input
                type="number"
                name="defenseSkill"
                min="0"
                max="100"
                defaultValue={data.policy.defenseMix.value.skill}
                required
              />
            </label>
            <label>
              주루 기능 / 실전 (확정)
              <input value="40% / 60%" disabled readOnly />
            </label>
          </div>
          <div className="form-row">
            <label>
              희생플라이 임시 처리
              <select name="sacrifice" defaultValue={data.policy.sacrificeFly.value}>
                <option value="exclude-from-at-bats">타수 제외</option>
                <option value="include-in-at-bats">타수 포함</option>
              </select>
            </label>
            <label>
              선발용 통계의 미완료 이닝
              <select name="incomplete" defaultValue={data.policy.incompleteInnings.value}>
                <option value="exclude">양 팀 완료 이닝만 포함</option>
                <option value="include">미완료 이닝도 포함</option>
              </select>
            </label>
          </div>
          <p className="hint">
            전체 기록 통계는 미완료 이닝도 보존합니다. 위 설정은 선발용 통계에만 적용하며 승패
            계산에는 영향을 주지 않습니다. 실측 환산표는 별도 결정 대기 중입니다.
          </p>
          <button className="primary">정책 초안 저장</button>
        </form>
      </Panel>
      <Panel title="확정 경기 규칙" eyebrow="RULEBOOK · READ ONLY">
        <div className="rule-list">
          {Object.entries(RULES).map(([id, text]) => (
            <div key={id}>
              <code>{id}</code>
              <p>{text}</p>
              <ShieldCheck size={18} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="TYPE1 포지션 가중치 v2.0" action={<Badge>확정 · 행 합계 100</Badge>}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>포지션</th>
                {ABILITIES.map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POSITIONS.map((p) => (
                <tr key={p}>
                  <td>{POSITION_LABELS[p]}</td>
                  {POSITION_WEIGHTS[p].map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {restoring && (
        <Modal title="백업 복원 미리보기" onClose={() => setRestoring(null)}>
          <p>
            선수 <b>{restoring.players.length}명</b>, 경기 <b>{restoring.games.length}개</b>, 이벤트{' '}
            <b>{restoring.events.length}개</b>의 구조와 경기 재생을 검증했습니다.
          </p>
          <div className="callout amber">
            현재 작업공간을 이 백업으로 교체합니다. 버튼을 누르면 먼저 현재 데이터의 백업을
            다운로드합니다.
          </div>
          <button
            className="primary wide"
            onClick={() => {
              backup();
              onSave({ ...restoring, revision: data.revision });
              setRestoring(null);
            }}
          >
            현재 데이터 백업 후 복원
          </button>
        </Modal>
      )}
    </>
  );
}
