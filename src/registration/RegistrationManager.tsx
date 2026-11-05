import { useEffect, useRef, useState } from 'react';
import { POSITION_LABELS } from '../config/positions';
import type { Workspace } from '../domain/model';
import { invitationLink, registrationApi, type RegistrationApi } from './api';
import { importApplication, matchingPlayers, type Application, type Cohort } from './model';
import './registration.css';

export default function RegistrationManager({
  data,
  onSave,
  api = registrationApi(),
}: {
  data: Workspace;
  onSave: (next: Workspace) => void;
  api?: RegistrationApi | null;
}) {
  const [loggedIn, setLoggedIn] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [cohorts, setCohorts] = useState<Cohort[]>([]),
    [cohortId, setCohortId] = useState('');
  const [rows, setRows] = useState<Application[]>([]),
    [link, setLink] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [title, setTitle] = useState('티볼 선수 등록'),
    [organization, setOrganization] = useState('');
  const [privacy, setPrivacy] = useState(''),
    [endDate, setEndDate] = useState('');
  const [retention, setRetention] = useState(30),
    [capacity, setCapacity] = useState(100);
  const [links, setLinks] = useState<Record<string, string>>({});
  useEffect(
    () => () => {
      void api?.signOut();
    },
    [api],
  );
  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패. 다시 시도하세요.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function refresh(id = cohortId) {
    if (!api) return;
    const all = await api.cohorts();
    setCohorts(all);
    const selected = all.some((c) => c.id === id) ? id : (all[0]?.id ?? '');
    setCohortId(selected);
    setRows(selected ? await api.applications(selected) : []);
  }
  const current = cohorts.find((c) => c.id === cohortId);
  return (
    <section className="registration-manager" aria-label="학생 온라인 등록 관리">
      <h2>학생 온라인 등록</h2>
      <p>초대 링크 공유 → 학생 신청 → 감독 확인 → 이 기기의 선수 명단에 추가</p>
      {!api ? (
        <div className="callout" role="status">
          <b>Supabase 연결 준비가 필요합니다.</b>
          <p>
            서버 프로젝트·교사 계정·접근 권한을 설정하면 사용할 수 있습니다. 연결 전에는 신청을
            받거나 기존 기록을 서버로 보내지 않습니다.
          </p>
          <a
            href="https://github.com/yoursoul314/TBALL-manager/blob/main/docs/STUDENT_REGISTRATION.md"
            target="_blank"
            rel="noreferrer"
          >
            서버 연결 안내 열기
          </a>
        </div>
      ) : !loggedIn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await api.signIn(email, password);
              setPassword('');
              setLoggedIn(true);
              await refresh();
            });
          }}
        >
          <div className="registration-grid">
            <label>
              교사 이메일
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              교사 비밀번호
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <button className="primary" disabled={busy}>
            교사 로그인
          </button>
          <p className="hint">
            서버에 등록된 교사만 접속합니다. 로그인 정보는 백업이나 브라우저 저장소에 저장하지
            않습니다.
          </p>
        </form>
      ) : (
        <>
          <div className="button-row">
            <button disabled={busy} onClick={() => void action(() => refresh())}>
              신청함 새로고침
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api.signOut();
                  setLoggedIn(false);
                  setRows([]);
                  setCohorts([]);
                  setLink('');
                  setLinks({});
                  setPassword('');
                })
              }
            >
              교사 로그아웃
            </button>
          </div>
          <details className="registration-create">
            <summary>새 학생 접수 만들기</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const closes = new Date(endDate);
                  if (
                    !endDate ||
                    !Number.isFinite(closes.getTime()) ||
                    closes.getTime() <= Date.now()
                  )
                    throw Error('미래의 마감 날짜·시간을 선택하세요.');
                  const created = await api.createCohort({
                    title,
                    organization,
                    privacy_notice: privacy,
                    closes_at: closes.toISOString(),
                    retention_days: retention,
                    max_applications: capacity,
                  });
                  setLink(invitationLink(created.token));
                  await refresh(created.id);
                  setNotice('접수를 만들었습니다. 초대 링크를 학생에게 공유하세요.');
                });
              }}
            >
              <fieldset disabled={busy} className="registration-fields">
                <div className="registration-grid">
                  <label>
                    접수 이름
                    <input
                      required
                      maxLength={100}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    학교·수업 이름
                    <input
                      required
                      maxLength={100}
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                    />
                  </label>
                  <label>
                    접수 마감 (현지 시각)
                    <input
                      required
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </label>
                  <label>
                    신청 보관 일수
                    <input
                      required
                      type="number"
                      min={1}
                      max={90}
                      value={retention}
                      onChange={(e) => setRetention(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    최대 신청 인원
                    <input
                      required
                      type="number"
                      min={1}
                      max={500}
                      value={capacity}
                      onChange={(e) => setCapacity(Number(e.target.value))}
                    />
                  </label>
                </div>
                <label>
                  학생에게 보여줄 수집 목적·문의처·처리 안내
                  <textarea
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value)}
                    placeholder="수집 목적, 담당자 문의 방법, 승인 후 기록의 보관·삭제 기준을 학교 방침에 맞춰 작성하세요."
                  />
                </label>
                <p className="hint">
                  실제 학생 접수 전 학교의 개인정보 처리 절차를 확인하세요. 안내 확인 체크는 법정
                  동의 절차를 대신하지 않습니다. 사진은 수집하지 않습니다.
                </p>
                <button className="primary">접수 만들기 · 초대 링크 발급</button>
              </fieldset>
            </form>
          </details>
          {link && (
            <div className="registration-link">
              <label>
                학생 초대 링크
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await navigator.clipboard.writeText(link);
                    setNotice('초대 링크를 복사했습니다.');
                  })
                }
              >
                링크 복사
              </button>
              <p>이 링크를 받은 학생은 신청할 수 있습니다. 담당 학급에만 공유하세요.</p>
            </div>
          )}
          <label>
            학생 접수 선택
            <select
              disabled={busy}
              value={cohortId}
              onChange={(e) => {
                const id = e.target.value;
                setLink('');
                void action(() => refresh(id));
              }}
            >
              <option value="">접수를 선택하세요</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {!c.enabled ? ' · 마감' : ''}
                </option>
              ))}
            </select>
          </label>
          {current && (
            <div className="button-row">
              <p>
                {current.organization} · 마감 {new Date(current.closes_at).toLocaleString('ko-KR')}{' '}
                · 대기 {rows.filter((r) => r.status === 'pending').length}명
              </p>
              <button
                disabled={
                  busy || !current.enabled || new Date(current.closes_at).getTime() <= Date.now()
                }
                onClick={() =>
                  void action(async () => {
                    setLink(invitationLink(await api.rotateLink(cohortId)));
                    setNotice(
                      '새 링크를 발급했습니다. 이전 초대 링크는 더 이상 사용할 수 없습니다.',
                    );
                  })
                }
              >
                초대 링크 재발급 (기존 링크 만료)
              </button>
              <button
                disabled={busy || !current.enabled}
                onClick={() =>
                  void action(async () => {
                    await api.closeCohort(cohortId);
                    setLink('');
                    await refresh();
                    setNotice('접수를 마감했습니다. 기존 신청은 보존됩니다.');
                  })
                }
              >
                접수 마감
              </button>
            </div>
          )}
          <div className="registration-requests">
            {rows.map((row) => {
              const existing = matchingPlayers(data, row);
              const imported = row.player_id
                ? data.players.find((p) => p.id === row.player_id)
                : null;
              const conflict = !imported && existing.length > 0;
              return (
                <article
                  className="registration-request"
                  key={row.id}
                  aria-label={row.name + ' 등록 신청'}
                >
                  <h3>
                    {row.name}{' '}
                    <small>
                      {row.grade}학년 {row.classroom}반 {row.student_number}번
                    </small>
                  </h3>
                  <p>
                    1지망 {row.pref1 ? POSITION_LABELS[row.pref1] : '미선택'} · 2지망{' '}
                    {row.pref2 ? POSITION_LABELS[row.pref2] : '미선택'}
                  </p>
                  <p>
                    {row.status === 'pending'
                      ? '승인 대기'
                      : row.status === 'rejected'
                        ? '반려'
                        : '승인 완료'}{' '}
                    · 서버 보관 {new Date(row.expires_at).toLocaleDateString('ko-KR')}까지
                  </p>
                  {imported ? (
                    <p role="status">
                      {imported.archivedAt
                        ? '이미 반영된 삭제 선수입니다. 선수 휴지통에서 확인하세요.'
                        : '이 기기 명단에 반영됨 · 기존 선수 정보 유지'}
                    </p>
                  ) : (
                    <>
                      {conflict && (
                        <label>
                          동일 학년·반·번호 선수 확인
                          <select
                            disabled={busy || row.status === 'approved'}
                            value={links[row.id] ?? ''}
                            onChange={(e) => setLinks({ ...links, [row.id]: e.target.value })}
                          >
                            <option value="">동일 학생인지 직접 확인 후 선택</option>
                            {existing
                              .filter((p) => !p.archivedAt)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} · 기존 ID {p.id}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      {conflict && (
                        <p className="hint">
                          기존 정보·경기·평가를 덮어쓰지 않습니다. 다른 학생이면 선수 화면에서
                          학년·반·번호를 먼저 확인하세요. 승인 후 새 기기에서 충돌하면 원래 기기의
                          백업을 먼저 복원하세요.
                        </p>
                      )}
                      <div className="button-row">
                        <button
                          className="primary"
                          disabled={
                            busy || (conflict && (!links[row.id] || row.status === 'approved'))
                          }
                          onClick={() =>
                            void action(async () => {
                              const approved =
                                row.status === 'approved'
                                  ? row
                                  : await api.review(row.id, true, links[row.id]);
                              // Keep server approval visible even if local quota/write fails. Retry this same ID.
                              setRows((old) => old.map((r) => (r.id === row.id ? approved : r)));
                              const next = importApplication(data, approved);
                              if (next !== data) onSave(next);
                              setNotice('선수 명단에 반영했습니다. 팀은 경기 생성 시 배정하세요.');
                            })
                          }
                        >
                          {row.status === 'approved'
                            ? '이 기기 명단에 반영'
                            : conflict
                              ? '기존 선수로 연결 · 승인'
                              : '승인 · 선수 추가'}
                        </button>
                        {row.status !== 'approved' && (
                          <button
                            disabled={busy || row.status === 'rejected'}
                            onClick={() =>
                              void action(async () => {
                                const reviewed = await api.review(row.id, false);
                                setRows((old) => old.map((r) => (r.id === row.id ? reviewed : r)));
                                setNotice(
                                  '신청을 반려했습니다. 보관 기간 안에는 다시 승인할 수 있습니다.',
                                );
                              })
                            }
                          >
                            반려
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
          {cohortId && !rows.length && <p>접수된 신청이 없습니다.</p>}
          <p className="hint">
            승인 후 추가는 현재 기기에 적용됩니다. 다른 기기는 승인된 신청을 다시 불러올 수
            있습니다. 경기·평가 전체 동기화 기능은 아닙니다.
          </p>
        </>
      )}
      {notice && (
        <p role="status" className="registration-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="registration-error">
          {error}
        </p>
      )}
    </section>
  );
}
