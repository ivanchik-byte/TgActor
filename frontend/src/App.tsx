import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useTheme, ThemeProvider, type Theme } from './ThemeContext';
import {
  AlertTriangle,
  LayoutDashboard,
  Server,
  Route as RouteIcon,
  Inbox as InboxIcon,
  Radio,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
  Clock,
  Send,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import axios from 'axios';

// Component imports
import Dashboard from './pages/Dashboard';
import Pools from './pages/Pools';
import Scenarios from './pages/Scenarios';
import Prompts from './pages/Prompts';
import Channels from './pages/Channels';
import Inbox from './pages/Inbox';
import { HistoryPage } from './pages/History';
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
      if (error.config && error.config.url && error.config.url.includes('/api/auth/login')) {
        return Promise.reject(error);
      }
      localStorage.removeItem('tgactor_token');
      window.location.reload();
    }
    return Promise.reject(error);
  }
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
      <span>РИСК: Прямое подключение без прокси. Рекомендуется включить прокси в настройках.</span>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Аккаунты', icon: LayoutDashboard },
    { path: '/pools', label: 'Пулы', icon: Server },
    { path: '/scenarios', label: 'Сценарии', icon: RouteIcon },
    { path: '/prompts', label: 'Промпты', icon: Sparkles },
    { path: '/channels', label: 'Каналы', icon: Radio },
    { path: '/inbox', label: 'Входящие', icon: InboxIcon },
    { path: '/history', label: 'История', icon: Clock },
  ];

  const sidebarWidth = collapsed ? 64 : 220;

  const handleLogout = () => {
    localStorage.removeItem('tgactor_token');
    window.location.reload();
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  // Handle escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-main)' }}>
      {/* Mobile Top Header (< 768px) */}
      <header className="flex md:hidden items-center justify-between px-4 h-14 border-b border-[var(--border-color)] bg-[var(--bg-card)] sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Открыть навигацию"
            className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--accent)] text-white">B2B</span>
            <span className="text-base font-bold tracking-tight text-[var(--accent-text)]">TgActor</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className="text-xs px-2 py-1 rounded-md bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-muted)] outline-none cursor-pointer"
            aria-label="Выбор темы"
          >
            <option value="deep-indigo">Indigo</option>
            <option value="dark-crimson">Crimson</option>
            <option value="dark-charcoal">Charcoal</option>
            <option value="light">Light</option>
          </select>
        </div>
      </header>

      {/* Mobile Navigation Drawer Backdrop & Modal (< 768px) */}
      {mobileDrawerOpen && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className="fixed inset-0 bg-black/65 backdrop-blur-[6px] z-50 md:hidden flex"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[280px] max-w-[85vw] h-full bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col shadow-2xl p-4 animate-in slide-in-from-left duration-200"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--accent)] text-white">B2B</span>
                <span className="text-lg font-bold tracking-tight text-[var(--accent-text)]">TgActor</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Закрыть навигацию"
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-color)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Nav Links */}
            <nav className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileDrawerOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 500,
                      textDecoration: 'none',
                      backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                      color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                      border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                    }}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Mobile Drawer Footer */}
            <div className="pt-3 border-t border-[var(--border-color)] flex flex-col gap-2.5">
              <button
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
              >
                Выйти
              </button>
              <a
                href="https://t.me/ivanchik_byte"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent-text)] text-xs font-bold no-underline"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Автор: @ivanchik_byte</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (>= 768px) */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-40 bg-[var(--bg-card)] border-r border-[var(--border-color)] transition-[width] duration-200"
        style={{ width: sidebarWidth, height: '100dvh' }}
      >
        {/* Logo & Collapse Toggle */}
        <div
          style={{
            padding: collapsed ? '16px 8px' : '20px 16px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 5px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                }}
              >
                B2B
              </span>
              <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--accent-text)' }}>
                TgActor
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
          </button>
        </div>

        {/* Nav Links */}
        <nav
          style={{
            flex: 1,
            padding: collapsed ? '0 6px' : '0 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            overflowY: 'auto',
          }}
        >
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: collapsed ? '10px 0' : '9px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                  color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    e.currentTarget.style.color = 'var(--text-main)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }
                }}
              >
                <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Theme and Logout Selector */}
        {!collapsed && (
          <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as Theme)}
                style={{
                  width: '100%',
                  appearance: 'none',
                  borderRadius: '8px',
                  padding: '7px 28px 7px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  outline: 'none',
                }}
              >
                <option value="deep-indigo">Indigo</option>
                <option value="dark-crimson">Crimson</option>
                <option value="dark-charcoal">Charcoal</option>
                <option value="light">Light</option>
              </select>
              <ChevronDown
                style={{
                  width: 12,
                  height: 12,
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--text-muted)',
                }}
              />
            </div>

            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                borderRadius: '8px',
                padding: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#ef4444';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              Выйти
            </button>

            <a
              href="https://t.me/ivanchik_byte"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '6px',
                padding: '7px 10px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-soft)',
                border: '1px solid var(--accent)',
                color: 'var(--accent-text)',
                fontSize: '11px',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <Send style={{ width: '12px', height: '12px' }} />
              <span>Автор: @ivanchik_byte</span>
            </a>
          </div>
        )}
      </aside>

      {/* Main Container */}
      <div
        className="flex-1 flex flex-col min-w-0 transition-[margin-left] duration-200 md:ml-[220px]"
        style={{
          marginLeft: typeof window !== 'undefined' && window.innerWidth >= 768 ? sidebarWidth : undefined,
        }}
      >
        <ProxyBanner />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { theme, setTheme } = useTheme();

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
      setError(err?.response?.data?.detail || 'Неверный пароль администратора!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        backgroundColor: 'var(--bg-main)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        color: 'var(--text-main)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '20px',
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
            }}
          >
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              B2B Панель
            </span>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', marginTop: '10px', marginBottom: '4px' }}>
              Авторизация TgActor
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Доступ разрешен только владельцу системы
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Пароль администратора
          </label>
          <input
            type="password"
            placeholder="Введите пароль..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '14px',
              color: 'var(--text-main)',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
          />
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center', fontWeight: 500 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          style={{
            backgroundColor: 'var(--accent)',
            color: '#fff',
            padding: '12px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            border: 'none',
            cursor: loading || !password ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            opacity: loading || !password ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {loading ? 'Авторизация...' : 'Войти в панель'}
        </button>

        {/* Theme Selection on Login */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Тема оформления:</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="deep-indigo">Indigo</option>
            <option value="dark-crimson">Crimson</option>
            <option value="dark-charcoal">Charcoal</option>
            <option value="light">Light</option>
          </select>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('tgactor_token'));

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
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/pools" element={<Pools />} />
                  <Route path="/scenarios" element={<Scenarios />} />
                  <Route path="/prompts" element={<Prompts />} />
                  <Route path="/channels" element={<Channels />} />
                  <Route path="/inbox" element={<Inbox />} />
                  <Route path="/history" element={<HistoryPage />} />
                </Routes>
              </Layout>
            </BrowserRouter>
          )}
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
