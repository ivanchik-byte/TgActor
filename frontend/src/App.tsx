import Select from './components/Select';
import React, { lazy, Suspense, useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { useTheme, ThemeProvider, type Theme } from './ThemeContext';
import {
  WarningCircle as AlertTriangle,
  SquaresFour,
  Stack,
  TreeStructure,
  Tray,
  Broadcast,
  ClockCounterClockwise,
  Sparkle,
  PaperPlaneTilt,
  GithubLogo,
  SidebarSimple,
  List,
  X,
  ArrowUpRight,
  ArrowRight,
  SignOut,
  LockKey,
  CircleHalf,
} from '@phosphor-icons/react';
import axios from 'axios';

// Component imports
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pools = lazy(() => import('./pages/Pools'));
const Scenarios = lazy(() => import('./pages/Scenarios'));
const Prompts = lazy(() => import('./pages/Prompts'));
const Channels = lazy(() => import('./pages/Channels'));
const Inbox = lazy(() => import('./pages/Inbox'));
const HistoryPage = lazy(() =>
  import('./pages/History').then((module) => ({ default: module.HistoryPage })),
);
import { ToastProvider } from './components/ToastContext';

const queryClient = new QueryClient();

// Same-origin by default; override via VITE_API_URL for split deployments
axios.defaults.baseURL = import.meta.env.VITE_API_URL ?? '';

// Setup token authentication and request headers
const initialToken = localStorage.getItem('tgactor_token');
if (initialToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
}

// Global interceptor: automatically wipe credentials and reload on 401 responses
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (
        error.config &&
        error.config.url &&
        error.config.url.includes('/api/auth/login')
      ) {
        return Promise.reject(error);
      }
      localStorage.removeItem('tgactor_token');
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

function ProxyBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ['proxyMode'],
    queryFn: async () => {
      const res = await axios.get('/api/config/proxy-mode');
      return res.data;
    },
    refetchInterval: 5000,
  });

  if (isLoading || data?.use_proxy !== false) return null;

  return (
    <div className="bg-red-700/90 text-white px-4 py-2.5 flex items-center justify-center text-sm font-medium sticky top-0 z-40 backdrop-blur-sm shadow-md">
      <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
      <span>
        РИСК: Прямое подключение без прокси. Рекомендуется включить прокси в
        настройках.
      </span>
    </div>
  );
}

const navigation = [
  { path: '/', label: 'Аккаунты', icon: SquaresFour, section: 'УПРАВЛЕНИЕ' },
  { path: '/pools', label: 'Пулы аккаунтов', icon: Stack },
  { path: '/channels', label: 'Каналы', icon: Broadcast },
  {
    path: '/scenarios',
    label: 'Сценарии',
    icon: TreeStructure,
    section: 'АВТОМАТИЗАЦИЯ',
  },
  { path: '/prompts', label: 'Промпты', icon: Sparkle },
  { path: '/inbox', label: 'Входящие', icon: Tray, section: 'АКТИВНОСТЬ' },
  { path: '/history', label: 'История действий', icon: ClockCounterClockwise },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <PaperPlaneTilt size={23} weight="fill" />
      </span>
      {!compact && (
        <span>
          TgActor<span className="brand-period">.</span>
        </span>
      )}
    </div>
  );
}

function ThemeSelect() {
  const { theme, setTheme, availableThemes } = useTheme();
  return (
    <div className="theme-select">
      <CircleHalf size={17} />
      <Select
        aria-label="Тема оформления"
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
      >
        {availableThemes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const activePage = navigation.find((item) => item.path === location.pathname);

  const handleLogout = () => {
    localStorage.removeItem('tgactor_token');
    window.location.reload();
  };

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    const resetNavigation = () => {
      if (mobile.matches) setCollapsed(false);
      else setMobileDrawerOpen(false);
    };
    mobile.addEventListener('change', resetNavigation);
    return () => mobile.removeEventListener('change', resetNavigation);
  }, []);
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById('workspace-navigation');
    const visibleControls = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>('button, a, select') ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    visibleControls()[0]?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false);
      if (e.key === 'Tab' && sidebar) {
        const focusables = visibleControls();
        const first = focusables[0],
          last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previous?.focus();
    };
  }, [mobileDrawerOpen]);

  return (
    <div className={`workspace ${collapsed ? 'workspace-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      {mobileDrawerOpen && (
        <div
          className="navigation-backdrop"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`workspace-sidebar ${mobileDrawerOpen ? 'is-open' : ''}`}
        aria-label="Навигация"
        role={mobileDrawerOpen ? 'dialog' : undefined}
        aria-modal={mobileDrawerOpen || undefined}
      >
        <div className="sidebar-content">
          <div className="sidebar-brand">
            <Brand compact={collapsed} />
            <button
              className="sidebar-collapse desktop-only"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={
                collapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'
              }
            >
              <SidebarSimple size={18} />
            </button>
            <button
              className="sidebar-collapse mobile-only"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Закрыть навигацию"
            >
              <X size={20} />
            </button>
          </div>
          {!collapsed && (
            <div className="workspace-label">
              <span className="workspace-avatar">T</span>
              <div>
                <strong>Моя панель</strong>
                <span>Open source · Telegram</span>
              </div>
              <span className="workspace-label-dot" />
            </div>
          )}
          <nav className="sidebar-navigation">
            {navigation.map((item) => {
              const active = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <React.Fragment key={item.path}>
                  {item.section && (
                    <div className="nav-section">
                      {collapsed ? <span /> : item.section}
                    </div>
                  )}
                  <Link
                    to={item.path}
                    className={`nav-link ${active ? 'is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={20} weight={active ? 'duotone' : 'regular'} />
                    <span>{item.label}</span>
                    {active && <span className="nav-active-dot" />}
                  </Link>
                </React.Fragment>
              );
            })}
          </nav>
          <div className="sidebar-footer">
            {!collapsed && (
              <a
                className="creator-link"
                href="https://github.com/ivanchik-byte/TgActor"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubLogo size={19} />
                <div>
                  <strong>Исходный код</strong>
                  <span>GitHub · TgActor</span>
                </div>
                <ArrowUpRight size={16} />
              </a>
            )}
            <button
              className="logout-button"
              onClick={handleLogout}
              title="Выйти"
            >
              <SignOut size={18} />
              {!collapsed && <span>Выйти из аккаунта</span>}
            </button>
            {!collapsed && (
              <div className="sidebar-version">
                <span>TGACTOR</span>
                <span>OPEN SOURCE / 3.3</span>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="topbar-breadcrumb">
            <button
              className="icon-button mobile-only"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Открыть навигацию"
              aria-expanded={mobileDrawerOpen}
              aria-controls="workspace-navigation"
            >
              <List size={22} />
            </button>
            <span className="breadcrumb-root">Рабочее пространство</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{activePage?.label || 'TgActor'}</strong>
          </div>
          <div className="topbar-tools">
            <ThemeSelect />
          </div>
        </header>
        <ProxyBanner />
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          <div
            key={location.pathname}
            className={`page-content page-${location.pathname.split('/')[1] || 'accounts'}`}
          >
            {children}
          </div>
        </main>
        <footer className="workspace-footer">
          <span>
            TgActor <span className="footer-divider">/</span> Ваш Telegram под
            контролем
          </span>
          <span>Управление. Автоматизация. Диалоги.</span>
        </footer>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/auth/login', { password });
      const token = res.data.access_token;
      localStorage.setItem('tgactor_token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onLogin(token);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Неверный пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-story-content">
          <span className="eyebrow">TELEGRAM / OPEN SOURCE</span>
          <h1>
            Всё под
            <br />
            вашим контролем<span>.</span>
          </h1>
          <p>
            Аккаунты, диалоги и автоматизация.
            <br />
            Одно пространство для всей работы.
          </p>
          <div className="login-visual" aria-hidden="true">
            <div className="orbit orbit-outer" />
            <div className="orbit orbit-inner" />
            <div className="orbit-core">
              <PaperPlaneTilt size={48} weight="fill" />
            </div>
            <div className="orbit-node node-one">
              <Stack size={24} />
            </div>
            <div className="orbit-node node-two">
              <TreeStructure size={24} />
            </div>
            <div className="orbit-node node-three">
              <Tray size={24} />
            </div>
            <span className="orbit-caption">
              <span /> Одна система. Все ваши аккаунты.
            </span>
          </div>
        </div>
        <div className="login-story-footer">
          <span>TGACTOR / OPEN SOURCE</span>
          <span>Личный инструмент для Telegram</span>
        </div>
      </section>
      <section className="login-entry">
        <div className="login-theme">
          <ThemeSelect />
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <span className="login-lock">
            <LockKey size={25} weight="duotone" />
          </span>
          <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <h2>С возвращением</h2>
          <p className="login-subtitle">
            Введите пароль, чтобы открыть панель.
          </p>
          <div className="login-field">
            <label htmlFor="admin-password">Пароль</label>
            <div className="password-input">
              <LockKey size={18} />
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
          </div>
          {error && (
            <div id="login-error" role="alert" className="login-error">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}
          <button
            className="primary-button login-submit"
            type="submit"
            disabled={loading || !password}
          >
            {loading ? 'Выполняется вход…' : 'Войти в TgActor'}
            <ArrowRight size={18} />
          </button>
        </form>
        <span className="login-entry-footer">TgActor · Open source</span>
      </section>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('tgactor_token'),
  );

  useEffect(() => {
    const curToken = localStorage.getItem('tgactor_token');
    setToken(curToken);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          {!token ? (
            <Login onLogin={(t) => setToken(t)} />
          ) : (
            <BrowserRouter>
              <Layout>
                <Suspense
                  fallback={
                    <div
                      className="page-skeleton"
                      role="status"
                      aria-label="Загрузка раздела"
                    >
                      <span />
                      <span />
                      <div />
                      <div />
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/pools" element={<Pools />} />
                    <Route path="/scenarios" element={<Scenarios />} />
                    <Route path="/prompts" element={<Prompts />} />
                    <Route path="/channels" element={<Channels />} />
                    <Route path="/inbox" element={<Inbox />} />
                    <Route path="/history" element={<HistoryPage />} />
                  </Routes>
                </Suspense>
              </Layout>
            </BrowserRouter>
          )}
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
