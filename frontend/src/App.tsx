import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useTheme, ThemeProvider } from './ThemeContext';
import { AlertTriangle, LayoutDashboard, Server, Route as RouteIcon, Inbox as InboxIcon, ChevronDown } from 'lucide-react';
import axios from 'axios';

// Component imports
import Dashboard from './pages/Dashboard';
import Pools from './pages/Pools';
import Scenarios from './pages/Scenarios';
import Inbox from './pages/Inbox';

const queryClient = new QueryClient();

// In dev, assuming FastAPI runs on 8000
axios.defaults.baseURL = 'http://localhost:8000';

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
      <span>КРИТИЧЕСКИЙ РИСК: Прямое подключение через IP сервера! Высокая вероятность бана.</span>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Аккаунты', icon: LayoutDashboard },
    { path: '/pools', label: 'Пулы', icon: Server },
    { path: '/scenarios', label: 'Сценарии', icon: RouteIcon },
    { path: '/inbox', label: 'Инбокс', icon: InboxIcon },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-main)' }}>
      <ProxyBanner />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className="w-60 flex flex-col flex-shrink-0"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRight: '1px solid var(--border-color)',
          }}
        >
          {/* Logo */}
          <div className="px-5 pt-6 pb-4">
            <div className="flex items-center space-x-2">
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                }}
              >
                B2B
              </span>
              <span
                className="text-xl font-bold tracking-tight"
                style={{ color: 'var(--accent-text)' }}
              >
                TgCast
              </span>
            </div>
            <div
              className="text-[11px] mt-1 pl-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Панель управления
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                    color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                    border: isActive ? '1px solid var(--accent-soft)' : '1px solid transparent',
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
                  <Icon className="w-[18px] h-[18px]" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Theme Selector */}
          <div
            className="px-3 py-4"
            style={{ borderTop: '1px solid var(--border-color)' }}
          >
            <div className="relative">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="w-full appearance-none rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition-colors duration-150 pr-8"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                }}
              >
                <option value="deep-indigo">Indigo Dark</option>
                <option value="dark-crimson">Crimson Dark</option>
                <option value="dark-charcoal">Charcoal</option>
                <option value="light">Light</option>
              </select>
              <ChevronDown
                className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className="flex-1 overflow-y-auto p-8 relative"
          style={{ backgroundColor: 'var(--bg-main)' }}
        >
          <div className="max-w-6xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pools" element={<Pools />} />
              <Route path="/scenarios" element={<Scenarios />} />
              <Route path="/inbox" element={<Inbox />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
