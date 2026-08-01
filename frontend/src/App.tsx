import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useTheme, ThemeProvider } from './ThemeContext';
import { AlertTriangle } from 'lucide-react';
import axios from 'axios';

// Component imports
import Dashboard from './pages/Dashboard';
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

function Layout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col">
      <ProxyBanner />
      <header className="border-b border-border bg-card p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-6">
          <h1 className="text-xl font-bold tracking-tight text-accent flex items-center">
            <span className="bg-accent text-white px-2 py-0.5 rounded mr-2 text-sm">B2B</span>
            TgCast
          </h1>
          <nav className="flex space-x-6">
            <Link to="/" className="text-sm font-medium text-muted hover:text-primary transition-colors">Аккаунты</Link>
            <Link to="/scenarios" className="text-sm font-medium text-muted hover:text-primary transition-colors">Сценарии</Link>
            <Link to="/inbox" className="text-sm font-medium text-muted hover:text-primary transition-colors">Инбокс</Link>
          </nav>
        </div>
        
        <div className="flex items-center space-x-2">
          <select 
            value={theme} 
            onChange={(e) => setTheme(e.target.value as any)}
            className="bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-shadow"
          >
            <option value="dark-crimson">Dark Crimson</option>
            <option value="dark-charcoal">Dark Charcoal</option>
            <option value="light">Clean Light</option>
          </select>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
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
              <Route path="/scenarios" element={<Scenarios />} />
              <Route path="/inbox" element={<Inbox />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
