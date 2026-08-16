import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Radio, Trash2, Plus, Power, PowerOff, Loader2,
  Clock, Shuffle, Search, ExternalLink, Activity,
  ShieldAlert,
  Layers, Terminal, Check, LogIn, Users, Square
} from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { ModalOverlay } from '../components/ModalOverlay';

interface ChannelItem {
  id: number;
  channel_username: string;
  channel_identifier?: string;
  is_active: boolean;
  min_delay_seconds: number;
  max_delay_seconds: number;
  no_repeat_scenarios: boolean;
}

export default function Channels() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Tab state: 'monitor' | 'joiner'
  const [activeTab, setActiveTab] = useState<'monitor' | 'joiner'>('monitor');

  // Add channel form state
  const [newChannels, setNewChannels] = useState('');
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  const [noRepeat, setNoRepeat] = useState(true);
  const [autoJoinOnAdd, setAutoJoinOnAdd] = useState(true);
  const [autoJoinCountOnAdd, setAutoJoinCountOnAdd] = useState(3);

  // Smooth joiner state
  const [joinLinks, setJoinLinks] = useState('');
  const [joinAccountCount, setJoinAccountCount] = useState(3);
  const [joinMinDelay, setJoinMinDelay] = useState(30);
  const [joinMaxDelay, setJoinMaxDelay] = useState(90);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'paused'>('all');

  // Confirm delete modal state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Inline delay editing states { [channelId]: { min, max, dirty } }
  const [delayDrafts, setDelayDrafts] = useState<Record<number, { min: number; max: number }>>({});

  // Queries
  const { data: channels = [], isLoading: isChannelsLoading } = useQuery<ChannelItem[]>({
    queryKey: ['channels'],
    queryFn: async () => (await axios.get('/api/channels')).data
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data
  });

  const commentingAccounts = useMemo(() => {
    return accounts.filter((a: any) => a.is_active && (a.pool === 'commenting' || !a.pool));
  }, [accounts]);

  const { data: monitorStatus } = useQuery({
    queryKey: ['monitorStatus'],
    queryFn: async () => (await axios.get('/api/channels/monitor/status')).data,
    refetchInterval: 4000
  });

  const { data: smoothJoinStatus, refetch: refetchSmoothJoin } = useQuery({
    queryKey: ['smoothJoinStatus'],
    queryFn: async () => (await axios.get('/api/channels/smooth-join/status')).data,
    refetchInterval: (query) => {
      return query.state.data?.status === 'running' ? 1500 : 5000;
    }
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => (await axios.get('/api/scenarios')).data
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['taskLogs'],
    queryFn: async () => (await axios.get('/api/logs')).data,
    refetchInterval: 3000
  });

  // Smooth join mutations
  const startSmoothJoinMutation = useMutation({
    mutationFn: async () => {
      return (await axios.post('/api/channels/smooth-join/start', {
        chat_links: joinLinks,
        account_count: joinAccountCount,
        min_delay: joinMinDelay,
        max_delay: joinMaxDelay
      })).data;
    },
    onSuccess: () => {
      refetchSmoothJoin();
      showToast('Плавный вход ботов запущен!', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Ошибка запуска плавного входа', 'error');
    }
  });

  const cancelSmoothJoinMutation = useMutation({
    mutationFn: async () => {
      return (await axios.post('/api/channels/smooth-join/cancel')).data;
    },
    onSuccess: () => {
      refetchSmoothJoin();
      showToast('Процесс плавного входа отменён', 'info');
    }
  });

  // Mutations
  const addChannels = useMutation({
    mutationFn: async () => {
      return (await axios.post('/api/channels', {
        channel_identifier: newChannels,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        no_repeat_scenarios: noRepeat,
        auto_join_bots: autoJoinOnAdd,
        auto_join_count: autoJoinCountOnAdd
      })).data;
    },
    onSuccess: (data) => {
      setNewChannels('');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      refetchSmoothJoin();
      const count = data?.added_ids?.length || 1;
      if (autoJoinOnAdd) {
        showToast(`Добавлено каналов: ${count}. Запущен плавный вход ${autoJoinCountOnAdd} ботов!`, 'success');
      } else {
        showToast(`Успешно добавлено каналов: ${count}`, 'success');
      }
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка добавления каналов!', 'error')
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/channels/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      showToast('Канал удалён из мониторинга.', 'info');
    },
    onError: () => showToast('Ошибка при удалении канала', 'error')
  });

  const toggleChannel = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await axios.patch(`/api/channels/${id}`, { is_active: active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
    onError: () => showToast('Не удалось переключить статус канала', 'error')
  });

  const toggleNoRepeat = useMutation({
    mutationFn: async ({ id, val }: { id: number; val: boolean }) => {
      await axios.patch(`/api/channels/${id}`, { no_repeat_scenarios: val });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      showToast('Параметр антиповтора обновлен', 'success');
    }
  });

  const updateChannelSettings = useMutation({
    mutationFn: async ({ id, minDelay, maxDelay }: { id: number; minDelay?: number; maxDelay?: number }) => {
      await axios.patch(`/api/channels/${id}`, {
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setDelayDrafts(prev => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      showToast('Задержки успешно сохранены!', 'success');
    }
  });

  const startMonitor = useMutation({
    mutationFn: async () => axios.post('/api/channels/monitor/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitorStatus'] });
      showToast('Радар мониторинга запущен!', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка запуска мониторинга!', 'error')
  });

  const stopMonitor = useMutation({
    mutationFn: async () => axios.post('/api/channels/monitor/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitorStatus'] });
      showToast('Мониторинг приостановлен.', 'info');
    }
  });

  const isRunning = monitorStatus?.running === true;

  // Filtered channels list
  const filteredChannels = useMemo(() => {
    return channels.filter((ch: ChannelItem) => {
      const name = (ch.channel_username || ch.channel_identifier || '').toLowerCase();
      const matchesSearch = name.includes(searchQuery.toLowerCase().trim());
      if (!matchesSearch) return false;

      if (filterMode === 'active') return ch.is_active;
      if (filterMode === 'paused') return !ch.is_active;
      return true;
    });
  }, [channels, searchQuery, filterMode]);

  // Detected parsed handles in textarea
  const detectedChannelCount = useMemo(() => {
    if (!newChannels.trim()) return 0;
    return newChannels.replace(/,/g, '\n').split('\n').map(s => s.trim()).filter(Boolean).length;
  }, [newChannels]);

  const activeChannelsCount = channels.filter(c => c.is_active).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Delete Confirmation Modal */}
      <ModalOverlay
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Удаление канала"
        subtitle="Канал будет исключен из очереди автоматического сканирования"
        icon={<ShieldAlert className="w-5 h-5 text-red-500" />}
        footer={
          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button
              onClick={() => setConfirmDeleteId(null)}
              style={{
                flex: 1,
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => confirmDeleteId && deleteChannel.mutate(confirmDeleteId)}
              disabled={deleteChannel.isPending}
              style={{
                flex: 1,
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: deleteChannel.isPending ? 'not-allowed' : 'pointer',
                opacity: deleteChannel.isPending ? 0.6 : 1,
              }}
            >
              {deleteChannel.isPending ? 'Удаление...' : 'Да, удалить'}
            </button>
          </div>
        }
      >
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Вы уверены, что хотите удалить этот канал? Сценарии комментирования больше не будут запускаться по его новым публикациям.
        </p>
      </ModalOverlay>

      {/* Hero Control Station */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '20px',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            backgroundColor: isRunning ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${isRunning ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isRunning ? '#10b981' : '#ef4444',
            position: 'relative'
          }}>
            <Radio className="w-7 h-7" />
            {isRunning && (
              <span style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                border: '2px solid var(--bg-card)'
              }} />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Мониторинг Telegram-каналов
              </h1>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: '20px',
                backgroundColor: isRunning ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${isRunning ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.2)'}`,
                fontSize: '11px', fontWeight: 700,
                color: isRunning ? '#10b981' : '#ef4444'
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: isRunning ? '#10b981' : '#ef4444',
                }} />
                {isRunning ? 'РАДАР АКТИВЕН' : 'МОНИТОРИНГ НА ПАУЗЕ'}
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
              Автоматический перехват свежих публикаций и запуск реалистичных веток обсуждений ботами.
            </p>
          </div>
        </div>

        {/* Master Control Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isRunning ? (
            <button
              onClick={() => stopMonitor.mutate()}
              disabled={stopMonitor.isPending}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#ef4444',
                padding: '12px 22px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
            >
              <PowerOff className="w-4 h-4" />
              {stopMonitor.isPending ? 'Остановка...' : 'Приостановить сканирование'}
            </button>
          ) : (
            <button
              onClick={() => startMonitor.mutate()}
              disabled={startMonitor.isPending || channels.length === 0}
              style={{
                backgroundColor: 'var(--accent)',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
                opacity: (startMonitor.isPending || channels.length === 0) ? 0.5 : 1
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {startMonitor.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              {startMonitor.isPending ? 'Запуск радара...' : 'Запустить радар мониторинга'}
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs Switcher */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '14px',
        marginBottom: '6px'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('monitor')}
          style={{
            padding: '10px 18px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            border: activeTab === 'monitor' ? '1px solid var(--accent)' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'monitor' ? 'var(--accent-soft)' : 'var(--bg-card)',
            color: activeTab === 'monitor' ? 'var(--accent-text)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          <Radio className="w-4 h-4" />
          <span>📡 Мониторинг постов</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '10px',
            backgroundColor: activeTab === 'monitor' ? 'var(--accent)' : 'var(--bg-main)',
            color: activeTab === 'monitor' ? '#fff' : 'var(--text-muted)',
            fontWeight: 800
          }}>
            {channels.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('joiner')}
          style={{
            padding: '10px 18px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            border: activeTab === 'joiner' ? '1px solid #8b5cf6' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'joiner' ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-card)',
            color: activeTab === 'joiner' ? '#a78bfa' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          <LogIn className="w-4 h-4" />
          <span>🚪 Плавный вход ботов</span>
          {smoothJoinStatus?.status === 'running' && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '10px',
              backgroundColor: '#8b5cf6',
              color: '#fff',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              В ПРОЦЕССЕ ({smoothJoinStatus.progress_percent || 0}%)
            </span>
          )}
        </button>
      </div>

      {activeTab === 'monitor' ? (
        <>
          {/* KPI Metrics Dashboard Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <div style={{
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                  {channels.length}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Всего в базе
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em' }}>
                  {activeChannelsCount}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Активных каналов
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#818cf8',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                  {scenarios.length}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Пул сценариев
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                  {logs.length}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Событий зафиксировано
                </div>
              </div>
            </div>
          </div>

          {/* Main Workspace Layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(340px, 400px) 1fr',
            gap: '24px',
            alignItems: 'start'
          }}>
            {/* Left Column: Add Channels Form */}
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '18px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Plus className="w-4 h-4" />
                  </div>
                  <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                    Добавить каналы
                  </h2>
                </div>
                {detectedChannelCount > 0 && (
                  <span style={{
                    fontSize: '11px', fontWeight: 700,
                    padding: '2px 8px', borderRadius: '6px',
                    backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)'
                  }}>
                    {detectedChannelCount} найдено
                  </span>
                )}
              </div>

              <div>
                <label style={{
                  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px', display: 'block'
                }}>
                  Ссылки или @username каналов
                </label>
                <textarea
                  placeholder={"@channel_one\nhttps://t.me/channel_two\nchannel_three"}
                  value={newChannels}
                  onChange={e => setNewChannels(e.target.value)}
                  rows={5}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    fontFamily: 'monospace',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    transition: 'border-color 0.2s'
                  }}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Вставьте построчно или через запятую. Поддерживаются ссылки t.me/... и @юзернеймы.
                </p>
              </div>

              {/* Preset Delay Selectors */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{
                    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 0
                  }}>
                    Пауза после выхода нового поста
                  </label>
                  <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 600 }}>до старта ветки</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { label: '⚡ 5–15 сек', min: 5, max: 15 },
                    { label: '⚖️ 10–30 сек', min: 10, max: 30 },
                    { label: '🛡️ 30–60 сек', min: 30, max: 60 }
                  ].map(preset => {
                    const isActive = minDelay === preset.min && maxDelay === preset.max;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setMinDelay(preset.min);
                          setMaxDelay(preset.max);
                        }}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                          backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-main)',
                          color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s'
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Delay Range Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Мин. пауза (сек)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={minDelay}
                    onChange={e => setMinDelay(Math.max(1, Number(e.target.value)))}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-main)', outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Макс. пауза (сек)
                  </label>
                  <input
                    type="number"
                    min={minDelay}
                    value={maxDelay}
                    onChange={e => setMaxDelay(Math.max(minDelay, Number(e.target.value)))}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-main)', outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Auto-join Bots to Discussion Group Toggle */}
              <div style={{
                backgroundColor: autoJoinOnAdd ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-main)',
                border: `1px solid ${autoJoinOnAdd ? 'rgba(139, 92, 246, 0.3)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div
                  onClick={() => setAutoJoinOnAdd(!autoJoinOnAdd)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                >
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '6px',
                    backgroundColor: autoJoinOnAdd ? '#8b5cf6' : 'transparent',
                    border: `1px solid ${autoJoinOnAdd ? '#8b5cf6' : 'var(--border-color)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', flexShrink: 0
                  }}>
                    {autoJoinOnAdd && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <LogIn className="w-3.5 h-3.5 text-accent" />
                      <span>Авто-вход ботов в обсуждения</span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Плавно заведёт ботов в чат с антиспам-паузами 30–90 сек.
                    </p>
                  </div>
                </div>

                {autoJoinOnAdd && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Завести:</span>
                    {[3, 5, 10].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setAutoJoinCountOnAdd(cnt)}
                        style={{
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                          border: autoJoinCountOnAdd === cnt ? '1px solid #8b5cf6' : '1px solid var(--border-color)',
                          backgroundColor: autoJoinCountOnAdd === cnt ? 'rgba(139, 92, 246, 0.25)' : 'var(--bg-main)',
                          color: autoJoinCountOnAdd === cnt ? '#c4b5fd' : 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        {cnt} ботов
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Anti-repeat Toggle */}
              <div
                onClick={() => setNoRepeat(!noRepeat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
                  padding: '12px 14px', borderRadius: '12px',
                  backgroundColor: noRepeat ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-main)',
                  border: `1px solid ${noRepeat ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-color)'}`,
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  width: '24px', height: '24px', borderRadius: '6px',
                  backgroundColor: noRepeat ? '#10b981' : 'transparent',
                  border: `1px solid ${noRepeat ? '#10b981' : 'var(--border-color)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', flexShrink: 0
                }}>
                  {noRepeat && <Check className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shuffle className="w-3.5 h-3.5 text-accent" />
                    <span>Антиповтор сценариев</span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Исключает отправку одинакового сценария в один канал дважды подряд.
                  </p>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={() => addChannels.mutate()}
                disabled={!newChannels.trim() || addChannels.isPending}
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '13px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  opacity: (!newChannels.trim() || addChannels.isPending) ? 0.5 : 1
                }}
              >
                {addChannels.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addChannels.isPending ? 'Сохранение каналов...' : 'Добавить в мониторинг'}
              </button>
            </div>

            {/* Right Column: Monitored Channels Fleet & Logs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Channel Fleet Card */}
              <div style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '18px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                      Флот каналов на радаре
                    </h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Индивидуальные настройки таймингов и антиповтора для каждого канала.
                    </p>
                  </div>

                  {/* Filter & Search Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '10px', padding: '6px 10px', width: '180px'
                    }}>
                      <Search className="w-3.5 h-3.5 text-muted" />
                      <input
                        type="text"
                        placeholder="Поиск канала..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                          backgroundColor: 'transparent', border: 'none', outline: 'none',
                          fontSize: '12px', color: 'var(--text-main)', width: '100%'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', backgroundColor: 'var(--bg-main)', borderRadius: '10px', padding: '3px', border: '1px solid var(--border-color)' }}>
                      {(['all', 'active', 'paused'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setFilterMode(mode)}
                          style={{
                            padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            backgroundColor: filterMode === mode ? 'var(--accent)' : 'transparent',
                            color: filterMode === mode ? '#fff' : 'var(--text-muted)',
                            transition: 'all 0.15s'
                          }}
                        >
                          {mode === 'all' ? 'Все' : mode === 'active' ? 'Вкл' : 'Выкл'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Channels List */}
                {isChannelsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                ) : filteredChannels.length === 0 ? (
                  <div style={{
                    padding: '40px 20px', borderRadius: '14px', border: '1px dashed var(--border-color)',
                    textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                  }}>
                    <Radio className="w-8 h-8 text-muted" style={{ opacity: 0.4 }} />
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {searchQuery ? 'Каналов по вашему запросу не найдено' : 'Список каналов пуст. Добавьте первый канал слева.'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filteredChannels.map(ch => {
                      const draft = delayDrafts[ch.id] || { min: ch.min_delay_seconds, max: ch.max_delay_seconds };
                      const isDirty = draft.min !== ch.min_delay_seconds || draft.max !== ch.max_delay_seconds;

                      return (
                        <div
                          key={ch.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 16px', borderRadius: '12px',
                            backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                            transition: 'all 0.15s ease',
                            opacity: ch.is_active ? 1 : 0.65
                          }}
                        >
                          {/* Left: Channel Info */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '10px',
                              backgroundColor: ch.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: ch.is_active ? '#10b981' : '#ef4444',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <Radio className="w-4 h-4" />
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                                  @{ch.channel_username}
                                </span>
                                <a
                                  href={`https://t.me/${ch.channel_username}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--text-muted)', display: 'inline-flex' }}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                ID #{ch.id}
                              </span>
                            </div>
                          </div>

                          {/* Middle: Timing Controls */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            backgroundColor: 'var(--bg-card)', padding: '6px 10px', borderRadius: '10px',
                            border: '1px solid var(--border-color)'
                          }}>
                            <Clock className="w-3.5 h-3.5 text-muted" />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>пауза:</span>
                            <input
                              type="number"
                              min={1}
                              value={draft.min}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setDelayDrafts(prev => ({ ...prev, [ch.id]: { ...draft, min: val } }));
                              }}
                              style={{
                                width: '40px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                                borderRadius: '6px', padding: '2px 4px', fontSize: '11px', color: 'var(--text-main)', textAlign: 'center', outline: 'none'
                              }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>–</span>
                            <input
                              type="number"
                              min={draft.min}
                              value={draft.max}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setDelayDrafts(prev => ({ ...prev, [ch.id]: { ...draft, max: val } }));
                              }}
                              style={{
                                width: '40px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                                borderRadius: '6px', padding: '2px 4px', fontSize: '11px', color: 'var(--text-main)', textAlign: 'center', outline: 'none'
                              }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>сек</span>

                            {isDirty && (
                              <button
                                onClick={() => updateChannelSettings.mutate({ id: ch.id, minDelay: draft.min, maxDelay: draft.max })}
                                style={{
                                  backgroundColor: 'var(--accent)', color: '#fff', border: 'none',
                                  borderRadius: '6px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                Сохранить
                              </button>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Anti-repeat badge button */}
                            <button
                              onClick={() => toggleNoRepeat.mutate({ id: ch.id, val: !ch.no_repeat_scenarios })}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '6px 10px', borderRadius: '8px',
                                border: `1px solid ${ch.no_repeat_scenarios ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-color)'}`,
                                backgroundColor: ch.no_repeat_scenarios ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                                color: ch.no_repeat_scenarios ? '#818cf8' : 'var(--text-muted)',
                                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                              title="Антиповтор сценариев"
                            >
                              <Shuffle className="w-3 h-3" />
                              <span>{ch.no_repeat_scenarios ? 'Антиповтор' : 'Повторы'}</span>
                            </button>

                            {/* Active Switch */}
                            <button
                              onClick={() => toggleChannel.mutate({ id: ch.id, active: !ch.is_active })}
                              style={{
                                padding: '6px 12px', borderRadius: '8px',
                                backgroundColor: ch.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                                border: `1px solid ${ch.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                                color: ch.is_active ? '#10b981' : '#ef4444',
                                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                            >
                              {ch.is_active ? 'Активен' : 'Пауза'}
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => setConfirmDeleteId(ch.id)}
                              style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                border: '1px solid var(--border-color)', backgroundColor: 'transparent',
                                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.15s'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.color = '#ef4444';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color = 'var(--text-muted)';
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                              }}
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

              {/* Live Activity & Radar Event Logs Widget */}
              <div style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '18px',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal className="w-4 h-4 text-accent" />
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                      Телеметрия и события радара
                    </h3>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {logs.length} событий в буфере
                  </span>
                </div>

                {logs.length === 0 ? (
                  <div style={{
                    padding: '20px', borderRadius: '10px',
                    backgroundColor: 'var(--bg-main)', textAlign: 'center',
                    fontSize: '12px', color: 'var(--text-muted)'
                  }}>
                    Ожидание новых постов и событий...
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                    {logs.slice(0, 20).map((log: any) => {
                      const isSuccess = log.status === 'bots_engaged' || log.status === 'success';
                      const isPost = log.status === 'post_detected';
                      const isError = log.status === 'error';

                      return (
                        <div
                          key={log.id}
                          style={{
                            padding: '9px 12px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                            <span style={{
                              fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                              textTransform: 'uppercase', flexShrink: 0,
                              backgroundColor: isSuccess ? 'rgba(16,185,129,0.12)' : isPost ? 'rgba(99,102,241,0.12)' : isError ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                              color: isSuccess ? '#10b981' : isPost ? '#818cf8' : isError ? '#ef4444' : 'var(--text-main)',
                              border: `1px solid ${isSuccess ? 'rgba(16,185,129,0.3)' : isPost ? 'rgba(99,102,241,0.3)' : isError ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}`
                            }}>
                              {log.status}
                            </span>
                            <span style={{
                              color: 'var(--text-main)', fontSize: '12px',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>
                              {log.error_message || log.status}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'monospace' }}>
                            {new Date(log.executed_at).toLocaleTimeString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Smooth Fleet Joiner Workspace */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(360px, 440px) 1fr',
          gap: '24px',
          alignItems: 'start'
        }}>
          {/* Left Column: Joiner Settings Form */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '18px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                  Мастер плавного входа ботов
                </h2>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Поочередное вступление аккаунтов с защитой от банов Telegram
                </p>
              </div>
            </div>

            {/* Target Links Input */}
            <div>
              <label style={{
                fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px', display: 'block'
              }}>
                Ссылки на группы / чаты / каналы
              </label>
              <textarea
                placeholder={"https://t.me/target_group\n@chat_username\nhttps://t.me/+joinchat_hash"}
                value={joinLinks}
                onChange={e => setJoinLinks(e.target.value)}
                rows={4}
                disabled={smoothJoinStatus?.status === 'running'}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontFamily: 'monospace',
                  lineHeight: '1.6',
                  resize: 'vertical'
                }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Поддерживаются публичные ссылки, юзернеймы и приватные инвайт-ссылки.
              </p>
            </div>

            {/* Account Pool Size Selection */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{
                  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: 'var(--text-muted)'
                }}>
                  Количество ботов для входа
                </label>
                <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 600 }}>
                  Доступно: {commentingAccounts.length} акк.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                {[
                  { label: '3 бота', val: 3 },
                  { label: '5 ботов', val: 5 },
                  { label: '10 ботов', val: 10 },
                  { label: `Все (${commentingAccounts.length})`, val: commentingAccounts.length || 1 }
                ].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={smoothJoinStatus?.status === 'running'}
                    onClick={() => setJoinAccountCount(opt.val)}
                    style={{
                      padding: '7px 4px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: joinAccountCount === opt.val ? '1px solid #8b5cf6' : '1px solid var(--border-color)',
                      backgroundColor: joinAccountCount === opt.val ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-main)',
                      color: joinAccountCount === opt.val ? '#c4b5fd' : 'var(--text-muted)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Точное число:</span>
                <input
                  type="number"
                  min={1}
                  max={commentingAccounts.length || 100}
                  value={joinAccountCount}
                  disabled={smoothJoinStatus?.status === 'running'}
                  onChange={e => setJoinAccountCount(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '80px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>аккаунтов из пула</span>
              </div>
            </div>

            {/* Interval / Periodicity Selection */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{
                  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: 'var(--text-muted)'
                }}>
                  Периодичность входа (пауза между ботами)
                </label>
                <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>
                  🛡️ Антибан
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px' }}>
                {[
                  { label: '⚡ Быстрый (15–30с)', min: 15, max: 30 },
                  { label: '⚖️ Стандарт (30–90с)', min: 30, max: 90 },
                  { label: '🛡️ Скрытный (90–240с)', min: 90, max: 240 }
                ].map(preset => {
                  const isActive = joinMinDelay === preset.min && joinMaxDelay === preset.max;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={smoothJoinStatus?.status === 'running'}
                      onClick={() => {
                        setJoinMinDelay(preset.min);
                        setJoinMaxDelay(preset.max);
                      }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: isActive ? '1px solid #8b5cf6' : '1px solid var(--border-color)',
                        backgroundColor: isActive ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-main)',
                        color: isActive ? '#c4b5fd' : 'var(--text-muted)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s'
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Мин. пауза (сек)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={joinMinDelay}
                    disabled={smoothJoinStatus?.status === 'running'}
                    onChange={e => setJoinMinDelay(Math.max(1, Number(e.target.value)))}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-main)', outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Макс. пауза (сек)
                  </label>
                  <input
                    type="number"
                    min={joinMinDelay}
                    value={joinMaxDelay}
                    disabled={smoothJoinStatus?.status === 'running'}
                    onChange={e => setJoinMaxDelay(Math.max(joinMinDelay, Number(e.target.value)))}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-main)', outline: 'none'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Anti-spam Advice Note */}
            <div style={{
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              borderRadius: '12px',
              padding: '12px 14px',
              fontSize: '11px',
              color: '#c4b5fd',
              lineHeight: '1.5'
            }}>
              <strong>💡 Как это работает:</strong> Первый бот заходит сразу через свой прокси, затем система делает паузу {joinMinDelay}–{joinMaxDelay} сек перед запуском следующего бота. Это полностью исключает спам-блокировку чата.
            </div>

            {/* Action Buttons */}
            {smoothJoinStatus?.status === 'running' ? (
              <button
                onClick={() => cancelSmoothJoinMutation.mutate()}
                disabled={cancelSmoothJoinMutation.isPending}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  borderRadius: '12px',
                  padding: '13px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                {cancelSmoothJoinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                <span>Прервать плавный вход</span>
              </button>
            ) : (
              <button
                onClick={() => startSmoothJoinMutation.mutate()}
                disabled={!joinLinks.trim() || startSmoothJoinMutation.isPending}
                style={{
                  backgroundColor: '#8b5cf6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '13px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  opacity: (!joinLinks.trim() || startSmoothJoinMutation.isPending) ? 0.5 : 1
                }}
              >
                {startSmoothJoinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span>Запустить плавный вход ({joinAccountCount} ботов)</span>
              </button>
            )}
          </div>

          {/* Right Column: Live Telemetry & Progress Display */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '18px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                  Телеметрия плавного входа
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Отслеживание статуса каждого аккаунта в реальном времени
                </p>
              </div>

              {/* Status Badge */}
              <div style={{
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: smoothJoinStatus?.status === 'running' ? 'rgba(139, 92, 246, 0.15)' :
                                 smoothJoinStatus?.status === 'done' ? 'rgba(16, 185, 129, 0.15)' :
                                 smoothJoinStatus?.status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-main)',
                border: `1px solid ${smoothJoinStatus?.status === 'running' ? '#8b5cf6' :
                                      smoothJoinStatus?.status === 'done' ? '#10b981' :
                                      smoothJoinStatus?.status === 'cancelled' ? '#ef4444' : 'var(--border-color)'}`,
                color: smoothJoinStatus?.status === 'running' ? '#c4b5fd' :
                       smoothJoinStatus?.status === 'done' ? '#10b981' :
                       smoothJoinStatus?.status === 'cancelled' ? '#ef4444' : 'var(--text-muted)'
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: smoothJoinStatus?.status === 'running' ? '#8b5cf6' :
                                   smoothJoinStatus?.status === 'done' ? '#10b981' :
                                   smoothJoinStatus?.status === 'cancelled' ? '#ef4444' : 'var(--text-muted)'
                }} />
                {smoothJoinStatus?.status === 'running' ? 'В ПРОЦЕССЕ ВХОДА' :
                 smoothJoinStatus?.status === 'done' ? 'УСПЕШНО ЗАВЕРШЕНО' :
                 smoothJoinStatus?.status === 'cancelled' ? 'ОТМЕНЕНО' : 'ГОТОВ К ЗАПУСКУ'}
              </div>
            </div>

            {/* Progress Bar & KPI Stats */}
            <div style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                  Общий прогресс операции
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#a78bfa' }}>
                  {smoothJoinStatus?.progress_percent || 0}%
                </span>
              </div>

              {/* Progress Track */}
              <div style={{
                width: '100%', height: '8px', borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${smoothJoinStatus?.progress_percent || 0}%`,
                  height: '100%',
                  backgroundColor: '#8b5cf6',
                  borderRadius: '4px',
                  transition: 'width 0.4s ease'
                }} />
              </div>

              {/* Mini KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '6px' }}>
                <div style={{
                  backgroundColor: 'var(--bg-card)', padding: '10px 12px', borderRadius: '10px',
                  border: '1px solid var(--border-color)', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>
                    {smoothJoinStatus?.joined_count || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Успешно
                  </div>
                </div>

                <div style={{
                  backgroundColor: 'var(--bg-card)', padding: '10px 12px', borderRadius: '10px',
                  border: '1px solid var(--border-color)', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#ef4444' }}>
                    {smoothJoinStatus?.failed_count || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Ошибок
                  </div>
                </div>

                <div style={{
                  backgroundColor: 'var(--bg-card)', padding: '10px 12px', borderRadius: '10px',
                  border: '1px solid var(--border-color)', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                    {smoothJoinStatus?.total_accounts || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Всего задач
                  </div>
                </div>
              </div>
            </div>

            {/* Current Active Step & Countdown Box */}
            {smoothJoinStatus?.status === 'running' && (
              <div style={{
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: '14px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Users className="w-5 h-5 text-accent" />
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Вход выполняет:</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#c4b5fd' }}>
                      {smoothJoinStatus.current_account || 'Инициализация...'}
                    </div>
                  </div>
                </div>

                {smoothJoinStatus.next_delay_seconds > 0 && (
                  <div style={{
                    padding: '6px 12px', borderRadius: '8px',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    fontSize: '12px', fontWeight: 700, color: '#c4b5fd',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    <Clock className="w-3.5 h-3.5" />
                    <span>Пауза: {smoothJoinStatus.next_delay_seconds} сек</span>
                  </div>
                )}
              </div>
            )}

            {/* Live Log Console */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Terminal className="w-3.5 h-3.5 text-accent" />
                  <span>Журнал вступлений</span>
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {smoothJoinStatus?.logs?.length || 0} записей
                </span>
              </div>

              <div style={{
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '12px',
                maxHeight: '280px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontFamily: 'monospace',
                fontSize: '11px'
              }}>
                {!smoothJoinStatus?.logs || smoothJoinStatus.logs.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Журнал пуст. Нажмите «Запустить плавный вход», чтобы начать операцию.
                  </div>
                ) : (
                  smoothJoinStatus.logs.map((item: string, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        color: item.startsWith('✅') ? '#10b981' :
                               item.startsWith('❌') ? '#ef4444' :
                               item.startsWith('⏳') ? '#a78bfa' : 'var(--text-main)'
                      }}
                    >
                      {item}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId !== null && (
        <ModalOverlay isOpen={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '18px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                Удалить канал?
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Канал будет удален из базы мониторинга. Боты перестанут комментировать новые публикации в нем.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border-color)',
                  backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteId && deleteChannel.mutate(confirmDeleteId)}
                style={{
                  padding: '8px 16px', borderRadius: '10px', border: 'none',
                  backgroundColor: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
