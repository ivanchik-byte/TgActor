import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Trash2, Paperclip, Plus, Sparkles, MessageSquare, Settings, Play, AlertTriangle, PlusCircle, Save } from 'lucide-react';

interface Replica {
  id: string; // React local temporary ID or database ID
  dbId?: number;
  role: string; // Database Account ID (stored as string)
  type: 'normal' | 'reply';
  replyToId: string; // Points to temporary ID (id) or dbId
  text: string;
  minDelay: string;
  maxDelay: string;
  reactions: string;
  reactionCount: number;
  reactionSource?: 'pool' | 'roles';
  reactionRoles?: string; // space separated role/account IDs
  fileName: string;
  noAttachmentIfForbidden: boolean;
}

export default function Scenarios() {
  const queryClient = useQueryClient();
  
  // Active Scenario state
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null);
  const [newScenarioTitle, setNewScenarioTitle] = useState('');
  const [showAddScenario, setShowAddScenario] = useState(false);

  // Confirm delete scenario ID state
  const [confirmDeleteScenarioId, setConfirmDeleteScenarioId] = useState<number | null>(null);

  // Toast notification state
  const [toasts, setToasts] = useState<{ id: string; text: string; type: 'success' | 'error' | 'info' }[]>([]);

  // Execution modal state
  const [executingScenarioId, setExecutingScenarioId] = useState<number | null>(null);
  const [execTarget, setExecTarget] = useState('');
  const [execPostId, setExecPostId] = useState('');

  const executeScenarioMutation = useMutation({
    mutationFn: async () => {
      if (!executingScenarioId || !execTarget.trim()) return;
      await axios.post(`/api/scenarios/${executingScenarioId}/execute`, {
        target: execTarget.trim(),
        post_id: execPostId.trim() ? parseInt(execPostId.trim()) : null
      });
    },
    onSuccess: () => {
      showToast('Сценарий успешно запущен в Telegram!', 'success');
      setExecutingScenarioId(null);
      setExecTarget('');
      setExecPostId('');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Ошибка запуска сценария!', 'error');
    }
  });

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Scenario config editing state
  const [scenarioName, setScenarioName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [defaultMinDelay, setDefaultMinDelay] = useState(30);
  const [defaultMaxDelay, setDefaultMaxDelay] = useState(60);
  const [scenarioWeight, setScenarioWeight] = useState(1);

  // Replica steps state
  const [replicas, setReplicas] = useState<Replica[]>([]);

  // Fetch accounts from API
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data
  });

  // Filter only accounts in commenting pool
  const commentingAccounts = accounts.filter((a: any) => a.in_commenting_pool);

  // Fetch scenarios list
  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => (await axios.get('/api/scenarios')).data
  });

  // Fetch steps for active scenario
  const { data: dbSteps = [] } = useQuery({
    queryKey: ['scenarioSteps', activeScenarioId],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      return (await axios.get(`/api/scenarios/${activeScenarioId}/steps`)).data;
    },
    enabled: !!activeScenarioId
  });

  // Set default active scenario when list is loaded
  useEffect(() => {
    if (scenarios.length > 0 && activeScenarioId === null) {
      setActiveScenarioId(scenarios[0].id);
    }
  }, [scenarios, activeScenarioId]);

  // Sync scenario config edit state when active scenario changes
  useEffect(() => {
    if (activeScenarioId && scenarios.length > 0) {
      const activeScen = scenarios.find((s: any) => s.id === activeScenarioId);
      if (activeScen) {
        setScenarioName(activeScen.title);
        setIsActive(activeScen.is_active);
        setDefaultMinDelay(activeScen.min_delay);
        setDefaultMaxDelay(activeScen.max_delay);
        setScenarioWeight(activeScen.weight ?? 1);
      }
    }
  }, [activeScenarioId, scenarios]);

  // Sync replica list when dbSteps changes
  useEffect(() => {
    if (dbSteps.length > 0) {
      // Map database steps to React Replica format
      // We will map reply_to_step_id back to temporary string IDs
      const mapped: Replica[] = dbSteps.map((s: any, idx: number) => {
        return {
          id: `step_${s.id || idx}`,
          dbId: s.id,
          role: String(s.role_id),
          type: s.message_type === 'reply' ? 'reply' : 'normal',
          replyToId: '', // To be linked in next pass
          text: s.text || '',
          minDelay: s.delay_before_min !== null ? String(s.delay_before_min) : '',
          maxDelay: s.delay_before_max !== null ? String(s.delay_before_max) : '',
          reactions: s.reactions || '',
          reactionCount: s.reaction_count || 0,
          reactionSource: s.reaction_source || 'pool',
          reactionRoles: s.reaction_roles || '',
          fileName: s.media_path || '',
          noAttachmentIfForbidden: false,
        };
      });

      // Link replyToId based on matching dbId with reply_to_step_id
      dbSteps.forEach((s: any, idx: number) => {
        if (s.reply_to_step_id !== null) {
          const target = mapped.find(r => r.dbId === s.reply_to_step_id);
          if (target) {
            mapped[idx].replyToId = target.id;
          }
        }
      });

      setReplicas(mapped);
    } else {
      setReplicas([]);
    }
  }, [dbSteps, commentingAccounts]);

  // Mutation: Create Scenario
  const createScenarioMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await axios.post('/api/scenarios', { title });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setActiveScenarioId(data.id);
      setNewScenarioTitle('');
      setShowAddScenario(false);
    }
  });

  // Mutation: Delete Scenario
  const deleteScenarioMutation = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setActiveScenarioId(null);
    }
  });

  // Mutation: Update Scenario Configuration
  const updateScenarioMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      await axios.put(`/api/scenarios/${activeScenarioId}`, {
        title: scenarioName,
        is_active: isActive,
        min_delay: defaultMinDelay,
        max_delay: defaultMaxDelay,
        weight: scenarioWeight
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      showToast('Конфигурация успешно сохранена!', 'success');
    }
  });

  // Mutation: Bulk Save Steps
  const saveStepsBulkMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      
      const payloadSteps = replicas.map((r, idx) => {
        let replyToIndex: number | null = null;
        if (r.type === 'reply' && r.replyToId) {
          replyToIndex = replicas.findIndex(o => o.id === r.replyToId);
          if (replyToIndex === -1) replyToIndex = null;
        }

        return {
          step_order: idx + 1,
          role_id: Number(r.role) || (commentingAccounts[0] ? Number(commentingAccounts[0].id) : 0),
          message_type: r.type,
          text: r.text,
          media_path: r.fileName || null,
          delay_before_min: r.minDelay !== '' ? Number(r.minDelay) : null,
          delay_before_max: r.maxDelay !== '' ? Number(r.maxDelay) : null,
          reactions: r.reactions || null,
          reaction_count: r.reactionCount,
          reaction_source: r.reactionSource || 'pool',
          reaction_roles: r.reactionRoles || null,
          reply_to_index: replyToIndex
        };
      });

      await axios.post(`/api/scenarios/${activeScenarioId}/steps/bulk`, {
        steps: payloadSteps
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarioSteps'] });
      showToast('Диалоговые шаги успешно сохранены!', 'success');
    }
  });

  // File input refs map
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const getRoleColor = (roleId: string) => {
    const colors = [
      '#3b82f6', // blue-500
      '#10b981', // emerald-500
      '#8b5cf6', // violet-500
      '#ec4899', // pink-500
      '#f59e0b', // amber-500
      '#ef4444', // red-500
      '#14b8a6', // teal-500
      '#f97316', // orange-500
      '#06b6d4', // cyan-500
      '#6366f1', // indigo-500
    ];
    const num = parseInt(roleId) || 0;
    if (isNaN(num)) {
      let hash = 0;
      for (let i = 0; i < roleId.length; i++) {
        hash = roleId.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    }
    return colors[num % colors.length];
  };

  const generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  // Add replica action
  const handleAddReplica = () => {
    const newId = generateUniqueId();
    const defaultRole = commentingAccounts.length > 0 ? String(commentingAccounts[0].id) : '';
    const newReplica: Replica = {
      id: newId,
      role: defaultRole,
      type: 'normal',
      replyToId: '',
      text: '',
      minDelay: '5',
      maxDelay: '10',
      reactions: '🔥',
      reactionCount: 1,
      reactionSource: 'pool',
      reactionRoles: '',
      fileName: '',
      noAttachmentIfForbidden: false,
    };
    setReplicas([...replicas, newReplica]);
  };

  // Delete replica action
  const handleDeleteReplica = (id: string) => {
    const filtered = replicas.filter(r => r.id !== id);
    const adjusted = filtered.map(r => {
      if (r.type === 'reply' && !filtered.some(f => f.id === r.replyToId)) {
        return { ...r, type: 'normal' as const, replyToId: '' };
      }
      return r;
    });
    setReplicas(adjusted);
  };



  // Update specific replica field
  const handleUpdateReplica = (id: string, field: keyof Replica, value: any) => {
    setReplicas(
      replicas.map(r => {
        if (r.id === id) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  // Triple column page layout styles
  const pageContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '24px',
    alignItems: 'stretch',
    minHeight: '80vh',
  };

  const scenariosSidebarStyle: React.CSSProperties = {
    width: '230px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    flexShrink: 0,
  };

  const stepsColumnStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const rightColumnStyle: React.CSSProperties = {
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    position: 'sticky',
    top: '28px',
    maxHeight: 'calc(100vh - 80px)',
    overflowY: 'auto',
    flexShrink: 0,
  };

  const stepCardStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    transition: 'all 0.25s ease',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '13px',
    color: 'var(--text-main)',
    outline: 'none',
    transition: 'all 0.15s ease',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: '1.5',
    height: '100%',
    minHeight: '110px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    fontWeight: 600,
  };

  const btnSecondary: React.CSSProperties = {
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-muted)',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const CustomCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '6px',
          border: checked ? 'none' : '1px solid var(--border-color)',
          backgroundColor: checked ? 'var(--accent)' : 'var(--bg-main)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M3 8L6 11L11 3.5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" stroke="white" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
    </label>
  );

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* Custom Toast Notifications */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 9999,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            backgroundColor: t.type === 'error' ? '#ef4444' : t.type === 'info' ? '#3b82f6' : '#22c55e',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Custom Confirmation Modal */}
      {confirmDeleteScenarioId !== null && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '380px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                Подтверждение удаления
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                Вы действительно хотите удалить этот сценарий и все его шаги? Это действие необратимо и сотрет все привязанные реплики.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  deleteScenarioMutation.mutate(confirmDeleteScenarioId);
                  setConfirmDeleteScenarioId(null);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
              >
                Удалить
              </button>
              <button
                onClick={() => setConfirmDeleteScenarioId(null)}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-muted)',
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
            </div>
          </div>
        </div>
      )}

      {/* Execute Scenario Modal */}
      {executingScenarioId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '480px',
            width: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Play className="w-5 h-5 text-emerald-500 fill-current" />
                Запуск сценария в Telegram
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                Укажите username группы/канала или вставьте прямую ссылку на пост в канале, под которым нужно устроить обсуждение.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Канал / Чат / Ссылка на пост</label>
                <input
                  type="text"
                  placeholder="Например: @mychannel или https://t.me/mychannel/45"
                  value={execTarget}
                  onChange={e => setExecTarget(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>ID поста (необязательно)</label>
                <input
                  type="text"
                  placeholder="Заполнится автоматически, если вставить ссылку"
                  value={execPostId}
                  onChange={e => setExecPostId(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => executeScenarioMutation.mutate()}
                disabled={!execTarget.trim() || executeScenarioMutation.isPending}
                style={{
                  flex: 1,
                  backgroundColor: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: (!execTarget.trim() || executeScenarioMutation.isPending) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                {executeScenarioMutation.isPending ? 'Запуск...' : 'Старт сценария'}
              </button>
              <button
                onClick={() => {
                  setExecutingScenarioId(null);
                  setExecTarget('');
                  setExecPostId('');
                }}
                style={{
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '12px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles className="w-6 h-6 text-accent" />
            Конструктор диалогов
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Управление сценариями и автоматизация цепочек ответов с прокси-аккаунтов.
          </p>
        </div>
      </div>

      <div style={pageContainerStyle}>
        <div style={scenariosSidebarStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Сценарии</span>
            <button
              onClick={() => setShowAddScenario(!showAddScenario)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-text)' }}
              title="Создать сценарий"
            >
              <PlusCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Add Scenario inline widget */}
          {showAddScenario && (
            <div style={{
              padding: '10px',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <input
                type="text"
                placeholder="Имя сценария..."
                value={newScenarioTitle}
                onChange={e => setNewScenarioTitle(e.target.value)}
                style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => newScenarioTitle.trim() && createScenarioMutation.mutate(newScenarioTitle)}
                  style={{
                    backgroundColor: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: '6px', padding: '4px 8px', fontSize: '11px', flex: 1, cursor: 'pointer'
                  }}
                >
                  Создать
                </button>
                <button
                  onClick={() => setShowAddScenario(false)}
                  style={{
                    backgroundColor: 'transparent', border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer'
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Scenario list items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
            {scenarios.map((s: any) => {
              const isSelected = s.id === activeScenarioId;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveScenarioId(s.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    backgroundColor: isSelected ? 'var(--accent-soft)' : 'transparent',
                    border: isSelected ? '1px solid var(--border-color)' : '1px solid transparent',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: s.is_active ? '#22c55e' : '#737373',
                      flexShrink: 0
                    }} />
                    <span style={{
                      fontSize: '13px',
                      fontWeight: isSelected ? 600 : 500,
                      color: isSelected ? 'var(--accent-text)' : 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {s.title}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteScenarioId(s.id);
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: isSelected ? 'block' : 'none'
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 hover:text-red-500" />
                  </button>
                </div>
              );
            })}
            {scenarios.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', padding: '20px 0' }}>
                Нет сценариев
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 2: Message steps editor */}
        <div style={stepsColumnStyle}>
          {activeScenarioId ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
                  Шаги диалога ({replicas.length})
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleAddReplica}
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      border: '1px solid var(--accent-soft)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Plus className="w-4 h-4" /> Добавить шаг
                  </button>
                  <button
                    onClick={() => saveStepsBulkMutation.mutate()}
                    disabled={saveStepsBulkMutation.isPending}
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: 'none',
                      opacity: saveStepsBulkMutation.isPending ? 0.5 : 1
                    }}
                  >
                    <Save className="w-4 h-4" /> Сохранить шаги
                  </button>
                </div>
              </div>

              {replicas.length === 0 ? (
                <div style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '16px',
                  padding: '60px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}>
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p style={{ fontSize: '14px', fontWeight: 500 }}>Список диалоговых шагов пуст</p>
                  <button
                    onClick={handleAddReplica}
                    style={{
                      marginTop: '16px',
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '10px 20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Создать первый шаг
                  </button>
                </div>
              ) : (
                replicas.map((replica, index) => {
                  const precedingReplicas = replicas.slice(0, index);
                  const selectedRole = replica.role || (commentingAccounts.length > 0 ? String(commentingAccounts[0].id) : '');

                  return (
                    <div
                      key={replica.id}
                      style={{
                        ...stepCardStyle,
                        borderLeft: `4px solid ${getRoleColor(selectedRole)}`,
                      }}
                    >
                      {/* Step Header */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '18px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid var(--border-color)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            backgroundColor: getRoleColor(selectedRole),
                            color: '#fff',
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            fontWeight: 700,
                          }}>
                            {index + 1}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>
                            Диалоговое сообщение
                          </span>
                        </div>

                        {/* Step Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleDeleteReplica(replica.id)}
                            style={{
                              background: 'none',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              padding: '6px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              backgroundColor: 'rgba(239, 68, 68, 0.05)',
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '32px' }}>
                        {/* Left Column: Text & Attachments */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div>
                            <label style={labelStyle}>Содержимое сообщения</label>
                            <textarea
                              value={replica.text}
                              onChange={e => handleUpdateReplica(replica.id, 'text', e.target.value)}
                              placeholder="Напишите реплику сообщения..."
                              style={textareaStyle}
                            />
                          </div>

                          {/* Attachment upload */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            backgroundColor: 'var(--bg-main)',
                            padding: '12px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-color)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={labelStyle}>Вложение</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {replica.fileName || 'Файл не выбран.'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                ref={el => { fileInputRefs.current[replica.id] = el; }}
                                type="file"
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  handleUpdateReplica(replica.id, 'fileName', file ? file.name : '');
                                }}
                              />
                              <button
                                onClick={() => fileInputRefs.current[replica.id]?.click()}
                                style={btnSecondary}
                              >
                                <Paperclip className="w-3.5 h-3.5 inline mr-1" />
                                Обзор...
                              </button>
                              <CustomCheckbox
                                checked={replica.noAttachmentIfForbidden}
                                onChange={v => handleUpdateReplica(replica.id, 'noAttachmentIfForbidden', v)}
                                label="Пропустить при запрете"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Roles, Type & Delay */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div>
                            <label style={labelStyle}>Персонаж (ID роли)</label>
                            {commentingAccounts.length === 0 ? (
                              <div style={{
                                fontSize: '12px', color: '#ef4444', padding: '8px 12px',
                                border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px',
                                backgroundColor: 'rgba(239, 68, 68, 0.02)', display: 'flex', alignItems: 'center', gap: '6px'
                              }}>
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                Нет аккаунтов для комментирования в пуле!
                              </div>
                            ) : (
                              <select
                                value={selectedRole}
                                onChange={e => handleUpdateReplica(replica.id, 'role', e.target.value)}
                                style={inputStyle}
                              >
                                {commentingAccounts.map((a: any) => (
                                  <option key={a.id} value={String(a.id)}>
                                    {a.custom_name ? a.custom_name : (a.username ? `@${a.username}` : (a.first_name || `Персонаж #${a.id}`))} ({a.phone})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          <div>
                            <label style={labelStyle}>Формат отправки</label>
                            <select
                              value={replica.type}
                              onChange={e => {
                                const val = e.target.value as 'normal' | 'reply';
                                handleUpdateReplica(replica.id, 'type', val);
                                if (val === 'reply' && precedingReplicas.length > 0 && !replica.replyToId) {
                                  handleUpdateReplica(replica.id, 'replyToId', precedingReplicas[precedingReplicas.length - 1].id);
                                }
                              }}
                              style={inputStyle}
                            >
                              <option value="normal">Новое сообщение</option>
                              {precedingReplicas.length > 0 && (
                                <option value="reply">Ответ (Reply)</option>
                              )}
                            </select>
                          </div>

                          {replica.type === 'reply' && precedingReplicas.length > 0 && (
                            <div style={{
                              padding: '10px',
                              backgroundColor: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '10px',
                            }}>
                              <label style={labelStyle}>На какое сообщение ответить?</label>
                              <select
                                value={replica.replyToId}
                                onChange={e => handleUpdateReplica(replica.id, 'replyToId', e.target.value)}
                                style={inputStyle}
                              >
                                {precedingReplicas.map((pr, prIdx) => (
                                  <option key={pr.id} value={pr.id}>
                                    Шаг №{prIdx + 1} - {pr.text ? `"${pr.text.substring(0, 30)}..."` : 'Без текста'}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div>
                            <label style={labelStyle}>Задержка перед отправкой</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>от</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="по умолчанию"
                                  value={replica.minDelay}
                                  onChange={e => handleUpdateReplica(replica.id, 'minDelay', e.target.value)}
                                  style={inputStyle}
                                />
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>сек</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>до</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="по умолчанию"
                                  value={replica.maxDelay}
                                  onChange={e => handleUpdateReplica(replica.id, 'maxDelay', e.target.value)}
                                  style={inputStyle}
                                />
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>сек</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                            <label style={labelStyle}>Набор реакций (нажмите для выбора)</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                              {['👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '🎉', '🤩', '🤡', '💩'].map(emoji => {
                                const currentList = (replica.reactions || '').split(/\s+/).filter(Boolean);
                                const isActive = currentList.includes(emoji);
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => {
                                      let newList;
                                      if (isActive) {
                                        newList = currentList.filter(e => e !== emoji);
                                      } else {
                                        newList = [...currentList, emoji];
                                      }
                                      handleUpdateReplica(replica.id, 'reactions', newList.join(' '));
                                    }}
                                    style={{
                                      fontSize: '14px',
                                      padding: '6px 10px',
                                      borderRadius: '8px',
                                      border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                                      backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-main)',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s',
                                    }}
                                  >
                                    {emoji}
                                  </button>
                                );
                              })}
                            </div>
                            <input
                              type="text"
                              value={replica.reactions}
                              onChange={e => handleUpdateReplica(replica.id, 'reactions', e.target.value)}
                              placeholder="Или введите вручную через пробел..."
                              style={inputStyle}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                            <div>
                              <label style={labelStyle}>Кто реагирует</label>
                              <select
                                value={replica.reactionSource || 'pool'}
                                onChange={e => handleUpdateReplica(replica.id, 'reactionSource', e.target.value)}
                                style={inputStyle}
                              >
                                <option value="pool">Пул реакций (рандом)</option>
                                <option value="roles">Персонажи сценария</option>
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>
                                {replica.reactionSource === 'roles' ? 'Количество' : 'Лимит'}
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={replica.reactionCount}
                                onChange={e => handleUpdateReplica(replica.id, 'reactionCount', Number(e.target.value))}
                                style={inputStyle}
                              />
                            </div>
                          </div>

                          {replica.reactionSource === 'roles' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                              <label style={labelStyle}>Выберите персонажей для реакции</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {Array.from(new Set(replicas.map(r => r.role))).filter(Boolean).map(roleId => {
                                  const acc = commentingAccounts.find((a: any) => String(a.id) === roleId);
                                  const name = acc?.username ? `@${acc.username}` : (acc?.first_name || `Персонаж ${roleId}`);
                                  const currentRoles = (replica.reactionRoles || '').split(/\s+/).filter(Boolean);
                                  const isSelected = currentRoles.includes(roleId);
                                  
                                  return (
                                    <button
                                      key={roleId}
                                      type="button"
                                      onClick={() => {
                                        let newList;
                                        if (isSelected) {
                                          newList = currentRoles.filter(r => r !== roleId);
                                        } else {
                                          newList = [...currentRoles, roleId];
                                        }
                                        handleUpdateReplica(replica.id, 'reactionRoles', newList.join(' '));
                                        handleUpdateReplica(replica.id, 'reactionCount', newList.length);
                                      }}
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '5px 8px',
                                        borderRadius: '6px',
                                        border: `1px solid ${isSelected ? getRoleColor(roleId) : 'var(--border-color)'}`,
                                        backgroundColor: isSelected ? 'rgba(255,255,255,0.03)' : 'var(--bg-main)',
                                        color: isSelected ? getRoleColor(roleId) : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                      }}
                                    >
                                      {name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px dashed var(--border-color)',
              borderRadius: '16px',
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              marginTop: '40px'
            }}>
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p style={{ fontSize: '14px', fontWeight: 500 }}>Выберите сценарий слева или создайте новый</p>
            </div>
          )}
        </div>

        {/* COLUMN 3: Scenario config + Live Preview (Scrollable container to prevent overlay/clipping) */}
        {activeScenarioId && (
          <div style={rightColumnStyle}>
            {/* Config Widget */}
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '20px',
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 800,
                color: 'var(--text-main)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '10px'
              }}>
                <Settings className="w-4 h-4 text-accent" />
                Параметры запуска
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Название сценария</label>
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={e => setScenarioName(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Круг пауза от (мин)</label>
                    <input
                      type="number"
                      value={defaultMinDelay}
                      onChange={e => setDefaultMinDelay(Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Круг пауза до (мин)</label>
                    <input
                      type="number"
                      value={defaultMaxDelay}
                      onChange={e => setDefaultMaxDelay(Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Лимит повторений круга</label>
                  <select style={inputStyle} defaultValue="infinite">
                    <option value="infinite">Бесконечный цикл</option>
                    <option value="once">Выполнить 1 раз и остановиться</option>
                    <option value="daily">Запускать ежедневно</option>
                  </select>
                </div>

                <div>
                  <CustomCheckbox checked={isActive} onChange={setIsActive} label="Авто-запуск при публикации" />
                </div>

                <div>
                  <label style={labelStyle}>Вес сценария (рандомайзер): {scenarioWeight}</label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={scenarioWeight}
                    onChange={e => setScenarioWeight(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span>1 (редко)</span>
                    <span>10 (часто)</span>
                  </div>
                </div>

                <button
                  onClick={() => updateScenarioMutation.mutate()}
                  disabled={updateScenarioMutation.isPending}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    opacity: updateScenarioMutation.isPending ? 0.5 : 1
                  }}
                >
                  {updateScenarioMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
              </div>
            </div>

            {/* Telegram Live Preview */}
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '20px',
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 800,
                color: 'var(--text-main)',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <Play className="w-4 h-4 text-emerald-500" />
                Симуляция чата
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                Интерактивная визуализация порядка реплик в реальном времени.
              </p>

              <div style={{
                backgroundColor: 'var(--bg-main)',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                border: '1px solid var(--border-color)',
              }}>
                {replicas.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0' }}>
                    Нет сообщений
                  </div>
                ) : (
                   replicas.map((r, i) => {
                     const replyReplicaIndex = r.type === 'reply' ? replicas.findIndex(o => o.id === r.replyToId) : -1;
                     const replyText = replyReplicaIndex !== -1 ? replicas[replyReplicaIndex].text : '';

                     const finalRole = r.role || (commentingAccounts[0] ? String(commentingAccounts[0].id) : '');
                     const currentAccount = commentingAccounts.find((a: any) => String(a.id) === finalRole);
                     const displayName = currentAccount?.custom_name 
                       ? currentAccount.custom_name 
                       : (currentAccount?.username 
                         ? `@${currentAccount.username}` 
                         : (currentAccount?.first_name || `Персонаж ${r.role || '?'}`));

                     return (
                       <div key={r.id} style={{
                         backgroundColor: 'var(--bg-card)',
                         borderRadius: '8px',
                         padding: '8px 10px',
                         fontSize: '12px',
                         borderLeft: `3px solid ${getRoleColor(finalRole)}`,
                       }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                           <span style={{ fontWeight: 600, color: getRoleColor(finalRole) }}>
                             {displayName}
                           </span>
                           <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>#{i + 1}</span>
                         </div>

                         {r.type === 'reply' && replyText && (
                           <div style={{
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            borderLeft: '2px solid var(--text-muted)',
                            padding: '2px 6px',
                            marginBottom: '4px',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            borderRadius: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            Ответ на #{replyReplicaIndex + 1}: {replyText}
                          </div>
                        )}

                        <div style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>
                          {r.text || <em style={{ color: 'var(--text-muted)' }}>Пустое сообщение</em>}
                        </div>

                        {r.reactions && (
                          <div style={{ display: 'flex', gap: '3px', marginTop: '6px', fontSize: '10px' }}>
                            <span style={{
                              backgroundColor: 'rgba(255,255,255,0.04)',
                              borderRadius: '4px',
                              padding: '1px 4px',
                              color: 'var(--text-muted)'
                            }}>
                              {r.reactions} {r.reactionCount > 0 ? `×${r.reactionCount}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
