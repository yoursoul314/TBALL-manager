import { useEffect, useRef, useState } from 'react';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import { registrationApi, type RegistrationApi } from './api';
import { applicationInput, REGISTRATION_SETUP, type Invitation } from './model';
import './registration.css';

export default function StudentRegistration({
  api = registrationApi(),
}: {
  api?: RegistrationApi | null;
}) {
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('invite') ?? '');
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!api);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [receipt, setReceipt] = useState('');
  const [name, setName] = useState(''),
    [grade, setGrade] = useState(''),
    [classroom, setClassroom] = useState(''),
    [number, setNumber] = useState('');
  const [pref1, setPref1] = useState<Position | ''>(''),
    [pref2, setPref2] = useState<Position | ''>('');
  const [acknowledged, setAcknowledged] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!api) return;
    let alive = true;
    api
      .invitation(token)
      .then((info) => {
        if (!alive) return;
        setInvite(info);
        // Keep only a random retry identifier; no student's input goes into browser storage.
        try {
          const key = 'tb-registration.retry.' + info.id;
          const old = sessionStorage.getItem(key);
          if (old && /^[0-9a-f-]{36}$/.test(old))
            requestId.current = old as `${string}-${string}-${string}-${string}-${string}`;
          else sessionStorage.setItem(key, requestId.current);
        } catch {
          /* In-memory retry still works when storage is unavailable. */
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : '초대 링크를 확인하세요.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [api, token]);
  return (
    <main className="student-registration">
      <section className="registration-card">
        <p className="eyebrow">TB MANAGER · STUDENT REGISTRATION</p>
        <h1>티볼 선수 등록 신청</h1>
        {!api ? (
          <p role="status">{REGISTRATION_SETUP}</p>
        ) : loading ? (
          <p role="status">초대 링크를 확인하고 있습니다.</p>
        ) : receipt ? (
          <div role="status" className="registration-success">
            <h2>신청을 접수했습니다</h2>
            <p>선생님이 확인한 후 선수 명단에 반영됩니다. 중복 신청하지 않아도 됩니다.</p>
            <p>
              접수번호 <code>{receipt}</code>
            </p>
            <p>잘못 입력했다면 접수번호를 담당 선생님께 알려주세요.</p>
            <button
              type="button"
              onClick={() => {
                requestId.current = crypto.randomUUID();
                try {
                  if (invite)
                    sessionStorage.setItem('tb-registration.retry.' + invite.id, requestId.current);
                } catch {
                  /* Memory-only fallback. */
                }
                setReceipt('');
                setName('');
                setGrade('');
                setClassroom('');
                setNumber('');
                setPref1('');
                setPref2('');
                setAcknowledged(false);
                setError('');
              }}
            >
              다른 학생 등록 · 입력값 비우기
            </button>
          </div>
        ) : (
          invite && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (locked.current) return;
                setError('');
                const parsed = applicationInput.safeParse({
                  name,
                  grade: Number(grade),
                  classroom,
                  student_number: Number(number),
                  pref1: pref1 || null,
                  pref2: pref2 || null,
                  acknowledged,
                });
                if (!parsed.success) {
                  setError(parsed.error.issues[0].message);
                  return;
                }
                locked.current = true;
                setBusy(true);
                try {
                  const id = await api.submit(token, requestId.current, parsed.data);
                  setReceipt(id);
                  setName('');
                  setClassroom('');
                  setNumber('');
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : '전송하지 못했습니다. 입력 내용은 유지됩니다.',
                  );
                } finally {
                  locked.current = false;
                  setBusy(false);
                }
              }}
            >
              <h2>
                {invite.organization} · {invite.title}
              </h2>
              <p>마감 {new Date(invite.closes_at).toLocaleString('ko-KR')}</p>
              <fieldset disabled={busy} className="registration-fields">
                <label>
                  이름
                  <input
                    required
                    autoComplete="off"
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="registration-grid">
                  <label>
                    학년
                    <select required value={grade} onChange={(e) => setGrade(e.target.value)}>
                      <option value="">선택</option>
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
                      required
                      inputMode="numeric"
                      pattern="[0-9]{1,2}"
                      maxLength={2}
                      value={classroom}
                      onChange={(e) => setClassroom(e.target.value)}
                    />
                  </label>
                  <label>
                    번호
                    <input
                      required
                      type="number"
                      min={1}
                      max={999}
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                    />
                  </label>
                </div>
                <div className="registration-grid">
                  {(
                    [
                      [pref1, setPref1, '1지망'],
                      [pref2, setPref2, '2지망'],
                    ] as const
                  ).map(([value, set, label]) => (
                    <label key={label}>
                      {label} 포지션 (선택)
                      <select value={value} onChange={(e) => set(e.target.value as Position | '')}>
                        <option value="">미선택</option>
                        {POSITIONS.map((p) => (
                          <option key={p} value={p}>
                            {POSITION_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <section className="registration-notice" aria-label="등록 정보 처리 안내">
                  <h3>등록 전에 확인해 주세요</h3>
                  <p>{invite.privacy_notice}</p>
                  <p>
                    수집 항목: 이름·학년·반·번호, 선택한 희망 포지션. 신청은 접수일부터{' '}
                    {invite.retention_days}일간 서버에 보관하며 이후 삭제합니다. 승인 후 선생님
                    기기에 반영한 선수 기록은 선생님이 별도로 관리합니다.
                  </p>
                  <p>
                    사진·전화번호·주소는 이 페이지에서 받지 않습니다. 입력이 어렵거나 신청을 원하지
                    않으면 선생님께 직접 등록을 요청하세요.
                  </p>
                  <label className="registration-check">
                    <input
                      type="checkbox"
                      required
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    등록 안내를 확인했습니다.
                  </label>
                </section>
                <button className="primary registration-submit" type="submit">
                  {busy ? '전송 중…' : '등록 신청 보내기'}
                </button>
              </fieldset>
            </form>
          )
        )}
        {error && (
          <p role="alert" className="registration-error">
            {error}
          </p>
        )}
        <p className="hint">학생 신청 전용 · 다른 학생의 명단과 평가 기록은 표시하지 않습니다.</p>
      </section>
    </main>
  );
}
