import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useTheme, ThemeProvider } from './ThemeContext';
import { AlertTriangle, LayoutDashboard, Server, Route as RouteIcon, Inbox as InboxIcon, Radio, ChevronDown, PanelLeftClose, PanelLeftOpen, Lock, Clock } from 'lucide-react';
import axios from 'axios';

// Component imports
import Dashboard from './pages/Dashboard';
import Pools from './pages/Pools';
import Scenarios from './pages/Scenarios';
import Channels from './pages/Channels';
import Inbox from './pages/Inbox';
import { HistoryPage } from './pages/History';
import { ToastProvider } from './components/ToastContext';

const queryClient = new QueryClient();

axios.defaults.baseURL = 'http://localhost:8000';

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
      // Exclude login request from reload interceptor
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
    <div className="bg-red-700/90 text-white px-4 py-2.5 flex items-center justify-center text-sm font-medium sticky top-0 z-50 backdrop-blur-sm">
      <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
      <span>РИСК: Прямое подключение без прокси. Рекомендуется включить прокси в настройках.</span>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { path: '/', label: 'Аккаунты', icon: LayoutDashboard },
    { path: '/pools', label: 'Пулы', icon: Server },
    { path: '/scenarios', label: 'Сценарии', icon: RouteIcon },
    { path: '/channels', label: 'Каналы', icon: Radio },
    { path: '/inbox', label: 'Входящие', icon: InboxIcon },
    { path: '/history', label: 'История', icon: Clock },
  ];

  const sidebarWidth = collapsed ? 56 : 220;

  const handleLogout = () => {
    localStorage.removeItem('tgactor_token');
    window.location.reload();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--bg-main)' }}>
      {/* Sidebar — fixed position, doesn't scroll with content */}
      <aside
        style={{
          width: sidebarWidth,
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-card)',
          borderRight: '1px solid var(--border-color)',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
          zIndex: 40,
        }}
      >
        {/* Logo + collapse toggle */}
        <div style={{
          padding: collapsed ? '16px 8px' : '20px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
        }}>
          {!collapsed && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 5px',
                  borderRadius: '4px', backgroundColor: 'var(--accent)', color: '#fff',
                }}>B2B</span>
                <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--accent-text)' }}>
                  TgActor
                </span>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px', borderRadius: '6px',
              transition: 'color 0.15s',
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-main)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: collapsed ? '0 6px' : '0 10px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
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
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'all 0.12s',
                  backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                  color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
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

        {/* Theme and Logout selector */}
        {!collapsed && (
          <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                style={{
                  width: '100%', appearance: 'none', borderRadius: '8px',
                  padding: '7px 28px 7px 10px', fontSize: '11px', fontWeight: 500,
                  cursor: 'pointer', transition: 'border-color 0.15s',
                  backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)', outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              >
                <option value="deep-indigo">Indigo</option>
                <option value="dark-crimson">Crimson</option>
                <option value="dark-charcoal">Charcoal</option>
                <option value="light">Light</option>
              </select>
              <ChevronDown style={{
                width: 12, height: 12, position: 'absolute', right: 8,
                top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none',
                color: 'var(--text-muted)',
              }} />
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
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#ef4444';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              Выйти
            </button>
          </div>
        )}
      </aside>

      {/* Main container offset by sidebar width */}
      <div style={{
        flex: 1,
        marginLeft: sidebarWidth,
        transition: 'margin-left 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}>
        <ProxyBanner />
        <main style={{ flex: 1, padding: '28px 32px' }}>
          <div style={{ maxWidth: '1350px', margin: '0 auto', width: '100%' }}>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/auth/login', { password });
      const token = res.data.access_token;
      localStorage.setItem('tgcast_token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onLogin(token);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Неверный пароль администратора!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#0a0a0c',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
      color: '#e4e4e7',
    }}>
      <form onSubmit={handleSubmit} style={{
        width: '360px',
        backgroundColor: '#131316',
        border: '1px solid #27272a',
        borderRadius: '16px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(153, 27, 27, 0.1)',
            border: '1px solid rgba(153, 27, 27, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444',
          }}>
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#991b1b',
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              B2B Панель
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f4f4f5', marginTop: '8px', marginBottom: '4px' }}>
              Авторизация TgActor
            </h2>
            <p style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Доступ разрешен только владельцу системы
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Пароль администратора
          </label>
          <input
            type="password"
            placeholder="Введите пароль..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#09090b',
              border: '1px solid #27272a',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '14px',
              color: '#f4f4f5',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#991b1b'}
            onBlur={e => e.currentTarget.style.borderColor = '#27272a'}
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
            backgroundColor: '#991b1b',
            color: '#fff',
            padding: '12px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            border: 'none',
            cursor: (loading || !password) ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
            opacity: (loading || !password) ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {loading ? 'Авторизация...' : 'Войти в панель'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('tgactor_token'));

  // Ensure token is checked initially
  useEffect(() => {
    const curToken = localStorage.getItem('tgactor_token');
    setToken(curToken);
  }, []);

  if (!token) {
    return (
      <QueryClientProvider client={queryClient}>
        <Login onLogin={(t) => setToken(t)} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pools" element={<Pools />} />
                <Route path="/scenarios" element={<Scenarios />} />
                <Route path="/channels" element={<Channels />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/history" element={<HistoryPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
