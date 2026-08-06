import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, RefreshCw, Search, AlertTriangle, CheckCircle, Bot, Eye, X } from 'lucide-react';
import { useToast } from '../components/ToastContext';

interface TaskLog {
  id: number;
  account_id: number | null;
  scenario_id: number | null;
  status: string;
  error_message: string | null;
  executed_at: string;
}

export const HistoryPage: React.FC = () => {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState<TaskLog | null>(null);
  const { showToast } = useToast();

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { limit: 100 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await axios.get('/api/logs', { params });
      setLogs(res.data);
    } catch (err: any) {
      showToast('Ошибка загрузки истории запусков', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, statusFilter, searchQuery]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(34, 197, 94, 0.12)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.25)' }}>
            <CheckCircle size={14} /> Успешно
          </span>
        );
      case 'bots_engaged':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
            <Bot size={14} /> Задействованы боты
          </span>
        );
      case 'post_detected':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(234, 179, 8, 0.12)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
            <Eye size={14} /> Пост обнаружен
          </span>
        );
      case 'error':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <AlertTriangle size={14} /> Ошибка
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.25)' }}>
            {status}
          </span>
        );
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const counts = {
    all: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    bots_engaged: logs.filter(l => l.status === 'bots_engaged').length,
    post_detected: logs.filter(l => l.status === 'post_detected').length,
    error: logs.filter(l => l.status === 'error').length,
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={28} style={{ color: 'var(--accent-color, #6366f1)' }} />
            История запусков и событий
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9rem' }}>
            Журнал выполнения сценариев, отслеживания постов и активности аккаунтов
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary, #94a3b8)' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Автообновление (5с)
          </label>
          <button
            onClick={fetchLogs}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
              background: 'var(--bg-card, #1e293b)',
              color: 'var(--text-main, #f8fafc)',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Обновить
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        {[
          { key: 'all', label: `Все (${counts.all})` },
          { key: 'bots_engaged', label: `Задействованы боты (${counts.bots_engaged})` },
          { key: 'post_detected', label: `Пост обнаружен (${counts.post_detected})` },
          { key: 'success', label: `Успешно (${counts.success})` },
          { key: 'error', label: `Ошибки (${counts.error})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: statusFilter === tab.key ? 'var(--accent-color, #6366f1)' : 'var(--bg-card, #1e293b)',
              color: statusFilter === tab.key ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary, #94a3b8)' }} />
        <input
          type="text"
          placeholder="Поиск по каналам, сценариям или текстам ошибок..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px 10px 42px',
            borderRadius: '8px',
            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
            background: 'var(--bg-card, #1e293b)',
            color: 'var(--text-main, #f8fafc)',
            fontSize: '0.9rem',
            outline: 'none'
          }}
        />
      </div>

      {/* Logs Table */}
      <div style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '12px', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))', background: 'rgba(0,0,0,0.15)', color: 'var(--text-secondary, #94a3b8)' }}>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Время</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Статус</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Сценарий / Аккаунт</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Сообщение / Детали</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary, #94a3b8)' }}>
                  {loading ? 'Загрузка истории...' : 'Записи истории не найдены.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.05))', transition: 'background 0.15s ease' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #94a3b8)', whiteSpace: 'nowrap' }}>
                    {formatDate(log.executed_at)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {getStatusBadge(log.status)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {log.scenario_id && <span style={{ fontWeight: 600 }}>Сценарий #{log.scenario_id}</span>}
                    {log.account_id && <span style={{ color: 'var(--text-secondary, #94a3b8)', marginLeft: log.scenario_id ? '8px' : 0 }}>[Аккаунт #{log.account_id}]</span>}
                    {!log.scenario_id && !log.account_id && <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>Системное событие</span>}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.error_message || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => setSelectedLog(log)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                        background: 'transparent',
                        color: 'var(--text-main, #f8fafc)',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      Подробнее
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Детали записи #{selectedLog.id}</h3>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #94a3b8)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
              <div>
                <strong>Время выполнения:</strong> {formatDate(selectedLog.executed_at)}
              </div>
              <div>
                <strong>Статус:</strong> {getStatusBadge(selectedLog.status)}
              </div>
              {selectedLog.scenario_id && (
                <div>
                  <strong>ID сценария:</strong> {selectedLog.scenario_id}
                </div>
              )}
              {selectedLog.account_id && (
                <div>
                  <strong>ID аккаунта:</strong> {selectedLog.account_id}
                </div>
              )}
              <div>
                <strong>Сообщение / Лог ошибки:</strong>
                <pre style={{
                  marginTop: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.05))',
                  fontSize: '0.85rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  fontFamily: 'monospace'
                }}>
                  {selectedLog.error_message || 'Детали отсутствуют.'}
                </pre>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent-color, #6366f1)',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
