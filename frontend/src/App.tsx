import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useTheme, ThemeProvider } from './ThemeContext';
import { AlertTriangle } from 'lucide-react';
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
    <div className="bg-red-600 text-white p-3 flex items-center justify-center font-bold sticky top-0 z-50">
      <AlertTriangle className="mr-2 h-5 w-5" />
      КРИТИЧЕСКИЙ РИСК: Прямое подключение через IP сервера! Высокая вероятность мгновенного бана всей сетки аккаунтов антифрод-системой Telegram.
    </div>
  );
}

import { useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, Route as RouteIcon, Inbox as InboxIcon } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col bg-background">
      <ProxyBanner />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card flex flex-col shadow-sm">
          <div className="p-6 pb-2">
            <h1 className="text-2xl font-bold tracking-tight text-accent flex items-center mb-8">
              <span className="bg-accent text-white px-2 py-0.5 rounded mr-2 text-sm">B2B</span>
              TgCast
            </h1>
          </div>
          
          <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-md transition-colors text-sm font-medium ${
                    isActive 
                      ? 'bg-accent/10 text-accent border border-accent/20' 
                      : 'text-muted hover:bg-background hover:text-primary'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-border">
            <select 
              value={theme} 
              onChange={(e) => setTheme(e.target.value as any)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-shadow text-primary"
            >
              <option value="deep-indigo">Telegram Dark</option>
              <option value="dark-crimson">Dark Crimson</option>
              <option value="dark-charcoal">Dark Charcoal</option>
              <option value="light">Clean Light</option>
            </select>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 relative">
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
