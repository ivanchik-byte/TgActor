import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Clock,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle,
  Bot,
  Eye,
  X,
  Download,
  Trash2,
  Activity,
  Copy,
  Check,
  MessageSquare,
  Heart,
  Send,
  UserMinus,
  UserPlus,
  Zap,
  RotateCcw,
  Terminal,
  LayoutList,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Layers,
  User,
  Tag,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { useToast } from '../components/ToastContext';

interface ActionLogItem {
  id: number;
  executed_at: string;
  account_id: number | null;
  account_phone: string | null;
  account_name: string | null;
  account_username: string | null;
  scenario_id: number | null;
  action_type: string;
  status: string;
  target: string | null;
  target_id: string | null;
  details: string | null;
}

interface LogStats {
  total: number;
  ok_count: number;
  error_count: number;
  warning_count: number;
  active_accounts: number;
  count_24h: number;
  success_rate: number;
}

interface LogFiltersData {
  action_types: string[];
  statuses: string[];
  accounts: { id: number; label: string }[];
}

type ViewMode = 'timeline' | 'console' | 'table';

export const HistoryPage: React.FC = () => {
  const [logs, setLogs] = useState<ActionLogItem[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [filterOptions, setFilterOptions] = useState<LogFiltersData>({
    action_types: [],
    statuses: [],
    accounts: [],
  });

  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScrollConsole, setAutoScrollConsole] = useState(true);

  // Dynamic filter state
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('bot_actions');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [quickPreset, setQuickPreset] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [limit, setLimit] = useState<number>(150);

  // Expanded cards state for timeline
  const [expandedLogIds, setExpandedLogIds] = useState<Set<number>>(new Set());

  // Slide-over drawer state
  const [selectedLog, setSelectedLog] = useState<ActionLogItem | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<'all' | '7days' | '30days'>('all');
  const [copied, setCopied] = useState(false);

  const consoleContainerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const fetchFiltersAndStats = async () => {
    try {
      const [statsRes, filtersRes] = await Promise.all([
        axios.get('/api/logs/stats'),
        axios.get('/api/logs/filters'),
      ]);
      setStats(statsRes.data);
      setFilterOptions(filtersRes.data);
    } catch {
      // Non-blocking fetch fail
    }
  };

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { limit };

      if (selectedAccount !== 'all') params.account_id = selectedAccount;
      if (selectedAction !== 'all') params.action_type = selectedAction;
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedPeriod !== 'all') params.period = selectedPeriod;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await axios.get('/api/logs/actions', { params });
      setLogs(res.data);
      fetchFiltersAndStats();
    } catch {
      showToast('Ошибка обновления логов', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedAction, selectedStatus, selectedPeriod, searchQuery, limit, showToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // Auto scroll console view to bottom on new logs
  useEffect(() => {
    if (viewMode === 'console' && autoScrollConsole && consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [logs, viewMode, autoScrollConsole]);

  const handleApplyPreset = (presetKey: string) => {
    setQuickPreset(presetKey);
    setSelectedAccount('all');
    setSelectedPeriod('all');

    switch (presetKey) {
      case 'all':
        // Default clean view: all real bot actions, no background daemon polling spam
        setSelectedStatus('all');
        setSelectedAction('bot_actions');
        break;
      case 'system':
        // Dedicated Monitoring tab
        setSelectedStatus('all');
        setSelectedAction('channel_monitor');
        break;
      case 'errors':
        setSelectedStatus('error');
        setSelectedAction('all');
        break;
      case 'cooldowns':
        setSelectedStatus('warning');
        setSelectedAction('all');
        break;
      case 'engagement':
        setSelectedStatus('all');
        setSelectedAction('comment_send');
        break;
      case 'raw_all':
        setSelectedStatus('all');
        setSelectedAction('all');
        break;
      default:
        setSelectedStatus('all');
        setSelectedAction('all');
        break;
    }
  };

  const handleResetFilters = () => {
    setQuickPreset('all');
    setSelectedAccount('all');
    setSelectedAction('bot_actions');
    setSelectedStatus('all');
    setSelectedPeriod('all');
    setSearchQuery('');
    setLimit(150);
  };

  const handleClearLogs = async () => {
    try {
      await axios.post(`/api/logs/clear?mode=${clearMode}`);
      showToast('Журнал логов успешно очищен', 'success');
      setShowClearModal(false);
      fetchLogs();
    } catch {
      showToast('Не удалось очистить логи', 'error');
    }
  };

  const handleExportCSV = () => {
    let url = '/api/logs/export?';
    if (selectedAccount !== 'all') url += `account_id=${selectedAccount}&`;
    if (selectedAction !== 'all') url += `action_type=${selectedAction}&`;
    if (selectedStatus !== 'all') url += `status=${selectedStatus}&`;
    window.open(url, '_blank');
  };

  const toggleExpandCard = (id: number) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyText = (text: string, label = 'Данные') => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast(`${label} скопированы в буфер обмена`, 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatJsonPretty = (rawDetails: string | null) => {
    if (!rawDetails) return '—';
    try {
      const parsed = JSON.parse(rawDetails);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return rawDetails;
    }
  };

  const getActionMeta = (actionType: string) => {
    switch (actionType) {
      case 'comment_send':
      case 'comment':
        return { label: 'Комментирование', icon: MessageSquare, color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' };
      case 'reaction_add':
      case 'react':
        return { label: 'Реакция Emoji', icon: Heart, color: '#f472b6', bg: 'rgba(244, 114, 182, 0.15)' };
      case 'dm_outbound':
      case 'dm':
        return { label: 'ЛС Сообщение', icon: Send, color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)' };
      case 'dm_cooldown':
        return { label: 'Пауза (Flood)', icon: Clock, color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' };
      case 'unsubscribe':
        return { label: 'Отписка от чата', icon: UserMinus, color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' };
      case 'subscribe':
        return { label: 'Подписка', icon: UserPlus, color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)' };
      case 'banter_send':
        return { label: 'Бао Диалог', icon: Bot, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
      case 'health_check':
        return { label: 'Мониторинг системы', icon: Zap, color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' };
      case 'preflight_check':
      case 'preflight':
        return { label: 'Проверка чата', icon: Eye, color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)' };
      default:
        return { label: actionType, icon: Activity, color: 'var(--accent-text)', bg: 'var(--accent-soft)' };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
      case 'success':
        return { color: '#4ade80', border: '#22c55e', label: 'Успешно' };
      case 'error':
        return { color: '#f87171', border: '#ef4444', label: 'Ошибка' };
      case 'warning':
      case 'cooldown':
        return { color: '#fbbf24', border: '#f59e0b', label: 'Пауза' };
      default:
        return { color: 'var(--accent-text)', border: 'var(--accent)', label: status };
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const formatDateFull = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const hasActiveFilters = selectedAccount !== 'all' || selectedAction !== 'all' || selectedStatus !== 'all' || selectedPeriod !== 'all' || searchQuery.trim() !== '';

  return (
    <div style={{ padding: '4px 0', width: '100%', color: 'var(--text-main)', fontFamily: 'Inter, sans-serif' }}>

      {/* DYNAMIC THEMED HEADER BANNER (PHOTO 2 DESIGN WITH FULL THEME COMPATIBILITY) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '16px',
        backgroundColor: 'var(--bg-card)',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.25)',
        transition: 'background-color 0.3s ease, border-color 0.3s ease'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Themed Icon Badge */}
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'var(--accent-soft)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
              transition: 'all 0.3s ease'
            }}>
              <Activity size={22} />
            </div>

            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
                Журнал активности аккаунтов
              </h1>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                События в реальном времени • Таблица <code>bot_action_log</code>
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Actions & View Switcher (Uses Theme Colors) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Theme-aware Mode Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-main)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            transition: 'all 0.3s ease'
          }}>
            <button
              onClick={() => setViewMode('timeline')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewMode === 'timeline' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'timeline' ? '#ffffff' : 'var(--text-muted)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: viewMode === 'timeline' ? '0 4px 12px var(--accent-soft)' : 'none'
              }}
            >
              <Layers size={14} /> Хронология
            </button>

            <button
              onClick={() => setViewMode('console')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewMode === 'console' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'console' ? '#ffffff' : 'var(--text-muted)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: viewMode === 'console' ? '0 4px 12px var(--accent-soft)' : 'none'
              }}
            >
              <Terminal size={14} /> Консоль
            </button>

            <button
              onClick={() => setViewMode('table')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewMode === 'table' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'table' ? '#ffffff' : 'var(--text-muted)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: viewMode === 'table' ? '0 4px 12px var(--accent-soft)' : 'none'
              }}
            >
              <LayoutList size={14} /> Аналитика
            </button>
          </div>

          {/* Theme-aware Auto refresh toggle + action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)'
            }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              Auto (4s)
            </label>

            <button
              onClick={fetchLogs}
              disabled={loading}
              title="Обновить данные логов"
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>

            <button
              onClick={handleExportCSV}
              title="Экспорт логов в CSV файл"
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <Download size={14} /> CSV
            </button>

            <button
              onClick={() => setShowClearModal(true)}
              title="Очистить логи"
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Bar & Presets */}
      {stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {/* Stat Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px'
          }}>
            <div style={{
              backgroundColor: 'var(--bg-card)',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.3s ease, border-color 0.3s ease'
            }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)' }}>
                <Layers size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Всего записей</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>{stats.total}</div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-card)',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.3s ease, border-color 0.3s ease'
            }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ade80' }}>
                <CheckCircle size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Успешность</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>{stats.success_rate}%</div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-card)',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.3s ease, border-color 0.3s ease'
            }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Ошибки</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: stats.error_count > 0 ? '#f87171' : '#4ade80' }}>{stats.error_count}</div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-card)',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.3s ease, border-color 0.3s ease'
            }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)' }}>
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Активные аккаунты</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-text)' }}>{stats.active_accounts}</div>
              </div>
            </div>
          </div>

          {/* Quick Filter Presets Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <Sparkles size={14} /> Пресеты:
            </span>
            {[
              { key: 'all', label: '🤖 Действия ботов' },
              { key: 'system', label: '📡 Мониторинг каналов' },
              { key: 'errors', label: '🔴 Ошибки' },
              { key: 'engagement', label: '💬 Комментарии' },
              { key: 'cooldowns', label: '⏳ Флуд / Паузы' },
              { key: 'raw_all', label: '⚡ Все сырые логи' },
            ].map((preset) => (
              <button
                key={preset.key}
                onClick={() => handleApplyPreset(preset.key)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  backgroundColor: quickPreset === preset.key ? 'var(--accent)' : 'var(--bg-card)',
                  color: quickPreset === preset.key ? '#ffffff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* REIMAGINED COMPACT UNIFIED FILTER TOOLBAR (REPLACES PHOTO 1 ENTIRELY) */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        padding: '12px 16px',
        borderRadius: '14px',
        border: '1px solid var(--border-color)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        transition: 'background-color 0.3s ease, border-color 0.3s ease'
      }}>
        {/* Integrated Search Input with Live Filtering */}
        <div style={{ flex: 1, minWidth: '220px', position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Фильтр по ключевым словам, каналу, аккаунту..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 30px 7px 34px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.84rem',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Compact Integrated Filter Pills Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Account Filter Pill */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <User size={13} style={{ position: 'absolute', left: '10px', color: 'var(--accent-text)', pointerEvents: 'none' }} />
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{
                padding: '6px 26px 6px 28px',
                borderRadius: '8px',
                border: selectedAccount !== 'all' ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                backgroundColor: selectedAccount !== 'all' ? 'var(--accent-soft)' : 'var(--bg-main)',
                color: selectedAccount !== 'all' ? 'var(--accent-text)' : 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <option value="all" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>Аккаунт: Все</option>
              {filterOptions.accounts.map((acc) => (
                <option key={acc.id} value={acc.id} style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>
                  {acc.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: '8px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>

          {/* Action Type Filter Pill */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Tag size={13} style={{ position: 'absolute', left: '10px', color: 'var(--accent-text)', pointerEvents: 'none' }} />
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              style={{
                padding: '6px 26px 6px 28px',
                borderRadius: '8px',
                border: selectedAction !== 'all' && selectedAction !== 'bot_actions' ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                backgroundColor: selectedAction !== 'all' && selectedAction !== 'bot_actions' ? 'var(--accent-soft)' : 'var(--bg-main)',
                color: selectedAction !== 'all' && selectedAction !== 'bot_actions' ? 'var(--accent-text)' : 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <option value="bot_actions" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>🤖 Действия ботов (без спама)</option>
              <option value="channel_monitor" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>📡 Мониторинг каналов</option>
              <option value="all" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>⚡ Все типы логов</option>
              {filterOptions.action_types.filter(act => act !== 'channel_monitor').map((act) => (
                <option key={act} value={act} style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>
                  {act}
                </option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: '8px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>

          {/* Status Filter Pill */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <ShieldCheck size={13} style={{ position: 'absolute', left: '10px', color: 'var(--accent-text)', pointerEvents: 'none' }} />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '6px 26px 6px 28px',
                borderRadius: '8px',
                border: selectedStatus !== 'all' ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                backgroundColor: selectedStatus !== 'all' ? 'var(--accent-soft)' : 'var(--bg-main)',
                color: selectedStatus !== 'all' ? 'var(--accent-text)' : 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <option value="all" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>Статус: Все</option>
              <option value="ok" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>ok (Успешно)</option>
              <option value="error" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>Ошибка</option>
              <option value="warning" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>Пауза / Flood</option>
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: '8px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>

          {/* Period Filter Pill */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Calendar size={13} style={{ position: 'absolute', left: '10px', color: 'var(--accent-text)', pointerEvents: 'none' }} />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{
                padding: '6px 26px 6px 28px',
                borderRadius: '8px',
                border: selectedPeriod !== 'all' ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                backgroundColor: selectedPeriod !== 'all' ? 'var(--accent-soft)' : 'var(--bg-main)',
                color: selectedPeriod !== 'all' ? 'var(--accent-text)' : 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <option value="all" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>Период: Все время</option>
              <option value="today" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>Сегодня</option>
              <option value="24h" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>За 24 часа</option>
              <option value="7d" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>За 7 дней</option>
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: '8px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>

          {/* Reset Filters Icon Button (Shown only when filters applied) */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              title="Сбросить все фильтры"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} /> Сброс
            </button>
          )}
        </div>
      </div>

      {/* MAIN VIEW CONTENT CONTAINER */}

      {/* VIEW 1: TIMELINE STREAM VIEW */}
      {viewMode === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              {loading ? 'Загрузка хронологии...' : 'Журнал логов пуст. Логи сервера будут отображаться здесь в реальном времени при выполнении операций ботами.'}
            </div>
          ) : (
            logs.map((log) => {
              const meta = getActionMeta(log.action_type);
              const statusMeta = getStatusColor(log.status);
              const IconComp = meta.icon;
              const isExpanded = expandedLogIds.has(log.id);

              return (
                <div
                  key={log.id}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    borderLeft: `4px solid ${statusMeta.border}`,
                    padding: '14px 18px',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  {/* Card Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: meta.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: meta.color
                      }}>
                        <IconComp size={16} />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-main)' }}>{meta.label}</span>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '10px',
                            backgroundColor: `${statusMeta.border}22`,
                            color: statusMeta.color,
                            border: `1px solid ${statusMeta.border}44`
                          }}>
                            {statusMeta.label}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{formatDateFull(log.executed_at)}</span>
                          {log.account_id && (
                            <>
                              <span>•</span>
                              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                Аккаунт #{log.account_id}
                                {log.account_username && ` (@${log.account_username})`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Target & Expand Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {log.target && (
                        <div style={{
                          backgroundColor: 'var(--bg-main)',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: 'var(--text-main)',
                          border: '1px solid var(--border-color)'
                        }}>
                          🎯 {log.target} {log.target_id ? `(${log.target_id})` : ''}
                        </div>
                      )}

                      <button
                        onClick={() => toggleExpandCard(log.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.78rem'
                        }}
                      >
                        {isExpanded ? 'Свернуть' : 'Детали'}
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>

                      <button
                        onClick={() => setSelectedLog(log)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-main)',
                          color: 'var(--text-main)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Инспект
                      </button>
                    </div>
                  </div>

                  {/* Card Inline Details */}
                  {log.details && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
                      {!isExpanded ? (
                        <div style={{
                          fontSize: '0.8rem',
                          color: log.status === 'error' ? '#f87171' : 'var(--text-muted)',
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {log.details}
                        </div>
                      ) : (
                        <pre style={{
                          margin: 0,
                          padding: '10px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          fontSize: '0.8rem',
                          color: 'var(--text-main)',
                          fontFamily: 'Consolas, monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: '220px',
                          overflowY: 'auto'
                        }}>
                          {formatJsonPretty(log.details)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: LIVE DEVELOPER CONSOLE STREAM */}
      {viewMode === 'console' && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          boxShadow: '0 15px 30px rgba(0,0,0,0.3)',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          transition: 'background-color 0.3s ease, border-color 0.3s ease'
        }}>
          {/* Console Top Toolbar */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={16} style={{ color: 'var(--accent-text)' }} />
              <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>TG_ACTOR_STREAM_LOGGER v2.0</span>
              <span style={{ color: '#34d399', fontSize: '0.72rem' }}>● LIVE</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={autoScrollConsole}
                onChange={(e) => setAutoScrollConsole(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Авто-скролл вниз
            </label>
          </div>

          {/* Console Log Lines */}
          <div
            ref={consoleContainerRef}
            style={{
              padding: '16px',
              height: '520px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.82rem',
              lineHeight: '1.5',
              backgroundColor: 'var(--bg-main)'
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '40px' }}>
                // Ожидание поступающих логов активности...
              </div>
            ) : (
              logs.map((log) => {
                let statusColor = '#4ade80';
                if (log.status === 'error') statusColor = '#f87171';
                else if (log.status === 'warning' || log.status === 'cooldown') statusColor = '#fbbf24';

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    style={{
                      cursor: 'pointer',
                      padding: '3px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      wordBreak: 'break-all',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>[{formatTime(log.executed_at)}]</span>
                    <span style={{ color: statusColor, fontWeight: 700, minWidth: '65px' }}>[{log.status.toUpperCase()}]</span>
                    <span style={{ color: 'var(--accent-text)', minWidth: '130px', fontWeight: 600 }}>{log.action_type}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{log.account_id ? `acc:#${log.account_id}` : 'sys'}</span>
                    <span style={{ color: 'var(--text-main)' }}>
                      {log.target ? `target:${log.target}` : ''} {log.details ? `=> ${log.details}` : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: DATA GRID / ANALYTICAL TABLE */}
      {viewMode === 'table' && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          transition: 'background-color 0.3s ease, border-color 0.3s ease'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <th style={{ padding: '12px 14px', fontWeight: 700, width: '130px' }}>Время</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, width: '120px' }}>Аккаунт</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, width: '140px' }}>Действие</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, width: '100px' }}>Статус</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, width: '180px' }}>Цель</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Причина / Детали</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right', width: '90px' }}>Инспект</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {loading ? 'Загрузка аналитической таблицы...' : 'Записи в журнале не найдены.'}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const statusMeta = getStatusColor(log.status);
                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {formatTime(log.executed_at)}
                        </td>

                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          {log.account_id ? (
                            <span style={{ fontWeight: 700, color: 'var(--text-main)', backgroundColor: 'var(--accent-soft)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                              #{log.account_id}
                              {log.account_username && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> @{log.account_username}</span>}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Система</span>
                          )}
                        </td>

                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {log.action_type}
                        </td>

                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: statusMeta.color, fontWeight: 700, fontSize: '0.78rem' }}>
                            ● {log.status}
                          </span>
                        </td>

                        <td style={{ padding: '10px 14px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.target || '—'}
                        </td>

                        <td style={{ padding: '10px 14px', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.78rem', color: log.status === 'error' ? '#f87171' : 'var(--text-muted)' }}>
                          {log.details || '—'}
                        </td>

                        <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setSelectedLog(log)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-main)',
                              color: 'var(--text-main)',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Подробнее
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SLIDE-OVER LOG INSPECTOR DRAWER */}
      {selectedLog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 10000
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              height: '100%',
              backgroundColor: 'var(--bg-card)',
              borderLeft: '1px solid var(--border-color)',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                  Инспектор лога #{selectedLog.id}
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {formatDateFull(selectedLog.executed_at)}
                </span>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Account Card info */}
            <div style={{
              backgroundColor: 'var(--bg-surface)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Метаданные записи
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Тип действия:</span>
                  <strong style={{ color: 'var(--text-main)' }}>{selectedLog.action_type}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Статус:</span>
                  <strong style={{ color: getStatusColor(selectedLog.status).color }}>{selectedLog.status}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Аккаунт:</span>
                  <strong style={{ color: 'var(--text-main)' }}>{selectedLog.account_id ? `ID #${selectedLog.account_id}` : 'Системное событие'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Телефон:</span>
                  <strong style={{ color: 'var(--text-main)' }}>{selectedLog.account_phone || '—'}</strong>
                </div>
                {selectedLog.target && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Целевой ресурс (Target):</span>
                    <strong style={{ color: 'var(--text-main)' }}>🎯 {selectedLog.target} {selectedLog.target_id ? `[${selectedLog.target_id}]` : ''}</strong>
                  </div>
                )}
              </div>

              {selectedLog.account_id && (
                <div style={{ marginTop: '6px' }}>
                  <button
                    onClick={() => {
                      setSelectedAccount(String(selectedLog.account_id));
                      setSelectedLog(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--accent)',
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Фильтровать только по аккаунту #{selectedLog.account_id}
                  </button>
                </div>
              )}
            </div>

            {/* JSON Tree Box */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>JSON Payload / Детали:</span>
                <button
                  onClick={() => handleCopyText(formatJsonPretty(selectedLog.details), 'JSON детали')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  {copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
              </div>

              <pre style={{
                flex: 1,
                margin: 0,
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                fontFamily: 'Consolas, Monaco, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '380px',
                overflowY: 'auto'
              }}>
                {formatJsonPretty(selectedLog.details)}
              </pre>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: '8px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'var(--accent)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR LOGS MODAL */}
      {showClearModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}
          onClick={() => setShowClearModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#f87171" />
                Очистить журнал логов
              </h3>
              <button onClick={() => setShowClearModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '16px' }}>
              Выберите политику очистки записей таблицы <code>bot_action_log</code>:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                <input type="radio" name="clear_mode" checked={clearMode === 'all'} onChange={() => setClearMode('all')} style={{ accentColor: '#f87171' }} />
                Полностью очистить ВСЕ логи
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                <input type="radio" name="clear_mode" checked={clearMode === '7days'} onChange={() => setClearMode('7days')} style={{ accentColor: '#f87171' }} />
                Удалить логи старше 7 дней
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                <input type="radio" name="clear_mode" checked={clearMode === '30days'} onChange={() => setClearMode('30days')} style={{ accentColor: '#f87171' }} />
                Удалить логи старше 30 дней
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowClearModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleClearLogs}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Очистить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
