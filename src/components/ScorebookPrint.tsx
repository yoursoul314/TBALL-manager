import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Game, Side, Workspace } from '../domain/model';
import { POSITIONS, POSITION_LABELS } from '../config/positions';
import { gameTeamName } from '../domain/roster';
import { buildScorebook, chunks } from '../statistics/scorebook';
import printCss from './scorebook.css?raw';
import './scorebook.css';

export interface ScorebookOptions {
  filled: boolean;
  details: boolean;
  blankPages: number;
}
export function ScorebookPages({
  data,
  game,
  options,
}: {
  data: Workspace;
  game: Game;
  options: ScorebookOptions;
}) {
  const book = buildScorebook(game, data);
  const innings = Array.from({ length: game.innings }, (_, i) => i + 1);
  const header = (title: string) => (
    <header className="scorebook-page-header">
      <div>
        <b>TB MANAGER · 티볼 경기 기록지</b>
        <h2>{title}</h2>
      </div>
      <div>
        {game.name}
        <br />
        경기일 {game.playedOn ?? '__________'}
        {game.dateStatus === 'estimated' ? ' (추정 · 확인 필요)' : ''}　시작{' '}
        {game.startTime || '____:____'}
        <br />
        {gameTeamName(game, data, 'away')} (선공) vs {gameTeamName(game, data, 'home')} (후공)
      </div>
    </header>
  );
  const footer = (
    <footer className="scorebook-footer">
      경기 ID: {game.id} ·{' '}
      {options.filled ? '현재 유효 기록 사본 · 미확정 플레이 제외' : '현장 수기용 · 빈칸은 미기록'}{' '}
      · 기록원 __________ 감독 확인 __________
    </footer>
  );
  const legend = (
    <p className="scorebook-legend">
      1H 1루타 · 2H 2루타 · 3H 3루타 · HR 홈런 · OUT 아웃 · K 삼진 · E 실책 출루 · FC 야수선택 · SF
      희생플라이(집계 정책 확인) / S 스트라이크 · F 파울 / R 득점 · H 안타 · RBI 타점 · PO 자살 · A
      보살
    </p>
  );
  const rules = (
    <p className="scorebook-rules">
      전원 1회 타격 후 교대(3아웃 교대 아님), 잔루 승계 / 세 번째 스트라이크·파울은 삼진 / 마지막
      타자 1루 포스아웃: 해당 타격 진루·득점 취소 / 심판 타임 후 확정 / 리드·도루·슬라이딩 금지 /
      태그업·추가 진루 의사 없는 오버런 허용 / 경기장 밖 악송구 안전진루권 1개 / 잔루 타자
      임시주자는 감독 지정 / 볼 데드 교체·재출전, 타순 자리 승계 / 양 팀 동일 완료 이닝만 승패 반영,
      무승부 허용·콜드 없음
    </p>
  );
  const logs = options.filled
    ? chunks(book.plays, 3)
    : Array.from({ length: options.blankPages }, () => []);
  const changePages = options.filled ? chunks(book.changes, 8) : [[]];
  return (
    <div className="scorebook-pages">
      {(['away', 'home'] as Side[]).flatMap((side) =>
        chunks(game.lineups[side], 10).flatMap((lineup, rosterPage) =>
          chunks(innings, 5).map((is) => {
            const sidePlays = book.plays.filter((p) => p.side === side);
            return (
              <section
                className="scorebook-page"
                key={`${side}-${rosterPage}-${is[0]}`}
                aria-label={`${side === 'away' ? '선공' : '후공'} ${is[0]}회 기록지`}
              >
                {header(
                  `${gameTeamName(game, data, side)} · ${side === 'away' ? '선공' : '후공'} / ${is[0]}–${is.at(-1)}회`,
                )}
                <div className="scorebook-meta">
                  장소 __________________　날씨 __________　심판 __________　기록원 __________　총{' '}
                  {game.innings}이닝 / 타순 {rosterPage * 10 + 1}–{rosterPage * 10 + lineup.length}
                  번
                </div>
                <table className="scorebook-grid">
                  <thead>
                    <tr>
                      <th className="sb-order">타순</th>
                      <th className="sb-player">
                        선수 · 등번호
                        <br />
                        시작 수비 위치
                      </th>
                      {is.map((n) => (
                        <th key={n}>{n}회</th>
                      ))}
                      <th className="sb-total">PA</th>
                      <th className="sb-total">H</th>
                      <th className="sb-total">RBI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineup.map((id, index) => {
                      const slot = rosterPage * 10 + index + 1;
                      const rows = sidePlays.filter((p) => p.slot === slot);
                      const pos = Object.entries(game.entry?.defense[side] ?? {}).find(
                        ([, pid]) => pid === id,
                      )?.[0];
                      return (
                        <tr key={slot}>
                          <th>{slot}</th>
                          <td className="sb-player">
                            {book.name(id)}
                            <small>{pos || '미배치'} / 교체: __________</small>
                          </td>
                          {is.map((n) => {
                            const p = rows.find((r) => r.inning === n);
                            return (
                              <td
                                key={n}
                                className={`scorebook-cell${options.filled && p ? '' : ' scorebook-cell-blank'}`}
                              >
                                {options.filled && p ? (
                                  <>
                                    <b>
                                      {p.code} · {p.batterId !== id ? p.batter : ''}
                                    </b>
                                    <span>
                                      No.{p.number} / {p.pitches} / R {p.runs.length} / RBI {p.rbi}
                                    </span>
                                    {p.cancelledAdvances && <span>RULE02 진루·득점 취소</span>}
                                  </>
                                ) : (
                                  <>
                                    <span className="scorebook-diamond" aria-hidden="true">
                                      ◇
                                    </span>
                                    <span>결과 __　S/F __</span>
                                    <span>R __　RBI __　No.__</span>
                                  </>
                                )}
                              </td>
                            );
                          })}
                          <td>{options.filled ? rows.length : ''}</td>
                          <td>
                            {options.filled
                              ? rows.filter((p) =>
                                  ['single', 'double', 'triple', 'home-run'].includes(p.result),
                                ).length
                              : ''}
                          </td>
                          <td>{options.filled ? rows.reduce((s, p) => s + p.rbi, 0) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>이닝 득점</th>
                      {is.map((n) => (
                        <td key={n}>
                          {options.filled
                            ? book.state.completed[side] >= n ||
                              sidePlays.some((p) => p.inning === n)
                              ? sidePlays
                                  .filter((p) => p.inning === n)
                                  .reduce((s, p) => s + p.runs.length, 0)
                              : '—'
                            : ''}
                        </td>
                      ))}
                      <td colSpan={3}>
                        총 득점 {options.filled ? book.score.total[side] : '____'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <div className="scorebook-defense">
                  {POSITIONS.map((pos) => (
                    <span key={pos}>
                      <b>
                        {pos} {POSITION_LABELS[pos]}
                      </b>
                      <br />
                      {game.entry?.defense[side][pos]
                        ? book.name(game.entry.defense[side][pos]!)
                        : '________________'}
                    </span>
                  ))}
                </div>
                <p className="scorebook-bench">
                  교체 후보:{' '}
                  {game.rosters[side]
                    .filter((id) => !game.lineups[side].includes(id))
                    .map(book.name)
                    .join(' / ') || '없음'}
                  　·　정식 교체 / 임시주자 / 수비 변경은 별지에 기록
                </p>
                <p>
                  승패 반영 점수{' '}
                  {options.filled
                    ? `${book.score.official.away} : ${book.score.official.home} (양 팀 완료 ${book.score.completedInnings}이닝)`
                    : '선공 ____ : 후공 ____ / 양 팀 완료 ____이닝'}
                  　· PA/H/RBI는 타순 자리의 전체 이닝 합계, R은 해당 타석에서 발생한 팀 득점
                </p>
                {legend}
                {rules}
                {footer}
              </section>
            );
          }),
        ),
      )}
      {options.details &&
        logs.map((rows, page) => (
          <section
            className="scorebook-page"
            key={'log' + page}
            aria-label={`플레이 상세 기록지 ${page + 1}`}
          >
            {header(`플레이 상세 기록지 · ${page + 1}`)}
            <p>
              타석마다 순번을 매기세요. 모든 주자의 최종 위치·아웃 종류/위치, 타점 인정, 심판 타임을
              확인합니다. 관찰하지 못한 수비는 빈칸으로 둡니다.
            </p>
            <table className="scorebook-log">
              <thead>
                <tr>
                  <th>
                    No. / 이닝·초말
                    <br />
                    타순·타자 / S·F
                  </th>
                  <th>
                    타격 결과 / 타구
                    <br />
                    득점·타점
                  </th>
                  <th>
                    주자별 최종 결과 (타자 포함)
                    <br />
                    1·2·3루 / 홈 / 아웃 종류·위치
                  </th>
                  <th>
                    수비 관여 순서 · PO/A/E
                    <br />
                    실책 추가 진루 · 심판 타임
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: options.filled ? rows.length : 6 }, (_, i) => {
                  const p = rows[i];
                  return (
                    <tr key={i}>
                      <td>
                        {p ? (
                          <>
                            No.{p.number} / {p.inning}회 {p.side === 'away' ? '초' : '말'}
                            <br />
                            {p.slot}번 {p.batter}
                            <br />
                            {p.pitches}
                          </>
                        ) : (
                          <>
                            No. ____ / ____회 초·말
                            <br />
                            ____번 ______________
                            <br />
                            S/F ____ / 전산입력 □
                          </>
                        )}
                      </td>
                      <td>
                        {p ? (
                          <>
                            {p.code}
                            <br />
                            {p.direction
                              ? { left: '좌', center: '중', right: '우' }[p.direction]
                              : '방향 미기록'}{' '}
                            /{' '}
                            {p.quality
                              ? { ground: '땅볼', line: '직선타', fly: '뜬공' }[p.quality]
                              : '유형 미기록'}
                            <br />R {p.runs.length} / RBI {p.rbi}
                          </>
                        ) : (
                          <>
                            결과 __________
                            <br />
                            방향·유형 _________
                            <br />R ____ / RBI ____
                          </>
                        )}
                      </td>
                      <td className="scorebook-pre">
                        {p
                          ? `직전: ${p.before}\n${p.runners}`
                          : '타자 ______________________________\n주자 ______________________________\n주자 ______________________________\n주자 ______________________________\n타점 인정 득점 주자: _______________'}
                      </td>
                      <td className="scorebook-pre">
                        {p
                          ? `${p.defense}\n${p.result === 'strikeout' ? '카운트 삼진' : '심판 타임 확인됨'}`
                          : '수비수·행동 → 수비수·행동\n________________________________\nPO ______ A ______ E ______\n실책진루: 주자 ____ / ____→____\n심판 타임 □ / RULE02 □'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {legend}
            {rules}
            {footer}
          </section>
        ))}
      {options.details &&
        changePages.map((rows, page) => (
          <section className="scorebook-page" key={'changes' + page} aria-label="교체·판정 기록지">
            {header('교체·특수 판정 / 종이 기록 등록 안내')}
            <table className="scorebook-changes">
              <thead>
                <tr>
                  <th>시점 · 다음 타순</th>
                  <th>정식 교체 / 임시주자 / 수비 위치 변경 / 위반 / 종료 판정</th>
                  <th>감독 확인 · 입력 확인</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: options.filled ? rows.length : 8 }, (_, i) => (
                  <tr key={i}>
                    <td>{rows[i]?.at ?? '____회 초·말 / ____번 전'}</td>
                    <td>{rows[i]?.text ?? ''}</td>
                    <td>________ / □</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ol className="scorebook-instructions">
              <li>
                경기 기록실에서 위 경기 ID·날짜·팀·타순이 같은 경기를 엽니다. 새 경기를 중복
                생성하지 마세요.
              </li>
              <li>
                「종이 기록 입력 안내」를 켜고 현재 이닝·타순과 마지막 입력 플레이를 확인합니다.
                이미 입력한 타석은 「플레이 수정 · 이력」에서 정정합니다.
              </li>
              <li>
                종이 순번대로 S/F, 타격 결과 → 모든 주자 최종 위치·아웃 → 타점 인정 → 당시 심판 타임
                확인 → 플레이 확정 순서로 입력합니다.
              </li>
              <li>
                정식 교체·임시주자·수비 변경은 종이에 적힌 시점에 입력합니다. 정식 교체는 타순 자리
                승계, 임시주자는 별도 지정입니다.
              </li>
              <li>
                득점 합계·안타·타점·잔루와 양 팀 완료 이닝을 대조한 후 경기 종료를 기록합니다. 종이
                원본도 보관하세요.
              </li>
            </ol>
            <p>
              빈 공통 양식을 사용했다면 같은 날짜·팀·엔트리로 새 경기를 만든 뒤 경기 ID를
              기입하세요. 사진·스캔 자동 인식 및 일괄 업로드는 제공하지 않습니다. 전산 입력은 기존
              규칙 검증·원본 이벤트·수정 이력을 사용합니다.
            </p>
            {rules}
            {footer}
          </section>
        ))}
    </div>
  );
}

export function scorebookHtml(data: Workspace, game: Game, options: ScorebookOptions) {
  return (
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TB Manager 경기 기록지</title><style>' +
    printCss +
    '</style></head><body class="scorebook-document"><main class="scorebook-shell standalone">' +
    renderToStaticMarkup(<ScorebookPages data={data} game={game} options={options} />) +
    '</main></body></html>'
  );
}

export function ScorebookPrint({
  data,
  game,
  onClose,
}: {
  data: Workspace;
  game: Game;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ScorebookOptions>({
    filled: false,
    details: true,
    blankPages: 2,
  });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(
    <div
      className="scorebook-shell"
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="경기 기록지 인쇄"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Tab') {
          const items = ref.current?.querySelectorAll<HTMLElement>('button,input,select');
          if (!items?.length) return;
          const first = items[0],
            last = items[items.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first || document.activeElement === ref.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <div className="scorebook-controls">
        <h2>경기 기록지 인쇄</h2>
        <div className="button-row">
          <button
            aria-pressed={!options.filled}
            onClick={() => setOptions({ ...options, filled: false })}
          >
            빈 기록지 · 타순 포함
          </button>
          <button
            aria-pressed={options.filled}
            onClick={() => setOptions({ ...options, filled: true })}
          >
            현재 기록 포함
          </button>
          <label>
            <input
              type="checkbox"
              checked={options.details}
              onChange={(e) => setOptions({ ...options, details: e.target.checked })}
            />{' '}
            상세·교체 기록지 포함
          </label>
          {!options.filled && options.details && (
            <label>
              빈 상세 기록지 장수
              <select
                value={options.blankPages}
                onChange={(e) => setOptions({ ...options, blankPages: Number(e.target.value) })}
              >
                {[1, 2, 3, 5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}장 ({n * 6}타석)
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="primary" onClick={() => window.print()}>
            프린트 / PDF 저장
          </button>
          <button
            onClick={async () => {
              const { downloadFile } = await import('../data/repository');
              downloadFile(
                `TB-Manager-${game.playedOn ?? 'scorebook'}.html`,
                scorebookHtml(data, game, options),
                'text/html;charset=utf-8',
              );
            }}
          >
            인쇄 양식 HTML 저장
          </button>
          <button onClick={onClose}>기록실로 돌아가기</button>
        </div>
        <p>
          A4 · 가로 · 배율 100% · 머리글/바닥글 끄기 권장. 인쇄와 PDF는 같은 양식을 사용합니다. 긴
          기록은 다음 페이지로 이어지며, 실제 장수는 인쇄 창에서 확인하세요.
        </p>
        <details className="scorebook-save-help">
          <summary>아이패드 인쇄·PDF 저장 안내</summary>
          <ol>
            <li>「프린트 / PDF 저장」을 누르고 용지 A4·가로 방향을 확인합니다.</li>
            <li>
              미리보기의 첫 장과 마지막 장에서 오른쪽 RBI 열과 하단 경기 ID가 보이는지 확인합니다.
            </li>
            <li>PDF는 인쇄 미리보기의 공유 메뉴에서 「파일에 저장」을 선택합니다.</li>
            <li>
              저장한 PDF를 파일 앱에서 다시 열어 장수와 잘림을 확인합니다. 프린터 연결은 필요하지
              않습니다.
            </li>
          </ol>
          <p>
            인쇄·저장·취소는 원본 경기 기록을 바꾸지 않습니다. PDF와 인쇄물도 안전하게 보관하세요.
          </p>
        </details>
        <p>
          빈 기록지의 타순·수비는 경기 시작 스냅샷입니다. 교체 내용은 별지에 적으세요. 각 칸의 No.를
          상세 기록지와 맞추면 나중에 순서대로 입력할 수 있습니다.
        </p>
      </div>
      <ScorebookPages data={data} game={game} options={options} />
    </div>,
    document.body,
  );
}
