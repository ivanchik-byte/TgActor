import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Radio, Trash2, Plus, Power, PowerOff, Loader2,
  Clock, Shuffle, Search, ExternalLink, Activity,
  CheckCircle2, AlertCircle, ShieldAlert,
  Layers, Terminal, Check
} from 'lucide-react';

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

  // Toast state
  const [toasts, setToasts] = useState<{ id: string; text: string; type: 'success' | 'error' | 'info' }[]>([]);
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Add channel form state
  const [newChannels, setNewChannels] = useState('');
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  const [noRepeat, setNoRepeat] = useState(true);

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

  const { data: monitorStatus } = useQuery({
    queryKey: ['monitorStatus'],
    queryFn: async () => (await axios.get('/api/channels/monitor/status')).data,
    refetchInterval: 4000
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

  // Mutations
  const addChannels = useMutation({
    mutationFn: async () => {
      return (await axios.post('/api/channels', {
        channel_identifier: newChannels,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        no_repeat_scenarios: noRepeat
      })).data;
    },
    onSuccess: (data) => {
      setNewChannels('');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      const count = data?.added_ids?.length || 1;
      showToast(`Успешно добавлено каналов: ${count}`, 'success');
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
      {/* Toast Notifications */}
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 18px', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
            color: '#fff', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            backgroundColor: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#6366f1',
            display: 'flex', alignItems: 'center', gap: '8px',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)'
          }}>
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4" />}
            {t.type === 'info' && <Radio className="w-4 h-4" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: '18px', padding: '28px', maxWidth: '420px', width: '100%',
            display: 'flex', flexDirection: 'column', gap: '20px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0
              }}>
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Удаление канала</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Канал будет исключен из очереди автоматического сканирования.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => deleteChannel.mutate(confirmDeleteId)}
                disabled={deleteChannel.isPending}
                style={{
                  flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none',
                  borderRadius: '10px', padding: '11px', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', transition: 'opacity 0.2s',
                  opacity: deleteChannel.isPending ? 0.6 : 1
                }}
              >
                {deleteChannel.isPending ? 'Удаление...' : 'Да, удалить'}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  backgroundColor: 'var(--bg-main)', color: 'var(--text-main)',
                  border: '1px solid var(--border-color)', borderRadius: '10px',
                  padding: '11px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

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
            <label style={{
              fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px', display: 'block'
            }}>
              Готовые профили пауз
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {[
                { label: '⚡ Быстрый', min: 5, max: 15 },
                { label: '⚖️ Стандарт', min: 10, max: 30 },
                { label: '🛡️ Скрытный', min: 30, max: 60 }
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
                Мин. задержка (сек)
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
                Макс. задержка (сек)
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
            {/* Header with Search & Filter Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                  Отслеживаемые каналы ({filteredChannels.length})
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Индивидуальные настройки таймингов и статуса работы.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Search input */}
                <div style={{ position: 'relative', width: '180px' }}>
                  <Search className="w-3.5 h-3.5" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Поиск..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '6px 10px 6px 30px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                    }}
                  />
                </div>

                {/* Filter segments */}
                <div style={{ display: 'flex', backgroundColor: 'var(--bg-main)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {(['all', 'active', 'paused'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterMode(f)}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        border: 'none', cursor: 'pointer',
                        backgroundColor: filterMode === f ? 'var(--accent-soft)' : 'transparent',
                        color: filterMode === f ? 'var(--accent-text)' : 'var(--text-muted)'
                      }}
                    >
                      {f === 'all' ? 'Все' : f === 'active' ? 'В работе' : 'Пауза'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Channels List */}
            {isChannelsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '50px 0' }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-text)' }} />
              </div>
            ) : filteredChannels.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 20px',
                borderRadius: '12px', border: '1px dashed var(--border-color)',
                backgroundColor: 'var(--bg-main)'
              }}>
                <Radio className="w-8 h-8" style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {channels.length === 0 ? 'Список каналов пуст' : 'Ничего не найдено'}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {channels.length === 0 ? 'Добавьте первые каналы в форме слева.' : 'Попробуйте изменить поисковый запрос или фильтр.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredChannels.map((ch: ChannelItem) => {
                  const draft = delayDrafts[ch.id] || { min: ch.min_delay_seconds, max: ch.max_delay_seconds };
                  const isDirty = draft.min !== ch.min_delay_seconds || draft.max !== ch.max_delay_seconds;
                  const username = ch.channel_username || ch.channel_identifier || 'channel';

                  return (
                    <div
                      key={ch.id}
                      style={{
                        backgroundColor: 'var(--bg-main)',
                        border: `1px solid ${ch.is_active ? 'var(--border-color)' : 'rgba(239, 68, 68, 0.15)'}`,
                        borderRadius: '14px',
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        opacity: ch.is_active ? 1 : 0.65,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Left: Name & Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
                        <div style={{
                          width: '10px', height: '10px', borderRadius: '50%',
                          backgroundColor: ch.is_active ? '#10b981' : '#737373',
                          boxShadow: ch.is_active ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none',
                          flexShrink: 0
                        }} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                              @{username}
                            </span>
                            <a
                              href={`https://t.me/${username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--text-muted)', display: 'inline-flex' }}
                              title="Открыть в Telegram"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {ch.is_active ? 'Сканирование активно' : 'Приостановлен'}
                          </div>
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
                          {ch.is_active ? 'В работе' : 'Пауза'}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => setConfirmDeleteId(ch.id)}
                          style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            backgroundColor: 'transparent', border: '1px solid transparent',
                            color: 'var(--text-muted)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#ef4444';
                            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = 'transparent';
                          }}
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
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
    </div>
  );
}
