import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  CircleDot,
  ChartNoAxesCombined,
  ClipboardCheck,
  Waypoints,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  Menu,
  Check,
  AlertCircle,
  WifiOff,
} from 'lucide-react';
import type { EventPayload, Game, Workspace } from './domain/model';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  V2_STORAGE_KEY,
  downloadFile,
} from './data/repository';
import { createDemoWorkspace } from './data/seed';
import { replayGame } from './engine/game';
import { Players, Profile } from './components/Players';
import { MatchView } from './components/MatchView';
import { AssessmentView } from './components/AssessmentView';
import { SelectionView } from './components/SelectionView';
import { SettingsView } from './components/SettingsView';
import { StatsView } from './components/StatsView';
import { Badge, Panel } from './components/ui';
import { Field } from './components/Field';
const previewMode = new URLSearchParams(location.search).get('preview') === '1';
const repository = new LocalWorkspaceRepository(previewMode ? sessionStorage : localStorage);
const navigation = [
  { id: 'dashboard', name: '대시보드', icon: LayoutDashboard },
  { id: 'players', name: '선수 & 팀', icon: Users },
  { id: 'match', name: '경기 기록실', icon: CircleDot },
  { id: 'stats', name: '경기 분석', icon: ChartNoAxesCombined },
  { id: 'assessment', name: '기능평가 & 팀워크', icon: ClipboardCheck },
  { id: 'selection', name: '선발 시뮬레이션', icon: Waypoints },
  { id: 'settings', name: '규칙 & 설정', icon: Settings2 },
] as const;
type View = (typeof navigation)[number]['id'];
export default function App() {
  const [loaded] = useState(() => {
    try {
      return { data: repository.load() ?? createDemoWorkspace(), error: '' };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : '저장 데이터 읽기 실패' };
    }
  });
  const [data, setData] = useState<Workspace | null>(loaded.data);
  const [view, setView] = useState<View>('dashboard');
  const [gameId, setGameId] = useState(loaded.data?.games[0]?.id || '');
  const [deviceId] = useState(() => crypto.randomUUID());
  const [profile, setProfile] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    const storage = (e: StorageEvent) => {
      if (
        !previewMode &&
        (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY || e.key === V2_STORAGE_KEY)
      )
        setStale(true);
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!data)
    return (
      <main className="fatal">
        <AlertCircle />
        <h1>저장된 데이터를 확인해야 합니다</h1>
        <p>기존 데이터를 덮어쓰지 않았습니다.</p>
        <pre>{loaded.error}</pre>
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
        <p>원본을 보관한 뒤 개발자에게 스키마·이벤트 오류 수정을 요청하세요.</p>
      </main>
    );
  const notify = (message: string, error = false) => setNotice({ message, error });
  const save = (next: Workspace) => {
    try {
      if (stale) throw new Error('다른 탭의 변경이 있습니다. 새로고침한 뒤 기록하세요.');
      // Revision detects previous writes; transactional cross-tab locking remains a TODO.
      const saved = repository.save(next, data.revision);
      setData(saved);
      notify(previewMode ? '검증 탭에 임시 저장했습니다.' : '이 브라우저에 저장했습니다.');
    } catch (error) {
      notify(error instanceof Error ? error.message : '저장 실패', true);
      throw error;
    }
  };
  const safelySave = (next: Workspace) => {
    try {
      save(next);
    } catch {
      /* Visible error, keep current in-memory data. */
    }
  };
  const game = data.games.find((g) => g.id === gameId) ?? data.games[0];
  const events = data.events.filter((e) => e.gameId === game.id);
  const state = replayGame(game, events);
  const record = (payload: EventPayload) => {
    try {
      save({
        ...data,
        events: [
          ...data.events,
          {
            schemaVersion: 2,
            id: crypto.randomUUID(),
            gameId: game.id,
            sequence: events.length + 1,
            deviceId,
            recordedAt: new Date().toISOString(),
            payload,
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  };
  const create = (g: Game) => {
    try {
      save({ ...data, games: [...data.games, g] });
      setGameId(g.id);
    } catch {
      /* Notification shown. */
    }
  };
  const navigate = (next: View) => {
    setView(next);
    setMenu(false);
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('dashboard');
          }}
        >
          <span className="brand-symbol">
            TB
            <span />
          </span>
          <div>
            TB Manager<small>티볼 통합 매니지먼트</small>
          </div>
        </a>
        <div className="workspace-label">COACH WORKSPACE</div>
        <nav>
          {navigation.map(({ id, name, icon: Icon }) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)}>
              <Icon size={19} />
              <span>{name}</span>
              {id === 'match' && <i className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="season-card">
            <span className="season-icon">◇</span>
            <small>PLAY. LEARN. GROW.</small>
            <b>
              함께 뛰고,
              <br />
              함께 성장합니다.
            </b>
            <p>우리 반의 다음 플레이를 응원해요.</p>
          </div>
          <div className="coach">
            <span>선</span>
            <div>
              <b>선생님 워크스페이스</b>
              <small>기기 내 저장 · 초기 버전</small>
            </div>
            <Settings2 size={16} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn menu-toggle"
              aria-label="메뉴 열기"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>워크스페이스</span>
            <span>/</span>
            <b>{navigation.find((n) => n.id === view)?.name}</b>
          </div>
          <div className="topbar-right">
            <span className="save-state">
              {online ? <i /> : <WifiOff size={14} />}{' '}
              {previewMode ? '검증 탭 임시 저장' : online ? '기기 내 저장' : '오프라인'}
            </span>
            <span className="version">BETA 0.3</span>
            <div className="top-avatar">TB</div>
          </div>
        </header>
        <main>
          {previewMode && (
            <div className="callout">
              검증 모드 · 이 탭의 가상 기록만 임시 저장합니다. 실제 브라우저 기록과 분리됩니다.
            </div>
          )}
          <div className="privacy-notice" role="note">
            <b>학생 개인정보 주의</b> · 서버 인증·접근 권한이 아직 구현되지 않았습니다. 실명·학번 등
            실제 학생 개인정보를 입력하지 말고 별칭·가상 데이터로 사용하세요. 백업 파일도 안전하게
            보관하세요.
          </div>
          {stale && (
            <div className="alert" role="alert">
              다른 탭에서 데이터가 변경되었습니다. 기록 전에{' '}
              <button onClick={() => location.reload()}>새로고침</button>하세요.
            </div>
          )}
          {view === 'dashboard' && <Dashboard data={data} navigate={navigate} />}
          {view === 'players' && <Players data={data} onSave={safelySave} onProfile={setProfile} />}
          {view === 'match' && (
            <MatchView
              data={data}
              game={game}
              state={state}
              onEvent={record}
              onCreate={create}
              onSelect={setGameId}
              onProfile={setProfile}
            />
          )}
          {view === 'stats' && <StatsView data={data} onProfile={setProfile} />}
          {view === 'assessment' && <AssessmentView data={data} onSave={save} />}
          {view === 'selection' && (
            <SelectionView data={data} onSave={safelySave} onProfile={setProfile} />
          )}
          {view === 'settings' && (
            <SettingsView key={data.policy.version} data={data} onSave={save} onNotify={notify} />
          )}
          <footer>
            <span>
              TB MANAGER <i /> RECORD THE GAME. DISCOVER THE PLAYER.
            </span>
            <span>초기 개발 버전 · 샘플 명단 포함</span>
          </footer>
        </main>
      </div>
      {profile && <Profile id={profile} data={data} onClose={() => setProfile(null)} />}
      {notice && (
        <div
          className={'toast ' + (notice.error ? 'error' : '')}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.error ? <AlertCircle size={19} /> : <Check size={19} />}
          <span>{notice.message}</span>
          <button aria-label="알림 닫기" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Dashboard({ data, navigate }: { data: Workspace; navigate: (view: View) => void }) {
  const played = data.games.reduce(
    (sum, g) =>
      sum +
      replayGame(
        g,
        data.events.filter((e) => e.gameId === g.id),
      ).plays.length,
    0,
  );
  const assessed = new Set(data.assessments.map((a) => a.playerId)).size;
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">THE TEAM STARTS HERE</div>
          <h1>
            우리 팀의 오늘<span className="title-dot">.</span>
          </h1>
          <p>플레이를 기록하고, 숨은 강점을 발견하는 시간.</p>
        </div>
        <button className="primary" onClick={() => navigate('match')}>
          <CircleDot size={18} />
          경기 기록하기 <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="dashboard-hero">
        <div className="hero-copy">
          <Badge tone="lime">매 순간이 성장의 기록</Badge>
          <h2>
            좋은 팀은,
            <br />
            모두의 가능성에서.
          </h2>
          <p>
            타격부터 팀워크까지.
            <br />
            우리 반 티볼의 모든 순간을 함께 기록하세요.
          </p>
          <button className="light-button" onClick={() => navigate('players')}>
            우리 팀 살펴보기 <ArrowRight size={17} />
          </button>
          <small>TEAM BALL · TEAM GROWTH</small>
        </div>
        <div className="hero-field">
          <Field players={data.players} />
          <div className="hero-field-note">
            <span>10</span>
            <p>
              개의 포지션
              <br />
              <b>하나의 팀</b>
            </p>
          </div>
        </div>
      </div>
      <div className="stat-cards">
        {[
          {
            label: '함께하는 선수',
            value: data.players.length,
            unit: '명',
            detail: data.teams.length + '개 팀',
            icon: Users,
          },
          {
            label: '등록된 경기',
            value: data.games.length,
            unit: '경기',
            detail: '수업별 경기 기록',
            icon: CircleDot,
          },
          {
            label: '기록한 타석',
            value: played,
            unit: '타석',
            detail: '이벤트로 남긴 플레이',
            icon: ChartNoAxesCombined,
          },
          {
            label: '기능평가 기록',
            value: assessed,
            unit: '명',
            detail: '가상 샘플 평가 포함',
            icon: ClipboardCheck,
          },
        ].map(({ label, value, unit, detail, icon: Icon }) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-bottom">
        <Panel
          title="이어서 기록할 경기"
          eyebrow="ON DECK"
          action={
            <button className="text-button" onClick={() => navigate('match')}>
              경기 기록실 <ArrowRight size={15} />
            </button>
          }
        >
          {data.games
            .slice(-2)
            .reverse()
            .map((g) => {
              const s = replayGame(
                g,
                data.events.filter((e) => e.gameId === g.id),
              );
              return (
                <button className="game-tile" key={g.id} onClick={() => navigate('match')}>
                  <div className="game-icon">
                    <CircleDot size={27} />
                  </div>
                  <div>
                    <div>
                      <Badge tone="neutral">{s.status === 'finished' ? '종료' : '진행 가능'}</Badge>
                      <small>{g.innings}이닝 · 전원 타격제</small>
                    </div>
                    <h3>{g.name}</h3>
                    <p>
                      {data.teams.find((t) => t.id === g.teamIds.away)?.name}
                      <span>vs</span>
                      {data.teams.find((t) => t.id === g.teamIds.home)?.name}
                    </p>
                  </div>
                  <ArrowUpRight size={19} />
                </button>
              );
            })}
          <div className="next-step">
            <b>한 번의 기록, 여러 가지 발견</b>
            <p>선수를 터치하면 타구 방향, 수비 유형, 주루 기록을 확인할 수 있어요.</p>
          </div>
        </Panel>
        <Panel title="코치의 체크리스트" eyebrow="COACH'S NOTE">
          <button className="checklist" onClick={() => navigate('assessment')}>
            <span className="check-circle">01</span>
            <div>
              <b>선수별 강점 확인하기</b>
              <p>9가지 수비 능력을 평가해 보세요.</p>
            </div>
            <ArrowRight size={18} />
          </button>
          <button className="checklist" onClick={() => navigate('selection')}>
            <span className="check-circle">02</span>
            <div>
              <b>우리 팀 포지션 그려보기</b>
              <p>TYPE1 가중치로 최적 배치를 찾습니다.</p>
            </div>
            <ArrowRight size={18} />
          </button>
          <button className="checklist" onClick={() => navigate('settings')}>
            <span className="check-circle">03</span>
            <div>
              <b>정책과 백업 확인하기</b>
              <p>미확정 항목과 기기별 저장을 확인하세요.</p>
            </div>
            <ArrowRight size={18} />
          </button>
          <div className="small-note">
            <i />
            확정 규칙 8개 적용 · 평가 정책은 초안
          </div>
        </Panel>
      </div>
    </>
  );
}
