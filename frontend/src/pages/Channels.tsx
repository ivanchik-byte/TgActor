import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Radio, Trash2, Plus, Power, PowerOff, Loader2, ToggleLeft, ToggleRight, Clock, Shuffle } from 'lucide-react';

export default function Channels() {
  const queryClient = useQueryClient();

  // Toast state
  const [toasts, setToasts] = useState<{ id: string; text: string; type: 'success' | 'error' | 'info' }[]>([]);
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Add channel form
  const [newChannels, setNewChannels] = useState('');
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(10);
  const [noRepeat, setNoRepeat] = useState(true);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Queries
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => (await axios.get('/api/channels')).data
  });

  const { data: monitorStatus } = useQuery({
    queryKey: ['monitorStatus'],
    queryFn: async () => (await axios.get('/api/channels/monitor/status')).data,
    refetchInterval: 5000
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => (await axios.get('/api/scenarios')).data
  });

  // Mutations
  const addChannels = useMutation({
    mutationFn: async () => {
      await axios.post('/api/channels', {
        channel_identifier: newChannels,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        no_repeat_scenarios: noRepeat
      });
    },
    onSuccess: () => {
      setNewChannels('');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      showToast('Каналы успешно добавлены!', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка!', 'error')
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/channels/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      showToast('Канал удалён.', 'info');
    }
  });

  const toggleChannel = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await axios.patch(`/api/channels/${id}`, { is_active: active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
  });

  const toggleNoRepeat = useMutation({
    mutationFn: async ({ id, val }: { id: number; val: boolean }) => {
      await axios.patch(`/api/channels/${id}`, { no_repeat_scenarios: val });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
  });

  const updateChannelSettings = useMutation({
    mutationFn: async ({ id, minDelay, maxDelay }: { id: number; minDelay?: number; maxDelay?: number }) => {
      await axios.patch(`/api/channels/${id}`, {
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
  });

  const startMonitor = useMutation({
    mutationFn: async () => axios.post('/api/channels/monitor/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitorStatus'] });
      showToast('Мониторинг запущен!', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка запуска!', 'error')
  });

  const stopMonitor = useMutation({
    mutationFn: async () => axios.post('/api/channels/monitor/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitorStatus'] });
      showToast('Мониторинг остановлен.', 'info');
    }
  });

  const isRunning = monitorStatus?.running === true;

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px', display: 'block'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px 12px',
    fontSize: '13px',
    color: 'var(--text-main)',
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
            color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            backgroundColor: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#6366f1',
            animation: 'fadeIn 0.2s ease'
          }}>{t.text}</div>
        ))}
      </div>

      {/* Delete confirm modal */}
      {confirmDeleteId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '90%',
            display: 'flex', flexDirection: 'column', gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
              Удалить этот канал из списка мониторинга?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => deleteChannel.mutate(confirmDeleteId)}
                style={{
                  flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none',
                  borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                }}
              >Удалить</button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)', borderRadius: '10px',
                  padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio className="w-6 h-6" style={{ color: 'var(--accent-text)' }} />
            Мониторинг каналов
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Автоматическое комментирование новых постов в отслеживаемых каналах.
          </p>
        </div>

        {/* Monitor toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '8px',
            backgroundColor: isRunning ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isRunning ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: isRunning ? '#10b981' : '#ef4444',
              boxShadow: isRunning ? '0 0 8px #10b981' : 'none',
              animation: isRunning ? 'pulse 2s ease-in-out infinite' : 'none'
            }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: isRunning ? '#10b981' : '#ef4444' }}>
              {isRunning ? 'Работает' : 'Остановлен'}
            </span>
          </div>

          {isRunning ? (
            <button
              onClick={() => stopMonitor.mutate()}
              disabled={stopMonitor.isPending}
              style={{
                backgroundColor: '#ef4444', color: '#fff', padding: '10px 18px',
                borderRadius: '10px', fontSize: '13px', fontWeight: 700, border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                opacity: stopMonitor.isPending ? 0.6 : 1
              }}
            >
              <PowerOff className="w-4 h-4" />
              {stopMonitor.isPending ? 'Останавливаем...' : 'Остановить'}
            </button>
          ) : (
            <button
              onClick={() => startMonitor.mutate()}
              disabled={startMonitor.isPending || channels.length === 0}
              style={{
                backgroundColor: '#10b981', color: '#fff', padding: '10px 18px',
                borderRadius: '10px', fontSize: '13px', fontWeight: 700, border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                opacity: (startMonitor.isPending || channels.length === 0) ? 0.5 : 1
              }}
            >
              <Power className="w-4 h-4" />
              {startMonitor.isPending ? 'Запускаем...' : 'Запустить мониторинг'}
            </button>
          )}
        </div>
      </div>

      {/* Main content: two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* Left: Add channels form */}
        <div style={{
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
              Добавить каналы
            </span>
          </div>

          <div>
            <label style={labelStyle}>Username или ID каналов</label>
            <textarea
              placeholder={"@channel1\n@channel2\nchannel3\nhttps://t.me/channel4"}
              value={newChannels}
              onChange={e => setNewChannels(e.target.value)}
              rows={5}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'monospace',
                lineHeight: '1.6'
              }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              По одному на строку, или через запятую. Поддерживаются ссылки t.me/...
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Мин. задержка (сек)</label>
              <input type="number" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} style={inputStyle} min={5} />
            </div>
            <div>
              <label style={labelStyle}>Макс. задержка (сек)</label>
              <input type="number" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} style={inputStyle} min={10} />
            </div>
          </div>

          <div
            onClick={() => setNoRepeat(!noRepeat)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              padding: '8px 10px', borderRadius: '8px',
              backgroundColor: noRepeat ? 'rgba(16,185,129,0.06)' : 'transparent',
              border: `1px solid ${noRepeat ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}`,
              transition: 'all 0.15s'
            }}
          >
            {noRepeat
              ? <ToggleRight className="w-5 h-5" style={{ color: '#10b981' }} />
              : <ToggleLeft className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            }
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>Антиповтор</span>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>Не повторять один сценарий дважды подряд</p>
            </div>
          </div>

          <button
            onClick={() => addChannels.mutate()}
            disabled={!newChannels.trim() || addChannels.isPending}
            style={{
              backgroundColor: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: (!newChannels.trim() || addChannels.isPending) ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {addChannels.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {addChannels.isPending ? 'Добавляем...' : 'Добавить'}
          </button>

          {/* Stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px'
          }}>
            <div style={{
              padding: '10px', borderRadius: '10px',
              backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-text)' }}>{channels.length}</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Каналов</div>
            </div>
            <div style={{
              padding: '10px', borderRadius: '10px',
              backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-text)' }}>{scenarios.length}</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Сценариев</div>
            </div>
          </div>
        </div>

        {/* Right: Channels table */}
        <div style={{
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
              Отслеживаемые каналы
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {channels.filter((c: any) => c.is_active).length} активных
            </span>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : channels.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              color: 'var(--text-muted)', fontSize: '13px'
            }}>
              <Radio className="w-10 h-10" style={{ color: 'var(--border-color)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600 }}>Каналы не добавлены</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>Добавьте каналы слева, чтобы начать мониторинг</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {channels.map((ch: any) => (
                <div
                  key={ch.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: '10px',
                    backgroundColor: 'var(--bg-main)',
                    border: `1px solid ${ch.is_active ? 'var(--border-color)' : 'rgba(239,68,68,0.15)'}`,
                    opacity: ch.is_active ? 1 : 0.6,
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      backgroundColor: ch.is_active ? '#10b981' : '#737373'
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px', fontWeight: 600, color: 'var(--text-main)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>
                        {ch.channel_identifier}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <Clock className="w-3.5 h-3.5" />
                          <span>пауза: от</span>
                          <input
                            id={"min_delay_" + ch.id}
                            key={ch.id + "_min_" + ch.min_delay_seconds}
                            type="number"
                            defaultValue={ch.min_delay_seconds}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            style={{
                              width: '45px',
                              backgroundColor: 'var(--bg-card)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              padding: '1px 3px',
                              fontSize: '11px',
                              color: 'var(--text-main)',
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <span>до</span>
                          <input
                            id={"max_delay_" + ch.id}
                            key={ch.id + "_max_" + ch.max_delay_seconds}
                            type="number"
                            defaultValue={ch.max_delay_seconds}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            style={{
                              width: '45px',
                              backgroundColor: 'var(--bg-card)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              padding: '1px 3px',
                              fontSize: '11px',
                              color: 'var(--text-main)',
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <span>с</span>
                          <button
                            onClick={() => {
                              const minEl = document.getElementById("min_delay_" + ch.id) as HTMLInputElement;
                              const maxEl = document.getElementById("max_delay_" + ch.id) as HTMLInputElement;
                              if (minEl && maxEl) {
                                updateChannelSettings.mutate({
                                  id: ch.id,
                                  minDelay: Number(minEl.value),
                                  maxDelay: Number(maxEl.value)
                                });
                                showToast('Паузы для канала сохранены!', 'success');
                              }
                            }}
                            style={{
                              backgroundColor: 'var(--accent)',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '2px 8px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              marginLeft: '4px',
                              transition: 'opacity 0.15s'
                            }}
                          >
                            Сохранить
                          </button>
                        </div>
                        {ch.no_repeat_scenarios && (
                          <span style={{
                            fontSize: '9px', fontWeight: 700, padding: '1px 5px',
                            borderRadius: '4px', backgroundColor: 'rgba(99,102,241,0.1)',
                            color: '#818cf8', textTransform: 'uppercase'
                          }}>
                            <Shuffle className="w-2.5 h-2.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />
                            антиповтор
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {/* Toggle active */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {ch.is_active ? 'Активен' : 'Пауза'}
                      </span>
                      <button
                        onClick={() => toggleChannel.mutate({ id: ch.id, active: !ch.is_active })}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: ch.is_active ? '#10b981' : 'var(--text-muted)', padding: '2px',
                          display: 'flex', alignItems: 'center'
                        }}
                      >
                        {ch.is_active
                          ? <ToggleRight className="w-6 h-6" />
                          : <ToggleLeft className="w-6 h-6" />
                        }
                      </button>
                    </div>

                    {/* Toggle no-repeat */}
                    <button
                      onClick={() => toggleNoRepeat.mutate({ id: ch.id, val: !ch.no_repeat_scenarios })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: ch.no_repeat_scenarios ? 'rgba(129,140,248,0.12)' : 'transparent',
                        color: ch.no_repeat_scenarios ? '#818cf8' : 'var(--text-muted)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      Антиповтор: {ch.no_repeat_scenarios ? 'ВКЛ' : 'ВЫКЛ'}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setConfirmDeleteId(ch.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center',
                        transition: 'color 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
