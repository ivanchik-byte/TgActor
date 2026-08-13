import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Upload,
  Loader2,
  Phone,
  Folder,
  RefreshCw,
  Trash2,
  User,
  X,
  Shield,
  Plus,
  Search,
  Users,
  AlertCircle,
  MessageSquare,
  Copy,
  Check,
  Globe,
  Edit2,
  ShieldAlert,
  ArrowLeft,
  ArrowRight,
  Send,
  Lock
} from 'lucide-react';
import { useToast } from '../components/ToastContext';

interface Account {
  id: number;
  phone: string;
  is_active: boolean;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  custom_name?: string | null;
  status: string;
  source_type?: string;
  position?: number;
  pool_type?: string;
  in_commenting_pool: boolean;
  in_reaction_pool: boolean;
  proxy_id?: number | null;
  created_at?: string;
}

interface ProxyItem {
  id: number;
  ip: string;
  port: number;
  protocol: string;
  username?: string | null;
  password?: string | null;
  status: string;
}

type FilterStatus = 'all' | 'active' | 'error' | 'no_proxy';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Tab: TData vs Phone Auth
  const [activeTab, setActiveTab] = useState<'tdata' | 'phone'>('tdata');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');

  // Phone login state
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');

  // TData state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [tdataPassword, setTdataPassword] = useState('');

  // Renaming inline state
  const [renamingAccountId, setRenamingAccountId] = useState<number | null>(null);
  const [renamingName, setRenamingName] = useState('');

  // Modals state
  const [selectedProfileAccount, setSelectedProfileAccount] = useState<Account | null>(null);
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<number | null>(null);
  const [editingProxyAccount, setEditingProxyAccount] = useState<Account | null>(null);
  const [selectedProxyId, setSelectedProxyId] = useState<number | null>(null);

  // Proxy manager state
  const [showAddProxy, setShowAddProxy] = useState(false);
  const [proxyInput, setProxyInput] = useState('');
  const [proxyProtocol, setProxyProtocol] = useState('socks5');
  const [confirmDeleteProxyId, setConfirmDeleteProxyId] = useState<number | null>(null);

  // Copy helper state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Скопировано в буфер обмена', 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Queries
  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data,
  });

  const { data: proxies = [], isLoading: isLoadingProxies } = useQuery<ProxyItem[]>({
    queryKey: ['proxies'],
    queryFn: async () => (await axios.get('/api/proxies')).data,
  });

  // Dynamic Avatar Gradient Generator
  const getAvatarGradient = (id: number) => {
    const gradients = [
      'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
      'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
    ];
    return gradients[id % gradients.length];
  };

  const getAccountDisplayName = (acc: Account) => {
    if (acc.custom_name) return acc.custom_name;
    if (acc.first_name || acc.last_name) {
      return [acc.first_name, acc.last_name].filter(Boolean).join(' ');
    }
    if (acc.username) return `@${acc.username}`;
    return acc.phone || `Аккаунт #${acc.id}`;
  };

  const getInitials = (acc: Account) => {
    const name = getAccountDisplayName(acc).replace('@', '');
    return name.slice(0, 2).toUpperCase() || 'TG';
  };

  // Calculations & Stats
  const stats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.status === 'active' || a.is_active).length;
    const error = accounts.filter((a) => a.status === 'error' || !a.is_active).length;
    const withProxy = accounts.filter((a) => a.proxy_id).length;
    const noProxy = total - withProxy;
    const totalProxies = proxies.length;
    const activeProxies = proxies.filter((p) => p.status === 'active').length;

    return { total, active, error, withProxy, noProxy, totalProxies, activeProxies };
  }, [accounts, proxies]);

  // Filtering Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      // Search query
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const name = (acc.custom_name || `${acc.first_name || ''} ${acc.last_name || ''}`).toLowerCase();
        const username = (acc.username || '').toLowerCase();
        const phoneStr = (acc.phone || '').toLowerCase();
        const idStr = String(acc.id);
        const matches = name.includes(q) || username.includes(q) || phoneStr.includes(q) || idStr.includes(q);
        if (!matches) return false;
      }

      // Status filter
      if (statusFilter === 'active') return acc.status === 'active' || acc.is_active;
      if (statusFilter === 'error') return acc.status === 'error' || !acc.is_active;
      if (statusFilter === 'no_proxy') return !acc.proxy_id;

      return true;
    });
  }, [accounts, searchQuery, statusFilter]);

  // Mutations
  const updateAccountName = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      await axios.patch(`/api/accounts/${id}/name`, { custom_name: name || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setRenamingAccountId(null);
      setRenamingName('');
      showToast('Имя аккаунта изменено', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось изменить имя', 'error');
    },
  });

  const reorderAccounts = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      await axios.post('/api/accounts/reorder', { ids: orderedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const handleMoveAccount = (index: number, direction: 'left' | 'right') => {
    const newAccounts = [...accounts];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    const temp = newAccounts[index];
    newAccounts[index] = newAccounts[targetIndex];
    newAccounts[targetIndex] = temp;

    const orderedIds = newAccounts.map((a) => a.id);
    reorderAccounts.mutate(orderedIds);
  };

  const updateProxy = useMutation({
    mutationFn: async ({ accountId, proxyId }: { accountId: number; proxyId: number | null }) => {
      await axios.patch(`/api/accounts/${accountId}/proxy`, { proxy_id: proxyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setEditingProxyAccount(null);
      showToast('Прокси успешно привязан', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось обновить прокси', 'error');
    },
  });

  const addProxy = useMutation({
    mutationFn: async () => {
      const lines = proxyInput.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const ip = parts[0];
        const port = parseInt(parts[1]);
        let username = null;
        let password = null;
        let protocol = proxyProtocol;
        if (parts.length === 4) {
          username = parts[2];
          password = parts[3];
        } else if (parts.length >= 5) {
          protocol = parts[2];
          username = parts[3];
          password = parts[4];
        }
        await axios.post('/api/proxies', { ip, port, protocol, username, password });
      }
    },
    onSuccess: () => {
      setProxyInput('');
      setShowAddProxy(false);
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      showToast('Прокси успешно добавлены', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка добавления прокси', 'error'),
  });

  const deleteProxy = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/proxies/${id}`),
    onSuccess: () => {
      setConfirmDeleteProxyId(null);
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      showToast('Прокси удалён', 'info');
    },
  });

  const requestPhoneCode = useMutation({
    mutationFn: async () => axios.post('/api/accounts/send-code', { phone, api_id: apiId, api_hash: apiHash }),
    onSuccess: (res) => {
      setPhoneCodeHash(res.data.phone_code_hash);
      setStep(2);
      showToast('Код авторизации успешно запрошен', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось отправить код', 'error');
    },
  });

  const submitCode = useMutation({
    mutationFn: async () =>
      axios.post('/api/accounts/sign-in', { phone, phone_code_hash: phoneCodeHash, code, password }),
    onSuccess: (res) => {
      if (res.data?.need_password) {
        setNeedPassword(true);
        showToast('Требуется двухфакторный пароль (2FA)', 'info');
      } else {
        setStep(1);
        setPhone('');
        setApiId('');
        setApiHash('');
        setCode('');
        setPassword('');
        setNeedPassword(false);
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        showToast('Аккаунт успешно авторизован', 'success');
      }
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Неверный код авторизации', 'error');
    },
  });

  const uploadTdata = useMutation({
    mutationFn: async (files: File[]) => {
      const results = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (tdataPassword) {
          formData.append('password', tdataPassword);
        }
        const res = await axios.post('/api/accounts/upload-tdata', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        results.push(res.data);
      }
      return results;
    },
    onSuccess: () => {
      setSelectedFiles([]);
      setTdataPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('Сессии успешно импортированы', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось импортировать TData', 'error');
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setConfirmDeleteAccountId(null);
      showToast('Аккаунт удален из базы', 'success');
    },
    onError: (err: any) => {
      showToast(`Не удалось удалить аккаунт: ${err?.response?.data?.detail || err.message}`, 'error');
    },
  });

  const testConnection = useMutation({
    mutationFn: async (id: number) => (await axios.post(`/api/accounts/${id}/test`)).data,
    onSuccess: (data) => {
      if (data.status === 'ok') {
        showToast(data.message, 'success');
      } else {
        showToast(data.message, 'error');
      }
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: any) => {
      showToast(`Ошибка соединения: ${err?.response?.data?.detail || err.message}`, 'error');
    },
  });

  // Drag & Drop & Paste Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const zipFiles = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.zip'));
      if (zipFiles.length > 0) {
        setSelectedFiles((prev) => [...prev, ...zipFiles]);
        showToast(`Добавлено архивов: ${zipFiles.length} шт.`, 'info');
      } else {
        showToast('Пожалуйста, загружайте файлы в формате .zip', 'error');
      }
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (activeTab !== 'tdata') return;
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const zipFiles = Array.from(files).filter((f) => f.name.endsWith('.zip'));
        if (zipFiles.length > 0) {
          setSelectedFiles((prev) => [...prev, ...zipFiles]);
          showToast(`Вставлено файлов из буфера: ${zipFiles.length} шт.`, 'info');
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [activeTab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Header & Quick Analytics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--accent-soft)',
                  border: '1px solid var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-text)',
                }}
              >
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: 'var(--text-main)',
                    margin: 0,
                  }}
                >
                  Управление аккаунтами
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
                  Пул Telegram-сессий, назначение прокси и мониторинг работоспособности
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['accounts'] })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted" />
              <span>Обновить статус</span>
            </button>
          </div>
        </div>

        {/* 4 Metric Bento Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
          }}
        >
          {/* Total Accounts */}
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Всего аккаунтов
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {isLoadingAccounts ? '...' : stats.total}
              </div>
              <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                <span>{stats.active} активных</span>
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Active Status */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${statusFilter === 'active' ? 'var(--accent)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => {
              if (statusFilter !== 'active') e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Готовы к работе
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {isLoadingAccounts ? '...' : stats.active}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Подключены к Telegram
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check className="w-5 h-5" />
            </div>
          </div>

          {/* Errors / Attention */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'error' ? 'all' : 'error')}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${statusFilter === 'error' ? '#ef4444' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#ef4444')}
            onMouseLeave={(e) => {
              if (statusFilter !== 'error') e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Требуют внимания
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: stats.error > 0 ? '#ef4444' : 'var(--text-main)', marginTop: '4px' }}>
                {isLoadingAccounts ? '...' : stats.error}
              </div>
              <div style={{ fontSize: '12px', color: stats.error > 0 ? '#ef4444' : 'var(--text-muted)', marginTop: '2px' }}>
                {stats.error > 0 ? 'Ошибка авторизации' : 'Все сессии в норме'}
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>

          {/* Proxy Pool */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'no_proxy' ? 'all' : 'no_proxy')}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${statusFilter === 'no_proxy' ? 'var(--accent)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => {
              if (statusFilter !== 'no_proxy') e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Прокси защита
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {stats.withProxy} / {stats.total}
              </div>
              <div style={{ fontSize: '12px', color: stats.noProxy > 0 ? '#eab308' : 'var(--text-muted)', marginTop: '2px' }}>
                {stats.noProxy > 0 ? `${stats.noProxy} без прокси` : '100% через прокси'}
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Import / Add Accounts Hub */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 2px 0' }}>
              Импорт и подключение аккаунтов
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Добавляйте сессии через tdata ZIP-архивы или авторизуйтесь по официальному SMS-коду Telegram
            </p>
          </div>

          {/* Tab Selector */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-main)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              onClick={() => setActiveTab('tdata')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: activeTab === 'tdata' ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'tdata' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'tdata' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>TData Архив (.zip)</span>
            </button>
            <button
              onClick={() => setActiveTab('phone')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: activeTab === 'phone' ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'phone' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'phone' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>SMS Авторизация</span>
            </button>
          </div>
        </div>

        {/* Tab 1: TData Upload Area */}
        {activeTab === 'tdata' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                border: isDragging ? '2px dashed var(--accent)' : '2px dashed var(--border-color)',
                borderRadius: '12px',
                padding: '24px 20px',
                backgroundColor: isDragging ? 'var(--accent-soft)' : 'var(--bg-main)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Upload className="w-5 h-5" />
              </div>

              <div>
                <p style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: 600, margin: '0 0 2px 0' }}>
                  Перетащите сюда .zip архивы или нажмите для выбора
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
                  Поддерживается множественный выбор и вставка файлов прямо из буфера (Ctrl+V)
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>

            {/* Selected files list & 2FA cloud password */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <div style={{ position: 'relative' }}>
                <Lock
                  style={{
                    width: '14px',
                    height: '14px',
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="password"
                  placeholder="Пароль 2FA облачной защиты (если установлен)..."
                  value={tdataPassword}
                  onChange={(e) => setTdataPassword(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px 8px 34px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                {selectedFiles.length > 0 && (
                  <button
                    onClick={() => setSelectedFiles([])}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 10px',
                    }}
                  >
                    Очистить ({selectedFiles.length})
                  </button>
                )}

                <button
                  disabled={selectedFiles.length === 0 || uploadTdata.isPending}
                  onClick={() => uploadTdata.mutate(selectedFiles)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: selectedFiles.length === 0 || uploadTdata.isPending ? 'not-allowed' : 'pointer',
                    opacity: selectedFiles.length === 0 || uploadTdata.isPending ? 0.6 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {uploadTdata.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploadTdata.isPending ? 'Импортируем...' : `Загрузить ${selectedFiles.length ? `(${selectedFiles.length})` : ''}`}</span>
                </button>
              </div>
            </div>

            {/* Selected files pills */}
            {selectedFiles.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  backgroundColor: 'var(--bg-main)',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                }}
              >
                {selectedFiles.map((file, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      fontSize: '11px',
                      color: 'var(--text-main)',
                    }}
                  >
                    <Folder className="w-3 h-3 text-muted" />
                    <span>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                    <button
                      onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '12px',
                        lineHeight: 1,
                      }}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: SMS Phone Auth */}
        {activeTab === 'phone' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '560px' }}>
            {step === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Номер телефона
                  </label>
                  <input
                    type="text"
                    placeholder="+79991234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: 'var(--text-main)',
                      outline: 'none',
                      marginTop: '4px',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      API ID (с my.telegram.org)
                    </label>
                    <input
                      type="text"
                      placeholder="1234567"
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        outline: 'none',
                        marginTop: '4px',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      API Hash
                    </label>
                    <input
                      type="text"
                      placeholder="abcdef1234567890..."
                      value={apiHash}
                      onChange={(e) => setApiHash(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        outline: 'none',
                        marginTop: '4px',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    />
                  </div>
                </div>

                <button
                  onClick={() => requestPhoneCode.mutate()}
                  disabled={requestPhoneCode.isPending || !phone}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: requestPhoneCode.isPending || !phone ? 'not-allowed' : 'pointer',
                    opacity: requestPhoneCode.isPending || !phone ? 0.6 : 1,
                    marginTop: '4px',
                  }}
                >
                  {requestPhoneCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{requestPhoneCode.isPending ? 'Отправляем запрос...' : 'Запросить код в Telegram'}</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Код подтверждения из Telegram
                  </label>
                  <input
                    type="text"
                    placeholder="12345"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      color: 'var(--text-main)',
                      outline: 'none',
                      marginTop: '4px',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                  />
                </div>

                {needPassword && (
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Пароль двухфакторной аутентификации (2FA)
                    </label>
                    <input
                      type="password"
                      placeholder="Введите 2FA пароль..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                        outline: 'none',
                        marginTop: '4px',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    onClick={() => submitCode.mutate()}
                    disabled={submitCode.isPending || !code || (needPassword && !password)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '9px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--accent)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: submitCode.isPending || !code ? 'not-allowed' : 'pointer',
                      opacity: submitCode.isPending || !code ? 0.6 : 1,
                    }}
                  >
                    {submitCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{submitCode.isPending ? 'Авторизуем...' : 'Войти в аккаунт'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setStep(1);
                      setCode('');
                      setNeedPassword(false);
                      setPassword('');
                    }}
                    style={{
                      padding: '9px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Назад
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Search & Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '10px 16px',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', minWidth: '260px', flex: '1 1 260px', maxWidth: '380px' }}>
          <Search
            style={{
              width: '16px',
              height: '16px',
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Поиск по имени, @username, телефону, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 12px 8px 36px',
              fontSize: '13px',
              color: 'var(--text-main)',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px',
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Все', count: stats.total },
            { id: 'active', label: 'Активные', count: stats.active },
            { id: 'error', label: 'С ошибкой', count: stats.error },
            { id: 'no_proxy', label: 'Без прокси', count: stats.noProxy },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as FilterStatus)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
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
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-main)',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Accounts Cards Grid */}
      <div>
        {isLoadingAccounts ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '14px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  opacity: 0.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: 'var(--bg-main)' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ height: '14px', width: '60%', backgroundColor: 'var(--bg-main)', borderRadius: '4px' }} />
                    <div style={{ height: '10px', width: '40%', backgroundColor: 'var(--bg-main)', borderRadius: '4px' }} />
                  </div>
                </div>
                <div style={{ height: '36px', backgroundColor: 'var(--bg-main)', borderRadius: '8px' }} />
              </div>
            ))}
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '50px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <User className="w-10 h-10 text-muted opacity-40" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              {searchQuery ? 'Ничего не найдено' : 'Аккаунты отсутствуют'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, maxWidth: '400px' }}>
              {searchQuery
                ? `По запросу «${searchQuery}» совпадений нет. Сбросьте поиск.`
                : 'Воспользуйтесь блоком выше для импорта TData или SMS авторизации.'}
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredAccounts.map((acc, index) => {
              const displayName = getAccountDisplayName(acc);
              const initials = getInitials(acc);
              const isError = acc.status === 'error' || !acc.is_active;

              return (
                <div
                  key={acc.id}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Card Header: Avatar & Info */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      {/* Avatar */}
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          background: getAvatarGradient(acc.id),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '15px',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          position: 'relative',
                        }}
                      >
                        {initials}
                        <span
                          style={{
                            position: 'absolute',
                            bottom: '-3px',
                            right: '-3px',
                            fontSize: '8px',
                            fontWeight: 700,
                            backgroundColor: 'var(--bg-main)',
                            padding: '1px 3px',
                            borderRadius: '3px',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {acc.source_type || 'tdata'}
                        </span>
                      </div>

                      {/* Name & Subtitle */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {renamingAccountId === acc.id ? (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={renamingName}
                              onChange={(e) => setRenamingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') updateAccountName.mutate({ id: acc.id, name: renamingName });
                                else if (e.key === 'Escape') setRenamingAccountId(null);
                              }}
                              autoFocus
                              style={{
                                width: '100%',
                                backgroundColor: 'var(--bg-main)',
                                border: '1px solid var(--accent)',
                                borderRadius: '6px',
                                padding: '2px 6px',
                                fontSize: '12px',
                                color: 'var(--text-main)',
                                outline: 'none',
                              }}
                            />
                            <button
                              onClick={() => updateAccountName.mutate({ id: acc.id, name: renamingName })}
                              style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '2px' }}
                              title="Сохранить"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setRenamingAccountId(null)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                              title="Отмена"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              onClick={() => {
                                setRenamingAccountId(acc.id);
                                setRenamingName(acc.custom_name || displayName);
                              }}
                              title="Кликните для переименования"
                              style={{
                                fontSize: '14px',
                                fontWeight: 700,
                                color: 'var(--text-main)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                cursor: 'pointer',
                              }}
                            >
                              {displayName}
                            </span>
                            <Edit2
                              onClick={() => {
                                setRenamingAccountId(acc.id);
                                setRenamingName(acc.custom_name || displayName);
                              }}
                              className="w-3 h-3 text-muted"
                              style={{ cursor: 'pointer', opacity: 0.6 }}
                            />
                          </div>
                        )}

                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {acc.username && <span>@{acc.username}</span>}
                          {acc.username && acc.phone && <span>•</span>}
                          {acc.phone && <span>{acc.phone}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge & Move Arrows */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          backgroundColor: isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                          color: isError ? '#ef4444' : '#22c55e',
                          border: `1px solid ${isError ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)'}`,
                        }}
                      >
                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: isError ? '#ef4444' : '#22c55e' }} />
                        {acc.status || (acc.is_active ? 'active' : 'error')}
                      </span>

                      {/* Reorder Buttons */}
                      <div style={{ display: 'flex', gap: '2px' }}>
                        <button
                          onClick={() => handleMoveAccount(index, 'left')}
                          disabled={index === 0}
                          style={{
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: index === 0 ? 'var(--border-color)' : 'var(--text-muted)',
                            padding: '2px 4px',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Переместить левее"
                        >
                          <ArrowLeft className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={() => handleMoveAccount(index, 'right')}
                          disabled={index === accounts.length - 1}
                          style={{
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: index === accounts.length - 1 ? 'var(--border-color)' : 'var(--text-muted)',
                            padding: '2px 4px',
                            cursor: index === accounts.length - 1 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Переместить правее"
                        >
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Body: Proxy Info */}
                  <div
                    style={{
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Globe className="w-3.5 h-3.5 text-muted" />
                      <span style={{ color: 'var(--text-muted)' }}>Прокси:</span>
                      <span style={{ fontWeight: 600, color: acc.proxy_id ? 'var(--text-main)' : '#eab308' }}>
                        {acc.proxy_id ? `ID #${acc.proxy_id}` : 'Не привязан'}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setEditingProxyAccount(acc);
                        setSelectedProxyId(acc.proxy_id || null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '2px 4px',
                      }}
                    >
                      {acc.proxy_id ? 'Сменить' : 'Привязать'}
                    </button>
                  </div>

                  {/* Card Actions Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '12px',
                    }}
                  >
                    <button
                      onClick={() => setSelectedProfileAccount(acc)}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    >
                      Профиль
                    </button>

                    <button
                      onClick={() => {
                        localStorage.setItem('selected_inbox_account_id', String(acc.id));
                        navigate('/inbox');
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    >
                      <MessageSquare className="w-3 h-3 text-muted" />
                      <span>Чаты</span>
                    </button>

                    <button
                      onClick={() => testConnection.mutate(acc.id)}
                      disabled={testConnection.isPending && testConnection.variables === acc.id}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    >
                      {testConnection.isPending && testConnection.variables === acc.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-muted" />
                      ) : (
                        <span>Тест</span>
                      )}
                    </button>

                    <button
                      onClick={() => setConfirmDeleteAccountId(acc.id)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)')}
                      title="Удалить аккаунт"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Proxy Management Module */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield className="w-5 h-5" style={{ color: 'var(--accent-text)' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Управление прокси-серверами
            </h2>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '10px',
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent-text)',
              }}
            >
              {proxies.length}
            </span>
          </div>

          <button
            onClick={() => setShowAddProxy(!showAddProxy)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: showAddProxy ? 'var(--bg-main)' : 'var(--accent)',
              border: showAddProxy ? '1px solid var(--border-color)' : 'none',
              color: showAddProxy ? 'var(--text-muted)' : '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {showAddProxy ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showAddProxy ? 'Скрыть форму' : 'Добавить прокси'}</span>
          </button>
        </div>

        {/* Add Proxy Form */}
        {showAddProxy && (
          <div
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                Список прокси (по одному на строку)
              </label>
              <textarea
                placeholder={'ip:port\nip:port:user:pass\n192.168.1.1:1080:admin:secret'}
                value={proxyInput}
                onChange={(e) => setProxyInput(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: 'var(--text-main)',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Протокол по умолчанию
                </label>
                <select
                  value={proxyProtocol}
                  onChange={(e) => setProxyProtocol(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP</option>
                </select>
              </div>

              <button
                onClick={() => addProxy.mutate()}
                disabled={!proxyInput.trim() || addProxy.isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: !proxyInput.trim() || addProxy.isPending ? 'not-allowed' : 'pointer',
                  opacity: !proxyInput.trim() || addProxy.isPending ? 0.6 : 1,
                }}
              >
                {addProxy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{addProxy.isPending ? 'Добавляем...' : 'Сохранить прокси'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Proxies List */}
        {isLoadingProxies ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : proxies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)' }}>
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 2px 0' }}>Прокси не добавлены</p>
            <p style={{ fontSize: '12px', margin: 0 }}>Нажмите «Добавить прокси» для импорта ваших серверов</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {proxies.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: p.status === 'active' ? '#10b981' : '#ef4444',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.ip}:{p.port}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '4px' }}>
                      <span style={{ textTransform: 'uppercase', color: '#818cf8', fontWeight: 700 }}>{p.protocol}</span>
                      {p.username && <span>• {p.username}</span>}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setConfirmDeleteProxyId(p.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== MODAL: Profile Details ===== */}
      {selectedProfileAccount && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setSelectedProfileAccount(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '24px',
              width: '420px',
              maxWidth: '92vw',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                Профиль Telegram-аккаунта
              </h3>
              <button
                onClick={() => setSelectedProfileAccount(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: getAvatarGradient(selectedProfileAccount.id),
                  color: '#ffffff',
                  fontSize: '20px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {getInitials(selectedProfileAccount)}
              </div>
              <div style={{ minWidth: 0 }}>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  {getAccountDisplayName(selectedProfileAccount)}
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {selectedProfileAccount.username ? `@${selectedProfileAccount.username}` : 'Юзернейм отсутствует'}
                </span>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>ID аккаунта:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>#{selectedProfileAccount.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Телефон:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{selectedProfileAccount.phone || '—'}</span>
                  {selectedProfileAccount.phone && (
                    <button
                      onClick={() => copyToClipboard(selectedProfileAccount.phone, 'phone')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                    >
                      {copiedKey === 'phone' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Источник:</span>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-main)' }}>
                  {selectedProfileAccount.source_type || 'tdata'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Статус:</span>
                <span style={{ fontWeight: 700, color: selectedProfileAccount.status === 'active' ? '#22c55e' : '#ef4444' }}>
                  {selectedProfileAccount.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Прокси:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                  {selectedProfileAccount.proxy_id ? `ID #${selectedProfileAccount.proxy_id}` : 'Прямое подключение'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedProfileAccount(null)}
              style={{
                padding: '9px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent)',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* ===== MODAL: Edit Proxy ===== */}
      {editingProxyAccount && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setEditingProxyAccount(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '24px',
              width: '400px',
              maxWidth: '92vw',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                Назначение прокси
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Выберите прокси для {getAccountDisplayName(editingProxyAccount)}:
              </p>
            </div>

            <select
              value={selectedProxyId || ''}
              onChange={(e) => setSelectedProxyId(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '13px',
                color: 'var(--text-main)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">Без прокси (Прямое подключение)</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  ID #{p.id}: {p.ip}:{p.port} ({p.protocol.toUpperCase()})
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setEditingProxyAccount(null)}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={() => updateProxy.mutate({ accountId: editingProxyAccount.id, proxyId: selectedProxyId })}
                disabled={updateProxy.isPending}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: updateProxy.isPending ? 'not-allowed' : 'pointer',
                  opacity: updateProxy.isPending ? 0.6 : 1,
                }}
              >
                {updateProxy.isPending ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: Delete Account Confirmation ===== */}
      {confirmDeleteAccountId !== null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setConfirmDeleteAccountId(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '24px',
              width: '380px',
              maxWidth: '92vw',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                Удаление аккаунта
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Вы действительно хотите удалить этот аккаунт? Сессия и сохраненные данные будут стерты из базы.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setConfirmDeleteAccountId(null)}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={() => deleteAccount.mutate(confirmDeleteAccountId)}
                disabled={deleteAccount.isPending}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '8px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: deleteAccount.isPending ? 'not-allowed' : 'pointer',
                  opacity: deleteAccount.isPending ? 0.6 : 1,
                }}
              >
                {deleteAccount.isPending ? 'Удаляем...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: Delete Proxy Confirmation ===== */}
      {confirmDeleteProxyId !== null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setConfirmDeleteProxyId(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '24px',
              width: '380px',
              maxWidth: '92vw',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                Удаление прокси
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Удалить выбранный прокси-сервер? Аккаунты, привязанные к нему, останутся без прокси.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setConfirmDeleteProxyId(null)}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={() => deleteProxy.mutate(confirmDeleteProxyId)}
                disabled={deleteProxy.isPending}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '8px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: deleteProxy.isPending ? 'not-allowed' : 'pointer',
                  opacity: deleteProxy.isPending ? 0.6 : 1,
                }}
              >
                {deleteProxy.isPending ? 'Удаляем...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
