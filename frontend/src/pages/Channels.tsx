import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Radio, Trash2, Plus, Power, PowerOff, Loader2,
  Clock, Search, ExternalLink, Activity,
  ShieldAlert, Layers, Terminal, Check, LogIn,
  Zap, ShieldCheck, Settings,
  Megaphone, RotateCw
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
  execution_mode?: 'scenario' | 'first_comment';
  sender_account_id?: number | null;
  send_as_mode?: 'account' | 'channel';
  send_as_channel_username?: string | null;
  custom_prompt?: string | null;
  ai_model?: string | null;
  skip_ads?: boolean;
}

interface AdminChannelInfo {
  id: number;
  title: string;
  username?: string;
  is_creator?: boolean;
}

const FIRST_COMMENT_PRESETS = [
  { id: 'expert', label: 'Экспертный тезис', prompt: 'Напиши короткий (1 предложение) экспертный инсайт или профессиональное уточнение к теме поста. Без воды, без точки в конце.' },
  { id: 'question', label: 'Вопрос по теме', prompt: 'Задай один острый или вовлекающий вопрос автору или аудитории по содержанию поста. В конце поставь знак вопроса.' },
  { id: 'insight', label: 'Практический опыт', prompt: 'Дополни новость полезной деталью или практическим наблюдением из реального опыта. Без эмодзи, без точки в конце.' },
  { id: 'humor', label: 'Ирония / реакция', prompt: 'Напиши остроумную, ироничную и короткую реакцию на новость. Живой сленг, без смайлов, без точки в конце.' }
];

export default function Channels() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Tab state: 'monitor' | 'joiner'
  const [activeTab, setActiveTab] = useState<'monitor' | 'joiner'>('monitor');

  // Add channel form state
  const [newChannels, setNewChannels] = useState('');
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  const [noRepeat] = useState(true);
  const [autoJoinOnAdd, setAutoJoinOnAdd] = useState(true);
  const [autoJoinCountOnAdd, setAutoJoinCountOnAdd] = useState(3);

  // First comment sniper mode fields for Add Form
  const [addMode, setAddMode] = useState<'scenario' | 'first_comment'>('scenario');
  const [senderAccountId, setSenderAccountId] = useState<number | ''>('');
  const [sendAsChannelToggle, setSendAsChannelToggle] = useState(false);
  const [sendAsChannel, setSendAsChannel] = useState('');
  const [manualChannelInput, setManualChannelInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [skipAds, setSkipAds] = useState(true);
  const [verifyState, setVerifyState] = useState<{ loading: boolean; ok?: boolean; msg?: string }>({ loading: false });

  // Edit channel modal state
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [editSendAsChannelToggle, setEditSendAsChannelToggle] = useState(false);
  const [editManualChannelInput, setEditManualChannelInput] = useState(false);
  const [editVerifyState, setEditVerifyState] = useState<{ loading: boolean; ok?: boolean; msg?: string }>({ loading: false });

  // Smooth joiner state
  const [joinLinks, setJoinLinks] = useState('');
  const [joinAccountCount, setJoinAccountCount] = useState(3);
  const [joinMinDelay, setJoinMinDelay] = useState(30);
  const [joinMaxDelay, setJoinMaxDelay] = useState(90);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'paused' | 'first_comment'>('all');

  // Confirm delete modal state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Inline delay editing states
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

  const activeAccounts = useMemo(() => {
    return accounts.filter((a: any) => a.is_active);
  }, [accounts]);

  // Admin channels query for selected account in Add form
  const { data: addAdminChannels = [], isFetching: isAddAdminChannelsLoading, refetch: refetchAddAdminChannels } = useQuery<AdminChannelInfo[]>({
    queryKey: ['adminChannels', senderAccountId],
    queryFn: async () => {
      if (!senderAccountId) return [];
      return (await axios.get(`/api/accounts/${senderAccountId}/admin-channels`)).data;
    },
    enabled: Boolean(senderAccountId && sendAsChannelToggle)
  });

  // Admin channels query for selected account in Edit modal
  const editAccId = editingChannel?.sender_account_id;
  const { data: editAdminChannels = [], isFetching: isEditAdminChannelsLoading, refetch: refetchEditAdminChannels } = useQuery<AdminChannelInfo[]>({
    queryKey: ['adminChannels', editAccId],
    queryFn: async () => {
      if (!editAccId) return [];
      return (await axios.get(`/api/accounts/${editAccId}/admin-channels`)).data;
    },
    enabled: Boolean(editAccId && editSendAsChannelToggle)
  });

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

  const { data: logs = [] } = useQuery({
    queryKey: ['taskLogs'],
    queryFn: async () => (await axios.get('/api/logs')).data,
    refetchInterval: 3000
  });

  // Verify send_as permission
  const handleVerifySendAs = async (accId: number | '', chName: string, isEdit = false) => {
    if (!accId) {
      showToast('Выберите аккаунт для проверки прав', 'warning');
      return;
    }
    if (!chName.trim()) {
      showToast('Укажите юзернейм канала', 'warning');
      return;
    }

    const setTargetState = isEdit ? setEditVerifyState : setVerifyState;
    setTargetState({ loading: true });

    try {
      const resp = await axios.post('/api/channels/verify-send-as', {
        account_id: Number(accId),
        channel_username: chName.trim()
      });
      if (resp.data.ok) {
        const msg = `Доступ подтвержден: "${resp.data.title}" (ID: ${resp.data.channel_id})`;
        setTargetState({ loading: false, ok: true, msg });
        showToast(msg, 'success');
      } else {
        setTargetState({ loading: false, ok: false, msg: resp.data.error || 'Ошибка проверки' });
        showToast(resp.data.error || 'Нет доступа к отправке от имени канала', 'error');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Ошибка связи с сервером при проверке';
      setTargetState({ loading: false, ok: false, msg });
      showToast(msg, 'error');
    }
  };

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
      showToast('Плавный вход ботов запущен', 'success');
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
      showToast('Процесс плавного входа отменен', 'info');
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
        execution_mode: addMode,
        sender_account_id: senderAccountId ? Number(senderAccountId) : null,
        send_as_mode: sendAsChannelToggle ? 'channel' : 'account',
        send_as_channel_username: sendAsChannelToggle ? (sendAsChannel.trim() || null) : null,
        custom_prompt: customPrompt.trim() || null,
        skip_ads: skipAds,
        auto_join_bots: autoJoinOnAdd,
        auto_join_count: autoJoinCountOnAdd
      })).data;
    },
    onSuccess: (data) => {
      setNewChannels('');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      refetchSmoothJoin();
      const count = data?.added_ids?.length || 1;
      const modeLabel = addMode === 'first_comment' ? 'Режим: Первый комментарий' : 'Режим: Сценарий';
      if (autoJoinOnAdd) {
        showToast(`Добавлено каналов: ${count} (${modeLabel}). Запущен плавный вход ботов.`, 'success');
      } else {
        showToast(`Добавлено каналов: ${count} (${modeLabel})`, 'success');
      }
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка добавления каналов', 'error')
  });

  const saveEditChannel = useMutation({
    mutationFn: async (updated: Partial<ChannelItem> & { id: number }) => {
      return (await axios.patch(`/api/channels/${updated.id}`, updated)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setEditingChannel(null);
      showToast('Параметры канала сохранены', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка сохранения настроек канала', 'error')
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/channels/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      showToast('Канал исключен из мониторинга', 'info');
    },
    onError: () => showToast('Ошибка при удалении канала', 'error')
  });

  const toggleChannel = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await axios.patch(`/api/channels/${id}`, { is_active: active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
    onError: () => showToast('Не удалось изменить статус канала', 'error')
  });

  const toggleExecutionMode = useMutation({
    mutationFn: async ({ id, mode }: { id: number; mode: 'scenario' | 'first_comment' }) => {
      await axios.patch(`/api/channels/${id}`, { execution_mode: mode });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      showToast(`Режим переключен: ${vars.mode === 'first_comment' ? 'Первый комментарий' : 'Сценарий'}`, 'success');
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
      showToast('Задержки обновлены', 'success');
    }
  });

  const startMonitor = useMutation({
    mutationFn: async () => axios.post('/api/channels/monitor/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitorStatus'] });
      showToast('Мониторинг запущен', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка запуска мониторинга', 'error')
  });

  const stopMonitor = useMutation({
    mutationFn: async () => axios.post('/api/channels/monitor/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitorStatus'] });
      showToast('Мониторинг приостановлен', 'info');
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
      if (filterMode === 'first_comment') return ch.execution_mode === 'first_comment';
      return true;
    });
  }, [channels, searchQuery, filterMode]);

  const detectedChannelCount = useMemo(() => {
    if (!newChannels.trim()) return 0;
    return newChannels.replace(/,/g, '\n').split('\n').map(s => s.trim()).filter(Boolean).length;
  }, [newChannels]);

  const activeChannelsCount = channels.filter(c => c.is_active).length;
  const firstCommentCount = channels.filter(c => c.execution_mode === 'first_comment').length;

  const openEditModal = (ch: ChannelItem) => {
    setEditingChannel({ ...ch });
    setEditSendAsChannelToggle(ch.send_as_mode === 'channel');
    setEditManualChannelInput(false);
    setEditVerifyState({ loading: false });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Delete Confirmation Modal */}
      <ModalOverlay
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Удаление канала"
        subtitle="Канал будет исключен из очереди автоматического мониторинга"
        icon={<ShieldAlert className="w-5 h-5 text-red-500" />}
        footer={
          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button
              onClick={() => setConfirmDeleteId(null)}
              style={{
                flex: 1, backgroundColor: 'var(--bg-main)', color: 'var(--text-main)',
                border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => confirmDeleteId && deleteChannel.mutate(confirmDeleteId)}
              disabled={deleteChannel.isPending}
              style={{
                flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none',
                borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 700,
                cursor: deleteChannel.isPending ? 'not-allowed' : 'pointer',
                opacity: deleteChannel.isPending ? 0.6 : 1,
              }}
            >
              {deleteChannel.isPending ? 'Удаление...' : 'Удалить'}
            </button>
          </div>
        }
      >
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Вы уверены, что хотите удалить этот канал? Задачи комментирования по новым публикациям будут остановлены.
        </p>
      </ModalOverlay>

      {/* Edit Channel Modal */}
      {editingChannel && (
        <ModalOverlay
          isOpen={editingChannel !== null}
          onClose={() => setEditingChannel(null)}
          title={`Настройки канала @${editingChannel.channel_username}`}
          subtitle="Режим комментирования, авторство и параметры генерации"
          icon={<Settings className="w-5 h-5 text-accent" />}
          footer={
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                type="button"
                onClick={() => setEditingChannel(null)}
                style={{
                  flex: 1, backgroundColor: 'var(--bg-main)', color: 'var(--text-main)',
                  border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  saveEditChannel.mutate({
                    id: editingChannel.id,
                    execution_mode: editingChannel.execution_mode || 'scenario',
                    sender_account_id: editingChannel.sender_account_id ? Number(editingChannel.sender_account_id) : null,
                    send_as_mode: editSendAsChannelToggle ? 'channel' : 'account',
                    send_as_channel_username: editSendAsChannelToggle ? (editingChannel.send_as_channel_username || null) : null,
                    custom_prompt: editingChannel.custom_prompt || null,
                    min_delay_seconds: editingChannel.min_delay_seconds,
                    max_delay_seconds: editingChannel.max_delay_seconds,
                    skip_ads: editingChannel.skip_ads !== false
                  });
                }}
                disabled={saveEditChannel.isPending}
                style={{
                  flex: 1, backgroundColor: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 700,
                  cursor: saveEditChannel.isPending ? 'not-allowed' : 'pointer'
                }}
              >
                {saveEditChannel.isPending ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Mode Switcher */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>
                Режим работы
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditingChannel({ ...editingChannel, execution_mode: 'scenario' })}
                  style={{
                    padding: '10px', borderRadius: '10px',
                    border: (editingChannel.execution_mode || 'scenario') === 'scenario' ? '1px solid #10b981' : '1px solid var(--border-color)',
                    backgroundColor: (editingChannel.execution_mode || 'scenario') === 'scenario' ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-main)',
                    color: (editingChannel.execution_mode || 'scenario') === 'scenario' ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 700
                  }}
                >
                  <Layers className="w-4 h-4" />
                  <span>Ветка сценария</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingChannel({ ...editingChannel, execution_mode: 'first_comment' })}
                  style={{
                    padding: '10px', borderRadius: '10px',
                    border: editingChannel.execution_mode === 'first_comment' ? '1px solid #6366f1' : '1px solid var(--border-color)',
                    backgroundColor: editingChannel.execution_mode === 'first_comment' ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-main)',
                    color: editingChannel.execution_mode === 'first_comment' ? '#818cf8' : 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 700
                  }}
                >
                  <Zap className="w-4 h-4" />
                  <span>Первый комментарий</span>
                </button>
              </div>
            </div>

            {/* First Comment Custom Settings in Modal */}
            {editingChannel.execution_mode === 'first_comment' && (
              <div style={{
                backgroundColor: 'var(--bg-main)', border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px'
              }}>
                {/* Sender Account */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Рабочий аккаунт
                  </label>
                  <select
                    value={editingChannel.sender_account_id || ''}
                    onChange={e => setEditingChannel({ ...editingChannel, sender_account_id: e.target.value ? Number(e.target.value) : null })}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                    }}
                  >
                    <option value="">Автовыбор из пула активных аккаунтов</option>
                    {activeAccounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        ID #{acc.id} {acc.custom_name ? `• ${acc.custom_name}` : ''} ({acc.username ? `@${acc.username}` : acc.phone})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Send As Channel Toggle */}
                <div
                  onClick={() => setEditSendAsChannelToggle(!editSendAsChannelToggle)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                    padding: '10px 12px', borderRadius: '10px',
                    backgroundColor: editSendAsChannelToggle ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-card)',
                    border: `1px solid ${editSendAsChannelToggle ? 'rgba(99, 102, 241, 0.35)' : 'var(--border-color)'}`
                  }}
                >
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '6px',
                    backgroundColor: editSendAsChannelToggle ? '#6366f1' : 'transparent',
                    border: `1px solid ${editSendAsChannelToggle ? '#6366f1' : 'var(--border-color)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
                  }}>
                    {editSendAsChannelToggle && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Megaphone className="w-4 h-4 text-indigo-400" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                      От лица канала ({editSendAsChannelToggle ? 'ВКЛ' : 'ВЫКЛ'})
                    </span>
                  </div>
                </div>

                {/* Channel selection if toggle ON */}
                {editSendAsChannelToggle && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Канал для публикации
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => refetchEditAdminChannels()}
                          disabled={isEditAdminChannelsLoading || !editingChannel.sender_account_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            backgroundColor: 'transparent', border: 'none', color: '#818cf8', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          <RotateCw className={`w-3 h-3 ${isEditAdminChannelsLoading ? 'animate-spin' : ''}`} />
                          <span>Обновить список</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditManualChannelInput(!editManualChannelInput)}
                          style={{
                            backgroundColor: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          {editManualChannelInput ? 'Выбрать из списка' : 'Ввести вручную'}
                        </button>
                      </div>
                    </div>

                    {!editManualChannelInput && editAdminChannels.length > 0 ? (
                      <select
                        value={editingChannel.send_as_channel_username || ''}
                        onChange={e => setEditingChannel({ ...editingChannel, send_as_channel_username: e.target.value })}
                        style={{
                          width: '100%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                          borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                        }}
                      >
                        <option value="">Выберите канал аккаунта</option>
                        {editAdminChannels.map(c => (
                          <option key={c.id} value={c.username ? `@${c.username}` : String(c.id)}>
                            {c.title} {c.username ? `(@${c.username})` : `(ID: ${c.id})`} {c.is_creator ? '• Создатель' : '• Админ'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="@my_channel"
                          value={editingChannel.send_as_channel_username || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, send_as_channel_username: e.target.value })}
                          style={{
                            flex: 1, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleVerifySendAs(editingChannel.sender_account_id || '', editingChannel.send_as_channel_username || '', true)}
                          disabled={editVerifyState.loading}
                          style={{
                            backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)',
                            color: '#818cf8', borderRadius: '8px', padding: '0 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          {editVerifyState.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Проверить'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Prompt Presets & Editor */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                      Инструкция для генерации
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                    {FIRST_COMMENT_PRESETS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setEditingChannel({ ...editingChannel, custom_prompt: p.prompt })}
                        style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer'
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Системный промпт (по умолчанию: лаконичный релевантный комментарий)"
                    value={editingChannel.custom_prompt || ''}
                    onChange={e => setEditingChannel({ ...editingChannel, custom_prompt: e.target.value })}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                    }}
                  />
                </div>

                {/* Anti-ad toggle */}
                <div
                  onClick={() => setEditingChannel({ ...editingChannel, skip_ads: editingChannel.skip_ads === false ? true : false })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                    padding: '8px 10px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px',
                    backgroundColor: editingChannel.skip_ads !== false ? '#10b981' : 'transparent',
                    border: `1px solid ${editingChannel.skip_ads !== false ? '#10b981' : 'var(--border-color)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                  }}>
                    {editingChannel.skip_ads !== false && <Check className="w-3 h-3" />}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                    Фильтрация рекламы (пропуск erid / #реклама)
                  </span>
                </div>
              </div>
            )}

            {/* Timing Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Мин. пауза (сек)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingChannel.min_delay_seconds}
                  onChange={e => setEditingChannel({ ...editingChannel, min_delay_seconds: Number(e.target.value) })}
                  style={{
                    width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Макс. пауза (сек)
                </label>
                <input
                  type="number"
                  min={editingChannel.min_delay_seconds}
                  value={editingChannel.max_delay_seconds}
                  onChange={e => setEditingChannel({ ...editingChannel, max_delay_seconds: Number(e.target.value) })}
                  style={{
                    width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>
        </ModalOverlay>
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
                Мониторинг каналов
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
              Автоматический перехват публикаций: диалоговые сценарии или мгновенный первый комментарий от имени канала.
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
            >
              {startMonitor.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              {startMonitor.isPending ? 'Запуск...' : 'Запустить сканирование'}
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
          <span>Мониторинг каналов</span>
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
            border: activeTab === 'joiner' ? '1px solid var(--accent)' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'joiner' ? 'var(--accent-soft)' : 'var(--bg-card)',
            color: activeTab === 'joiner' ? 'var(--accent-text)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          <LogIn className="w-4 h-4" />
          <span>Плавный инвайтер</span>
          {smoothJoinStatus?.status === 'running' && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '10px',
              backgroundColor: '#10b981',
              color: '#fff',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              В процессе
            </span>
          )}
        </button>
      </div>

      {activeTab === 'monitor' ? (
        <>
          {/* Metrics Overview Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px'
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
                  Всего на контроле
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
                backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#818cf8', letterSpacing: '-0.02em' }}>
                  {firstCommentCount}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Первый комментарий
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
                  Зафиксировано событий
                </div>
              </div>
            </div>
          </div>

          {/* Main Workspace Layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(340px, 440px) 1fr',
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
                    {detectedChannelCount} в списке
                  </span>
                )}
              </div>

              {/* Mode Selection Segmented Control */}
              <div>
                <label style={{
                  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px', display: 'block'
                }}>
                  Режим комментирования
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  backgroundColor: 'var(--bg-main)',
                  padding: '4px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-color)'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('scenario');
                      setMinDelay(10);
                      setMaxDelay(30);
                    }}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: addMode === 'scenario' ? '1px solid #10b981' : 'none',
                      backgroundColor: addMode === 'scenario' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: addMode === 'scenario' ? '#10b981' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Layers className="w-4 h-4" />
                    <span>Ветка сценария</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('first_comment');
                      setMinDelay(0);
                      setMaxDelay(2);
                    }}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: addMode === 'first_comment' ? '1px solid #6366f1' : 'none',
                      backgroundColor: addMode === 'first_comment' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                      color: addMode === 'first_comment' ? '#818cf8' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Zap className="w-4 h-4" />
                    <span>Первый комментарий</span>
                  </button>
                </div>
              </div>

              {/* Target channels input */}
              <div>
                <label style={{
                  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px', display: 'block'
                }}>
                  Ссылки или юзернеймы целевых каналов
                </label>
                <textarea
                  placeholder={"@channel_one\nhttps://t.me/channel_two\nchannel_three"}
                  value={newChannels}
                  onChange={e => setNewChannels(e.target.value)}
                  rows={4}
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
              </div>

              {/* FIRST COMMENT SPECIFIC SETTINGS */}
              {addMode === 'first_comment' && (
                <div style={{
                  backgroundColor: 'rgba(99, 102, 241, 0.06)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#818cf8' }}>
                    <Zap className="w-4 h-4" />
                    <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Параметры первого комментария
                    </span>
                  </div>

                  {/* Sender Account */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                      Рабочий аккаунт
                    </label>
                    <select
                      value={senderAccountId}
                      onChange={e => setSenderAccountId(e.target.value ? Number(e.target.value) : '')}
                      style={{
                        width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                        borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-main)', outline: 'none'
                      }}
                    >
                      <option value="">Автовыбор из активных аккаунтов</option>
                      {activeAccounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          ID #{acc.id} {acc.custom_name ? `• ${acc.custom_name}` : ''} ({acc.username ? `@${acc.username}` : acc.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Send As Channel Toggle */}
                  <div
                    onClick={() => setSendAsChannelToggle(!sendAsChannelToggle)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                      padding: '10px 12px', borderRadius: '10px',
                      backgroundColor: sendAsChannelToggle ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-main)',
                      border: `1px solid ${sendAsChannelToggle ? 'rgba(99, 102, 241, 0.35)' : 'var(--border-color)'}`
                    }}
                  >
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '6px',
                      backgroundColor: sendAsChannelToggle ? '#6366f1' : 'transparent',
                      border: `1px solid ${sendAsChannelToggle ? '#6366f1' : 'var(--border-color)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
                    }}>
                      {sendAsChannelToggle && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Megaphone className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                          От лица канала ({sendAsChannelToggle ? 'ВКЛ' : 'ВЫКЛ'})
                        </div>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                          Публикация сообщения с аватаром и именем Telegram-канала
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Channel selection if toggle ON */}
                  {sendAsChannelToggle && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                          Канал для публикации
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => refetchAddAdminChannels()}
                            disabled={isAddAdminChannelsLoading || !senderAccountId}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              backgroundColor: 'transparent', border: 'none', color: '#818cf8', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            <RotateCw className={`w-3 h-3 ${isAddAdminChannelsLoading ? 'animate-spin' : ''}`} />
                            <span>Обновить список</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualChannelInput(!manualChannelInput)}
                            style={{
                              backgroundColor: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            {manualChannelInput ? 'Выбрать из списка' : 'Ввести вручную'}
                          </button>
                        </div>
                      </div>

                      {!manualChannelInput && addAdminChannels.length > 0 ? (
                        <select
                          value={sendAsChannel}
                          onChange={e => setSendAsChannel(e.target.value)}
                          style={{
                            width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                            borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                          }}
                        >
                          <option value="">Выберите канал аккаунта</option>
                          {addAdminChannels.map(c => (
                            <option key={c.id} value={c.username ? `@${c.username}` : String(c.id)}>
                              {c.title} {c.username ? `(@${c.username})` : `(ID: ${c.id})`} {c.is_creator ? '• Создатель' : '• Админ'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            placeholder="@my_channel"
                            value={sendAsChannel}
                            onChange={e => setSendAsChannel(e.target.value)}
                            style={{
                              flex: 1, backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                              borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleVerifySendAs(senderAccountId, sendAsChannel, false)}
                            disabled={verifyState.loading}
                            style={{
                              backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.35)',
                              color: '#818cf8', borderRadius: '8px', padding: '0 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            {verifyState.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Проверить'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prompt Studio with Quick Presets */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Инструкция для генерации
                      </label>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                      {FIRST_COMMENT_PRESETS.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setCustomPrompt(p.prompt)}
                          style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            backgroundColor: customPrompt === p.prompt ? 'rgba(99, 102, 241, 0.25)' : 'var(--bg-main)',
                            border: `1px solid ${customPrompt === p.prompt ? '#6366f1' : 'var(--border-color)'}`,
                            color: customPrompt === p.prompt ? '#818cf8' : 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={3}
                      placeholder="Кастомная инструкция (например: 'Остроумный экспертный комментарий строго по теме')"
                      value={customPrompt}
                      onChange={e => setCustomPrompt(e.target.value)}
                      style={{
                        width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                        borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)', outline: 'none'
                      }}
                    />
                  </div>

                  {/* Anti-Ad Shield Toggle */}
                  <div
                    onClick={() => setSkipAds(!skipAds)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                      padding: '10px 12px', borderRadius: '10px',
                      backgroundColor: skipAds ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-main)',
                      border: `1px solid ${skipAds ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-color)'}`
                    }}
                  >
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '6px',
                      backgroundColor: skipAds ? '#10b981' : 'transparent',
                      border: `1px solid ${skipAds ? '#10b981' : 'var(--border-color)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
                    }}>
                      {skipAds && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                        Фильтрация рекламных постов
                      </div>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                        Пропуск постов с маркировкой #реклама, erid и спонсорскими ссылками
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Preset Delay Selectors */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{
                    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 0
                  }}>
                    Пауза перед отправкой
                  </label>
                  <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 600 }}>
                    {addMode === 'first_comment' ? 'Мгновенная реакция' : 'до старта ветки'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {(addMode === 'first_comment' ? [
                    { label: '0–2 сек', min: 0, max: 2 },
                    { label: '1–3 сек', min: 1, max: 3 },
                    { label: '3–8 сек', min: 3, max: 8 }
                  ] : [
                    { label: '5–15 сек', min: 5, max: 15 },
                    { label: '10–30 сек', min: 10, max: 30 },
                    { label: '30–60 сек', min: 30, max: 60 }
                  ]).map(preset => {
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
                          padding: '8px 4px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                          border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                          backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-main)',
                          color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                          cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
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
                    min={0}
                    value={minDelay}
                    onChange={e => setMinDelay(Math.max(0, Number(e.target.value)))}
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

              {/* Auto-join Bots */}
              <div style={{
                backgroundColor: autoJoinOnAdd ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-main)',
                border: `1px solid ${autoJoinOnAdd ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-color)'}`,
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
                    width: '20px', height: '20px', borderRadius: '6px',
                    backgroundColor: autoJoinOnAdd ? '#6366f1' : 'transparent',
                    border: `1px solid ${autoJoinOnAdd ? '#6366f1' : 'var(--border-color)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', flexShrink: 0
                  }}>
                    {autoJoinOnAdd && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                      Плавный вход в чат обсуждения
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                      Автоматическое добавление аккаунтов в группу перед комментированием
                    </p>
                  </div>
                </div>

                {autoJoinOnAdd && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid rgba(99, 102, 241, 0.15)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Количество ботов:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAutoJoinCountOnAdd(n)}
                          style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                            border: autoJoinCountOnAdd === n ? '1px solid #6366f1' : '1px solid var(--border-color)',
                            backgroundColor: autoJoinCountOnAdd === n ? '#6366f1' : 'var(--bg-main)',
                            color: autoJoinCountOnAdd === n ? '#fff' : 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={() => addChannels.mutate()}
                disabled={!newChannels.trim() || addChannels.isPending}
                style={{
                  backgroundColor: addMode === 'first_comment' ? '#6366f1' : 'var(--accent)',
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
                {addChannels.isPending ? 'Сохранение...' : addMode === 'first_comment' ? 'Добавить в режим первого комментария' : 'Добавить в мониторинг'}
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
                      Список каналов на контроле
                    </h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Индивидуальные настройки режимов, задержек и авторства.
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
                      {(['all', 'active', 'paused', 'first_comment'] as const).map(mode => (
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
                          {mode === 'all' ? 'Все' : mode === 'active' ? 'Вкл' : mode === 'paused' ? 'Пауза' : '1-й коммент'}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filteredChannels.map(ch => {
                      const draft = delayDrafts[ch.id] || { min: ch.min_delay_seconds, max: ch.max_delay_seconds };
                      const isDirty = draft.min !== ch.min_delay_seconds || draft.max !== ch.max_delay_seconds;
                      const isFirstComment = ch.execution_mode === 'first_comment';

                      return (
                        <div
                          key={ch.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px 18px', borderRadius: '14px',
                            backgroundColor: 'var(--bg-main)',
                            border: `1px solid ${isFirstComment ? 'rgba(99, 102, 241, 0.25)' : 'var(--border-color)'}`,
                            transition: 'all 0.15s ease',
                            opacity: ch.is_active ? 1 : 0.65,
                            flexWrap: 'wrap',
                            gap: '12px'
                          }}
                        >
                          {/* Left: Channel Info & Badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '10px',
                              backgroundColor: isFirstComment ? 'rgba(99, 102, 241, 0.15)' : ch.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: isFirstComment ? '#818cf8' : ch.is_active ? '#10b981' : '#ef4444',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              {isFirstComment ? <Zap className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                {isFirstComment ? (
                                  <span style={{
                                    fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '6px',
                                    backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: '3px'
                                  }}>
                                    <Zap className="w-2.5 h-2.5" />
                                    {ch.send_as_mode === 'channel' && ch.send_as_channel_username ? `Канал: ${ch.send_as_channel_username}` : 'Первый комментарий'}
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '6px',
                                    backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '3px'
                                  }}>
                                    <Layers className="w-2.5 h-2.5" />
                                    Сценарий
                                  </span>
                                )}

                                {ch.skip_ads && isFirstComment && (
                                  <span style={{ fontSize: '10px', color: '#10b981', display: 'inline-flex', alignItems: 'center' }} title="Фильтр рекламы активен">
                                    <ShieldCheck className="w-3 h-3" />
                                  </span>
                                )}
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
                              min={0}
                              value={draft.min}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setDelayDrafts(prev => ({ ...prev, [ch.id]: { ...draft, min: val } }));
                              }}
                              style={{
                                width: '38px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
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
                                width: '38px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
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

                          {/* Right: Mode & Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Mode toggle button */}
                            <button
                              onClick={() => toggleExecutionMode.mutate({ id: ch.id, mode: isFirstComment ? 'scenario' : 'first_comment' })}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '6px 10px', borderRadius: '8px',
                                border: isFirstComment ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(16, 185, 129, 0.3)',
                                backgroundColor: isFirstComment ? 'rgba(99, 102, 241, 0.15)' : 'rgba(16, 185, 129, 0.08)',
                                color: isFirstComment ? '#818cf8' : '#10b981',
                                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                              title="Нажмите для переключения режима (Сценарий / Первый комментарий)"
                            >
                              {isFirstComment ? <Zap className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                              <span>{isFirstComment ? '1-й коммент' : 'Сценарий'}</span>
                            </button>

                            {/* Edit modal button */}
                            <button
                              onClick={() => openEditModal(ch)}
                              style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)',
                                color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.15s'
                              }}
                              title="Параметры канала"
                            >
                              <Settings className="w-3.5 h-3.5" />
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
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Terminal className="w-4 h-4" />
                    </div>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                      Журнал событий мониторинга
                    </h3>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Live обновление
                  </span>
                </div>

                <div style={{
                  maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px',
                  paddingRight: '4px'
                }}>
                  {logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      Событий пока не зафиксировано
                    </div>
                  ) : (
                    logs.slice(0, 15).map((log: any) => {
                      const isSuccess = log.status === 'success' || log.status === 'ok';
                      return (
                        <div
                          key={log.id}
                          style={{
                            padding: '10px 14px', borderRadius: '10px',
                            backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '8px', height: '8px', borderRadius: '50%',
                              backgroundColor: isSuccess ? '#10b981' : '#ef4444',
                              flexShrink: 0
                            }} />
                            <span style={{ fontSize: '12px', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                              {log.error_message || `Сценарий #${log.scenario_id} завершен`}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {log.executed_at ? new Date(log.executed_at).toLocaleTimeString() : ''}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Smooth Joiner Tab Workspace */
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '18px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>
              Плавный инвайтер ботов в группы обсуждений
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Безопасный автоматический вход ботов в чаты с человеческими рандомизированными паузами для обхода антиспам-фильтров.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  Ссылки на каналы или чаты для входа
                </label>
                <textarea
                  rows={6}
                  placeholder={"https://t.me/chat_one\n@channel_two\nhttps://t.me/+private_link"}
                  value={joinLinks}
                  onChange={e => setJoinLinks(e.target.value)}
                  style={{
                    width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                    borderRadius: '12px', padding: '12px', fontSize: '13px', color: 'var(--text-main)', outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Ботов на чат
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={joinAccountCount}
                    onChange={e => setJoinAccountCount(Math.max(1, Number(e.target.value)))}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Мин. пауза (сек)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={joinMinDelay}
                    onChange={e => setJoinMinDelay(Math.max(5, Number(e.target.value)))}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)'
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
                    onChange={e => setJoinMaxDelay(Math.max(joinMinDelay, Number(e.target.value)))}
                    style={{
                      width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text-main)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => startSmoothJoinMutation.mutate()}
                  disabled={!joinLinks.trim() || startSmoothJoinMutation.isPending || smoothJoinStatus?.status === 'running'}
                  style={{
                    flex: 1, backgroundColor: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    opacity: (!joinLinks.trim() || smoothJoinStatus?.status === 'running') ? 0.5 : 1
                  }}
                >
                  {startSmoothJoinMutation.isPending ? 'Запуск...' : 'Запустить плавный вход'}
                </button>

                {smoothJoinStatus?.status === 'running' && (
                  <button
                    type="button"
                    onClick={() => cancelSmoothJoinMutation.mutate()}
                    disabled={cancelSmoothJoinMutation.isPending}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '12px', padding: '12px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Отменить
                  </button>
                )}
              </div>
            </div>

            {/* Smooth Join Status Card */}
            <div style={{
              backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
              borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                  Текущий статус процесса
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                  backgroundColor: smoothJoinStatus?.status === 'running' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-card)',
                  color: smoothJoinStatus?.status === 'running' ? '#10b981' : 'var(--text-muted)'
                }}>
                  {smoothJoinStatus?.status === 'running' ? 'ВЫПОЛНЯЕТСЯ' : 'НЕ АКТИВЕН'}
                </span>
              </div>

              <div style={{
                maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px',
                fontSize: '12px', fontFamily: 'monospace'
              }}>
                {(!smoothJoinStatus?.logs || smoothJoinStatus.logs.length === 0) ? (
                  <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                    Логи инвайтинга появятся здесь после запуска процесса
                  </div>
                ) : (
                  smoothJoinStatus.logs.map((item: string, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '6px 10px', borderRadius: '6px',
                        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                        color: item.startsWith('OK') || item.includes('Успешно') ? '#10b981' : item.includes('Ошибка') ? '#ef4444' : 'var(--text-main)'
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
    </div>
  );
}
