import type { FieldingObservation, Game, Id, PlayDetail, Side, Workspace } from '../domain/model';
import { ABILITIES, ABILITY_LABELS, POSITIONS, POSITION_LABELS } from '../config/positions';
import { ERROR_LABELS } from '../config/recording';
const detailNames: Record<PlayDetail['type'], string> = {
  FIELDERS_CHOICE: '야수선택 대상',
  RBI: '타점 판정',
  DEFENSIVE_ERROR: '수비 실책',
  ERROR_ADVANCE: '실책 추가 진루',
  FIELDING_ACTION: '수비 동작',
  DEFENSIVE_CREDIT: '자살·보살',
};
export function PlayDetailsEditor({
  data,
  game,
  side,
  participants,
  details,
  onChange,
  observations,
  onObservations,
  lockedDetailIds = new Set<string>(),
  rbiInRunnerStep = false,
}: {
  data: Workspace;
  game: Game;
  side: Side;
  participants: Id[];
  details: PlayDetail[];
  onChange: (v: PlayDetail[]) => void;
  observations: FieldingObservation[];
  onObservations: (v: FieldingObservation[]) => void;
  lockedDetailIds?: Set<string>;
  rbiInRunnerStep?: boolean;
}) {
  const defenders = game.rosters[side === 'away' ? 'home' : 'away'];
  const name = (id: string) => data.players.find((p) => p.id === id)?.name || id;
  const players = (ids: string[]) =>
    ids.map((id) => (
      <option key={id} value={id}>
        {name(id)}
      </option>
    ));
  const patch = (id: string, value: Partial<PlayDetail>) =>
    onChange(details.map((d) => (d.id === id ? ({ ...d, ...value } as PlayDetail) : d)));
  const add = (type: PlayDetail['type']) => {
    const id = crypto.randomUUID(),
      playerId = defenders[0],
      runnerId = participants[0];
    const defaults: Record<PlayDetail['type'], PlayDetail> = {
      FIELDERS_CHOICE: { id, type: 'FIELDERS_CHOICE', targetRunnerId: runnerId },
      RBI: { id, type: 'RBI', runnerId },
      DEFENSIVE_ERROR: {
        id,
        type: 'DEFENSIVE_ERROR',
        playerId,
        errorType: 'ground-fielding',
        note: '',
      },
      ERROR_ADVANCE: {
        id,
        type: 'ERROR_ADVANCE',
        playerId: runnerId,
        from: 1,
        to: 2,
        errorId: details.find((d) => d.type === 'DEFENSIVE_ERROR')?.id || '',
      },
      FIELDING_ACTION: {
        id,
        type: 'FIELDING_ACTION',
        playerId,
        position: 'SS',
        action: 'receive',
        success: null,
        difficulty: null,
      },
      DEFENSIVE_CREDIT: { id, type: 'DEFENSIVE_CREDIT', playerId, credit: 'assist', runnerId },
    };
    onChange([...details, defaults[type]]);
  };
  return (
    <section className="detail-editor">
      <h3>플레이 세부 이벤트</h3>
      <p className="hint">
        필요한 항목을 추가하세요. RBI는 기록원의 판정이며 자동 추정하지 않습니다. 안타 후 실책
        진루는 안타 종류를 유지한 채 실책과 진루 구간을 연결합니다.
      </p>
      <div className="button-row detail-add">
        {Object.entries(detailNames)
          .filter(([type]) => !rbiInRunnerStep || type !== 'RBI')
          .map(([type, label]) => (
            <button type="button" key={type} onClick={() => add(type as PlayDetail['type'])}>
              + {label}
            </button>
          ))}
      </div>
      {details.map((d, index) => (
        <fieldset className="detail-card" key={d.id} disabled={lockedDetailIds.has(d.id)}>
          <legend>
            {index + 1}. {detailNames[d.type]}
            {lockedDetailIds.has(d.id) ? ' · 수비 연결에서 수정' : ''}
          </legend>
          <button
            type="button"
            className="text-button"
            aria-label={index + 1 + '번 세부 이벤트 삭제'}
            onClick={() => onChange(details.filter((x) => x.id !== d.id))}
          >
            삭제
          </button>
          {d.type === 'FIELDERS_CHOICE' && (
            <label>
              아웃을 시도한 기존 주자
              <select
                value={d.targetRunnerId}
                onChange={(e) => patch(d.id, { targetRunnerId: e.target.value })}
              >
                {players(participants.slice(0, -1))}
              </select>
            </label>
          )}
          {d.type === 'RBI' && (
            <label>
              타점이 인정된 득점 주자
              <select
                value={d.runnerId}
                onChange={(e) => patch(d.id, { runnerId: e.target.value })}
              >
                {players(participants)}
              </select>
            </label>
          )}
          {'playerId' in d && (
            <label>
              {d.type === 'ERROR_ADVANCE' ? '진루 주자' : '수비 선수'}
              <select
                value={d.playerId}
                onChange={(e) => patch(d.id, { playerId: e.target.value })}
              >
                {players(d.type === 'ERROR_ADVANCE' ? participants : defenders)}
              </select>
            </label>
          )}
          {d.type === 'DEFENSIVE_ERROR' && (
            <>
              <label>
                실책 세부 유형
                <select
                  value={d.errorType}
                  onChange={(e) =>
                    patch(d.id, { errorType: e.target.value as keyof typeof ERROR_LABELS })
                  }
                >
                  {Object.entries(ERROR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                판정 메모
                <input
                  value={d.note}
                  maxLength={1000}
                  onChange={(e) => patch(d.id, { note: e.target.value })}
                />
              </label>
            </>
          )}
          {d.type === 'ERROR_ADVANCE' && (
            <>
              <label>
                원인 실책
                <select
                  value={d.errorId}
                  onChange={(e) => patch(d.id, { errorId: e.target.value })}
                >
                  <option value="">실책 이벤트 선택</option>
                  {details.map(
                    (err, i) =>
                      err.type === 'DEFENSIVE_ERROR' && (
                        <option key={err.id} value={err.id}>
                          {i + 1}. {name(err.playerId)} · {ERROR_LABELS[err.errorType]}
                        </option>
                      ),
                  )}
                </select>
              </label>
              <div className="form-row">
                <label>
                  실책 전 도달 베이스
                  <select
                    value={d.from}
                    onChange={(e) => patch(d.id, { from: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                  >
                    {[0, 1, 2, 3].map((b) => (
                      <option key={b} value={b}>
                        {b === 0 ? '타석' : b + '루'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  실책 후 도달 베이스
                  <select
                    value={d.to}
                    onChange={(e) =>
                      patch(d.id, {
                        to:
                          e.target.value === 'home'
                            ? 'home'
                            : (Number(e.target.value) as 1 | 2 | 3),
                      })
                    }
                  >
                    {[1, 2, 3].map((b) => (
                      <option key={b} value={b}>
                        {b}루
                      </option>
                    ))}
                    <option value="home">홈</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {d.type === 'FIELDING_ACTION' && (
            <>
              <div className="form-row">
                <label>
                  포지션
                  <select
                    value={d.position}
                    onChange={(e) => patch(d.id, { position: e.target.value as typeof d.position })}
                  >
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {POSITION_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  수비 동작
                  <select
                    value={d.action}
                    onChange={(e) =>
                      patch(d.id, {
                        action: e.target.value as typeof d.action,
                        ...(e.target.value === 'out' ? { runnerId: participants[0] } : {}),
                      })
                    }
                  >
                    <option value="receive">포구</option>
                    <option value="throw">송구</option>
                    <option value="base">베이스 처리</option>
                    <option value="out">아웃 기여</option>
                  </select>
                </label>
              </div>
              {d.action === 'out' && (
                <label>
                  아웃 대상
                  <select
                    value={d.runnerId ?? ''}
                    onChange={(e) => patch(d.id, { runnerId: e.target.value })}
                  >
                    <option value="">선택</option>
                    {players(participants)}
                  </select>
                </label>
              )}
              <label>
                동작 수행 결과
                <select
                  value={String(d.success)}
                  onChange={(e) =>
                    patch(d.id, {
                      success: e.target.value === 'null' ? null : e.target.value === 'true',
                    })
                  }
                >
                  <option value="null">미관찰</option>
                  <option value="true">성공</option>
                  <option value="false">실패</option>
                </select>
              </label>
            </>
          )}
          {d.type === 'DEFENSIVE_CREDIT' && (
            <div className="form-row">
              <label>
                공식 수비 기여
                <select
                  value={d.credit}
                  onChange={(e) => patch(d.id, { credit: e.target.value as typeof d.credit })}
                >
                  <option value="assist">보살 A</option>
                  <option value="putout">자살 PO</option>
                </select>
              </label>
              <label>
                실제 아웃된 선수
                <select
                  value={d.runnerId}
                  onChange={(e) => patch(d.id, { runnerId: e.target.value })}
                >
                  {players(participants)}
                </select>
              </label>
            </div>
          )}
        </fieldset>
      ))}
      <h3>9개 수비 능력 관찰</h3>
      <p className="hint">
        능력 관찰의 성공·실패는 자살·보살·실책을 자동 생성하지 않습니다. 한 플레이에 여러 선수와
        여러 능력을 기록할 수 있습니다.
      </p>
      {observations.map((o, i) => (
        <fieldset className="detail-card" key={i}>
          <legend>능력 관찰 {i + 1}</legend>
          <button
            type="button"
            className="text-button"
            onClick={() => onObservations(observations.filter((_, n) => n !== i))}
          >
            관찰 삭제
          </button>
          <div className="form-row">
            <label>
              관찰 선수
              <select
                value={o.playerId}
                onChange={(e) =>
                  onObservations(
                    observations.map((x, n) => (n === i ? { ...x, playerId: e.target.value } : x)),
                  )
                }
              >
                {players(defenders)}
              </select>
            </label>
            <label>
              관찰 능력
              <select
                value={o.skill}
                onChange={(e) =>
                  onObservations(
                    observations.map((x, n) =>
                      n === i ? { ...x, skill: e.target.value as typeof o.skill } : x,
                    ),
                  )
                }
              >
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {a} · {ABILITY_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            수비 난도 (선택)
            <select
              value={o.difficulty ?? ''}
              onChange={(e) =>
                onObservations(
                  observations.map((x, n) =>
                    n === i
                      ? {
                          ...x,
                          difficulty: (e.target.value || null) as FieldingObservation['difficulty'],
                        }
                      : x,
                  ),
                )
              }
            >
              <option value="">미관찰</option>
              <option value="routine">쉬움</option>
              <option value="challenging">보통</option>
              <option value="difficult">어려움</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              관찰 포지션
              <select
                value={o.position}
                onChange={(e) =>
                  onObservations(
                    observations.map((x, n) =>
                      n === i ? { ...x, position: e.target.value as typeof o.position } : x,
                    ),
                  )
                }
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              관찰 결과
              <select
                value={String(o.success)}
                onChange={(e) =>
                  onObservations(
                    observations.map((x, n) =>
                      n === i
                        ? {
                            ...x,
                            success: e.target.value === 'null' ? null : e.target.value === 'true',
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="null">미관찰</option>
                <option value="true">성공</option>
                <option value="false">실패</option>
              </select>
            </label>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() =>
          onObservations([
            ...observations,
            { playerId: defenders[0], skill: 'G', position: 'SS', success: null, difficulty: null },
          ])
        }
      >
        + 수비 능력 관찰
      </button>
    </section>
  );
}
