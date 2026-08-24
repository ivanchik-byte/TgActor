import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Send,
  Paperclip,
  X,
  MessageSquare,
  Download,
  Trash2,
  Edit2,
  Reply,
  Copy,
  CheckCheck,
  Bot,
  Image as ImageIcon,
  ArrowDown,
  Hash,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Loader2,
  FileText,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useToast } from '../components/ToastContext';

// Media endpoints require auth; img tags cannot send headers
const withMediaToken = (path: string) => {
  const token = localStorage.getItem('tgactor_token') ?? '';
  return `${path}?token=${encodeURIComponent(token)}`;
};

// ─── Types ───────────────────────────────────────────────

interface ChatItem {
  account_id: number;
  peer_id: number;
  peer_name: string;
  peer_username?: string | null;
  sender_username?: string | null;
  account_username?: string | null;
  account_phone: string;
  account_name: string;
  account_custom_name?: string | null;
  last_message?: string | null;
  updated_at?: string | null;
}

interface MessageItem {
  id: number;
  message_id?: number | null;
  account_id: number;
  peer_id: number;
  peer_name: string;
  peer_username?: string | null;
  incoming: boolean;
  is_incoming: boolean;
  text?: string | null;
  media_path?: string | null;
  created_at?: string | null;
}

interface Account {
  id: number;
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  custom_name?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────

const AVATAR_PALETTE: readonly [string, string][] = [
  ['#6366f1', '#4338ca'],
  ['#0ea5e9', '#0369a1'],
  ['#10b981', '#047857'],
  ['#f59e0b', '#b45309'],
  ['#ec4899', '#be185d'],
  ['#8b5cf6', '#6d28d9'],
  ['#06b6d4', '#0e7490'],
  ['#e11d48', '#9f1239'],
];

function getAvatarColors(name?: string | null, id?: number | null): [string, string] {
  const safeName = String(name || '');
  const safeId = typeof id === 'number' && !isNaN(id) ? id : 0;
  const idx = Math.abs((safeName.length + safeId) % AVATAR_PALETTE.length);
  return [AVATAR_PALETTE[idx][0], AVATAR_PALETTE[idx][1]];
}

function getInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || '?';
  }
  return name.slice(0, 2).toUpperCase() || '?';
}

function formatTime(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function formatMsgTime(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function isImageFile(path?: string | null): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.gif');
}

function groupMessagesByDate(msgs?: MessageItem[] | null) {
  if (!Array.isArray(msgs)) return [];
  const groups: { label: string; messages: MessageItem[] }[] = [];
  let currentLabel = '';
  for (const msg of msgs) {
    if (!msg) continue;
    let label = '';
    if (msg.created_at) {
      try {
        const d = new Date(msg.created_at);
        if (!isNaN(d.getTime())) {
          const now = new Date();
          if (d.toDateString() === now.toDateString()) {
            label = 'Сегодня';
          } else {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (d.toDateString() === yesterday.toDateString()) {
              label = 'Вчера';
            } else {
              label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
            }
          }
        }
      } catch {
        label = '';
      }
    }
    if (label !== currentLabel) {
      groups.push({ label, messages: [msg] });
      currentLabel = label;
    } else if (groups.length > 0) {
      groups[groups.length - 1].messages.push(msg);
    }
  }
  return groups;
}

// ─── Component ───────────────────────────────────────────

export default function Inbox() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);
  const [collapsedAccounts, setCollapsedAccounts] = useState<Record<number, boolean>>({});
  const [text, setText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageItem | null>(null);
  const [editText, setEditText] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearScope, setClearScope] = useState<'current' | 'all'>('current');
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [downloadingMsgId, setDownloadingMsgId] = useState<number | null>(null);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accountsScrollRef = useRef<HTMLDivElement>(null);

  // ─── Real-Time WebSocket Live Sync ───────────────────

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isUnmounted = false;

    const connectWs = () => {
      if (isUnmounted) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // In local development frontend is on :5173 / :3000, backend is on :8000
        const host = window.location.port === '5173' || window.location.port === '3000'
          ? `${window.location.hostname}:8000`
          : window.location.host;

        // Backend requires an auth token on the WebSocket handshake
        const token = localStorage.getItem('tgactor_token') ?? '';
        ws = new WebSocket(`${protocol}//${host}/ws/inbox?token=${encodeURIComponent(token)}`);

        ws.onopen = () => {
          if (!isUnmounted) setIsWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'new_messages' || data.event === 'message_sent' || data.event === 'message_edited' || data.event === 'message_deleted' || data.event === 'sync_cleared') {
              queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
              queryClient.invalidateQueries({ queryKey: ['inboxChats'] });
            }
          } catch {
            // Raw text or ping
            queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
            queryClient.invalidateQueries({ queryKey: ['inboxChats'] });
          }
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            setIsWsConnected(false);
            reconnectTimeout = setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch {
        if (!isUnmounted) reconnectTimeout = setTimeout(connectWs, 4000);
      }
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [queryClient]);

  // ─── Queries ─────────────────────────────────────────

  const { data: rawAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await axios.get('/api/accounts');
      return Array.isArray(res.data) ? res.data : [];
    },
    refetchInterval: 10000,
  });
  const accounts = Array.isArray(rawAccounts) ? rawAccounts : [];

  const {
    data: rawChats = [],
    isLoading: isLoadingChats,
    isRefetching: isRefetchingChats,
  } = useQuery<ChatItem[]>({
    queryKey: ['inboxChats', filterAccountId],
    queryFn: async () => {
      const url = filterAccountId ? `/api/inbox/chats?account_id=${filterAccountId}` : '/api/inbox/chats';
      const res = await axios.get(url);
      return Array.isArray(res.data) ? res.data : [];
    },
    refetchInterval: 4000,
  });
  const chats = Array.isArray(rawChats) ? rawChats : [];

  const {
    data: rawMessages = [],
    isLoading: isLoadingMessages,
  } = useQuery<MessageItem[]>({
    queryKey: ['inboxMessages', selectedChat?.account_id, selectedChat?.peer_id],
    queryFn: async () => {
      if (!selectedChat) return [];
      const res = await axios.get(`/api/inbox/messages/${selectedChat.account_id}/${selectedChat.peer_id}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!selectedChat,
    refetchInterval: 2500,
  });
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  // ─── Auto-scroll ─────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const gap = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollDown(gap > 300);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [selectedChat]);

  // Pre-select from dashboard
  useEffect(() => {
    const preId = localStorage.getItem('selected_inbox_account_id');
    if (preId && chats.length > 0) {
      const id = Number(preId);
      const found = chats.find((c) => c.account_id === id);
      if (found) {
        setSelectedChat(found);
        setFilterAccountId(id);
      }
      localStorage.removeItem('selected_inbox_account_id');
    }
  }, [chats]);

  // ─── Mutations ───────────────────────────────────────

  const syncMutation = useMutation({
    mutationFn: async (accId?: number | null) => {
      if (accId) return (await axios.post(`/api/inbox/sync/${accId}`)).data;
      return (await axios.post('/api/inbox/sync')).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inboxChats'] });
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
      showToast(
        data && data.total_messages !== undefined
          ? `Синхронизировано: ${data.total_messages} новых сообщений`
          : 'Аккаунт синхронизирован',
        'success'
      );
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка синхронизации', 'error'),
  });

  const clearSyncMutation = useMutation({
    mutationFn: async (scope: 'current' | 'all') => {
      if (scope === 'current' && selectedChat) {
        return (await axios.delete(`/api/inbox/sync/${selectedChat.account_id}`)).data;
      }
      return (await axios.delete('/api/inbox/sync')).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxChats'] });
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
      setShowClearModal(false);
      setSelectedChat(null);
      showToast('Кэш диалогов очищен', 'info');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка очистки', 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChat) return;
      const fd = new FormData();
      fd.append('account_id', selectedChat.account_id.toString());
      fd.append('peer_id', selectedChat.peer_id.toString());
      fd.append('text', text);
      if (attachedFile) fd.append('file', attachedFile);
      if (replyingTo?.message_id) fd.append('reply_to_msg_id', replyingTo.message_id.toString());
      return (await axios.post('/api/inbox/send', fd)).data;
    },
    onSuccess: () => {
      setText('');
      setAttachedFile(null);
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
      queryClient.invalidateQueries({ queryKey: ['inboxChats'] });
      setTimeout(scrollToBottom, 100);
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Не удалось отправить', 'error'),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChat || !editingMessage) return;
      return (
        await axios.post('/api/inbox/edit', {
          account_id: selectedChat.account_id,
          peer_id: selectedChat.peer_id,
          message_id: editingMessage.id,
          new_text: editText,
        })
      ).data;
    },
    onSuccess: () => {
      setEditingMessage(null);
      setEditText('');
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
      showToast('Сообщение отредактировано', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка редактирования', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (msg: MessageItem) => {
      if (!selectedChat) return;
      return (
        await axios.post('/api/inbox/delete', {
          account_id: selectedChat.account_id,
          peer_id: selectedChat.peer_id,
          message_id: msg.id,
        })
      ).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
      queryClient.invalidateQueries({ queryKey: ['inboxChats'] });
      showToast('Сообщение удалено', 'info');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка удаления', 'error'),
  });

  const downloadMediaMutation = useMutation({
    mutationFn: async (messageId: number) => {
      setDownloadingMsgId(messageId);
      const res = await axios.post(`/api/inbox/download-media/${messageId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
      showToast('Медиафайл успешно загружен!', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось загрузить медиафайл', 'error');
    },
    onSettled: () => {
      setDownloadingMsgId(null);
    }
  });

  // ─── Filter & Grouping ────────────────────────────────

  const filteredChats = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return chats;
    return chats.filter((c) => {
      if (!c) return false;
      return (
        (c.peer_name || '').toLowerCase().includes(q) ||
        (c.peer_username || '').toLowerCase().includes(q) ||
        (c.last_message || '').toLowerCase().includes(q) ||
        (c.account_phone || '').toLowerCase().includes(q) ||
        (c.account_name || '').toLowerCase().includes(q)
      );
    });
  }, [chats, searchQuery]);

  // Group chats by account ID for structured view
  const groupedByAccount = useMemo(() => {
    const map = new Map<number, { accountLabel: string; accountPhone: string; chats: ChatItem[] }>();

    for (const chat of filteredChats) {
      if (!map.has(chat.account_id)) {
        const label =
          chat.account_custom_name ||
          chat.account_name ||
          (chat.account_username ? `@${chat.account_username}` : chat.account_phone);
        map.set(chat.account_id, {
          accountLabel: label,
          accountPhone: chat.account_phone,
          chats: [],
        });
      }
      map.get(chat.account_id)!.chats.push(chat);
    }

    return Array.from(map.entries()).map(([accountId, data]) => ({
      accountId,
      accountLabel: data.accountLabel,
      accountPhone: data.accountPhone,
      chats: data.chats,
    }));
  }, [filteredChats]);

  // Account chat counts map for switcher
  const accountChatCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const chat of chats) {
      counts[chat.account_id] = (counts[chat.account_id] || 0) + 1;
    }
    return counts;
  }, [chats]);

  const dateGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  // Horizontal scroll helper for accounts
  const scrollAccounts = (direction: 'left' | 'right') => {
    if (accountsScrollRef.current) {
      const offset = direction === 'left' ? -220 : 220;
      accountsScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Auto-resize textarea
  const handleTextareaInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, []);

  const toggleAccountCollapse = (accId: number) => {
    setCollapsedAccounts((prev) => ({ ...prev, [accId]: !prev[accId] }));
  };

  // ─── Render ──────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '12px' }}>

      {/* ════════ TWO-PANEL MESSENGER ════════ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          gap: '12px',
          flex: 1,
          minHeight: 0,
        }}
      >

        {/* ──── LEFT: Accounts & Chat Directory Panel ──── */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* 1. Header Toolbar with Real-Time Pulse Indicator */}
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-text)',
                  }}
                >
                  <MessageSquare style={{ width: 14, height: 14 }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <h2
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        color: 'var(--text-main)',
                        margin: 0,
                        lineHeight: 1.2,
                      }}
                    >
                      Диалоги
                    </h2>
                    {/* Live Sync Pulse */}
                    <span
                      title={isWsConnected ? "Живая WebSocket синхронизация активна" : "Подключение к WebSocket..."}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: isWsConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: isWsConnected ? '#4ade80' : '#f59e0b',
                        border: `1px solid ${isWsConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isWsConnected ? '#22c55e' : '#f59e0b',
                          boxShadow: isWsConnected ? '0 0 6px #22c55e' : 'none',
                        }}
                      />
                      {isWsConnected ? 'LIVE' : 'SYNC'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {chats.length} чатов • {accounts.length} аккаунтов
                  </span>
                </div>
              </div>

              {/* Actions cluster */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => syncMutation.mutate(filterAccountId)}
                  disabled={syncMutation.isPending}
                  title="Принудительно обновить"
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: syncMutation.isPending ? 'var(--accent-text)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: syncMutation.isPending ? 'wait' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <RefreshCw
                    style={{ width: 13, height: 13 }}
                    className={syncMutation.isPending || isRefetchingChats ? 'animate-spin' : ''}
                  />
                </button>
                <button
                  onClick={() => setShowClearModal(true)}
                  title="Очистить кэш"
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>

            {/* 2. Visual Account Switcher with Smooth Horizontal Scroll & Arrows */}
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* Scroll Left Button */}
                <button
                  onClick={() => scrollAccounts('left')}
                  title="Прокрутить влево"
                  style={{
                    width: '22px',
                    height: '28px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <ChevronLeft style={{ width: 13, height: 13 }} />
                </button>

                {/* Horizontal Scroll Area */}
                <div
                  ref={accountsScrollRef}
                  onWheel={(e) => {
                    if (accountsScrollRef.current) {
                      accountsScrollRef.current.scrollLeft += e.deltaY;
                    }
                  }}
                  style={{
                    display: 'flex',
                    gap: '6px',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    paddingBottom: '2px',
                    flex: 1,
                  }}
                >
                  {/* "All accounts" chip */}
                  <button
                    onClick={() => setFilterAccountId(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 10px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      border: `1px solid ${filterAccountId === null ? 'var(--accent)' : 'var(--border-color)'}`,
                      backgroundColor: filterAccountId === null ? 'var(--accent-soft)' : 'var(--bg-main)',
                      color: filterAccountId === null ? 'var(--accent-text)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <Layers style={{ width: 12, height: 12 }} />
                    <span>Все боты</span>
                    <span
                      style={{
                        backgroundColor: filterAccountId === null ? 'var(--accent)' : 'var(--bg-card)',
                        color: filterAccountId === null ? '#fff' : 'var(--text-muted)',
                        padding: '1px 5px',
                        borderRadius: '6px',
                        fontSize: '10px',
                      }}
                    >
                      {chats.length}
                    </span>
                  </button>

                  {/* Each Bot Account Chip */}
                  {accounts.map((acc) => {
                    const isSelected = filterAccountId === acc.id;
                    const [c1, c2] = getAvatarColors(acc.custom_name || acc.first_name || acc.phone, acc.id);
                    const count = accountChatCounts[acc.id] || 0;
                    const label = acc.custom_name || acc.first_name || (acc.username ? `@${acc.username}` : acc.phone);

                    return (
                      <button
                        key={acc.id}
                        onClick={() => setFilterAccountId(isSelected ? null : acc.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-color)'}`,
                          backgroundColor: isSelected ? 'var(--accent-soft)' : 'var(--bg-main)',
                          color: isSelected ? 'var(--accent-text)' : 'var(--text-main)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '5px',
                            background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                            color: '#fff',
                            fontSize: '9px',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {getInitials(label)}
                        </div>
                        <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                        <span
                          style={{
                            backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                            color: isSelected ? '#fff' : 'var(--text-muted)',
                            padding: '1px 4px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            fontWeight: 700,
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Scroll Right Button */}
                <button
                  onClick={() => scrollAccounts('right')}
                  title="Прокрутить вправо"
                  style={{
                    width: '22px',
                    height: '28px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>

            {/* 3. Search Bar */}
            <div style={{ position: 'relative' }}>
              <Search
                style={{
                  width: 13,
                  height: 13,
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Поиск по диалогам и собеседникам..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '6px 10px 6px 30px',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
              />
            </div>
          </div>

          {/* 4. Chat List with Visual Account Grouping */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {isLoadingChats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    style={{
                      height: '56px',
                      backgroundColor: 'var(--bg-main)',
                      borderRadius: '12px',
                      opacity: 0.4 + n * 0.08,
                    }}
                  />
                ))}
              </div>
            ) : filteredChats.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '48px 20px',
                  color: 'var(--text-muted)',
                }}
              >
                <MessageSquare style={{ width: 32, height: 32, opacity: 0.15, marginBottom: '12px' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                  {searchQuery ? 'Ничего не найдено' : 'Нет диалогов'}
                </span>
                <span style={{ fontSize: '11px', lineHeight: 1.5, maxWidth: '200px' }}>
                  {searchQuery
                    ? 'Попробуйте изменить запрос'
                    : 'Новые входящие сообщения автоматически подгружаются в реальном времени'}
                </span>
              </div>
            ) : (
              /* Grouped Account Sections */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {groupedByAccount.map((group) => {
                  const isCollapsed = !!collapsedAccounts[group.accountId];
                  const [ac1, ac2] = getAvatarColors(group.accountLabel, group.accountId);

                  return (
                    <div
                      key={group.accountId}
                      style={{
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Account Section Header */}
                      <div
                        onClick={() => toggleAccountCollapse(group.accountId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          backgroundColor: 'rgba(255,255,255,0.02)',
                          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '6px',
                              background: `linear-gradient(135deg, ${ac1} 0%, ${ac2} 100%)`,
                              color: '#fff',
                              fontSize: '10px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                            }}
                          >
                            {getInitials(group.accountLabel)}
                          </div>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 800,
                              color: 'var(--text-main)',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {group.accountLabel}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            ({group.accountPhone})
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: 'var(--accent-text)',
                              backgroundColor: 'var(--accent-soft)',
                              borderRadius: '6px',
                              padding: '1px 6px',
                            }}
                          >
                            {group.chats.length} {group.chats.length === 1 ? 'чат' : 'чатов'}
                          </span>
                          {isCollapsed ? (
                            <ChevronRight style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />
                          ) : (
                            <ChevronDown style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />
                          )}
                        </div>
                      </div>

                      {/* Chats Inside This Account */}
                      {!isCollapsed && (
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '4px' }}>
                          {group.chats.map((chat) => {
                            const isActive =
                              selectedChat?.account_id === chat.account_id && selectedChat?.peer_id === chat.peer_id;
                            const [c1, c2] = getAvatarColors(chat.peer_name, chat.peer_id);

                            return (
                              <button
                                key={`${chat.account_id}_${chat.peer_id}`}
                                onClick={() => setSelectedChat(chat)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 10px',
                                  borderRadius: '10px',
                                  border: 'none',
                                  width: '100%',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  transition: 'all 0.12s ease',
                                  backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                              >
                                {/* Peer Avatar */}
                                <div
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                                    color: '#fff',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  {getInitials(chat.peer_name)}
                                </div>

                                {/* Chat Info */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                    <span
                                      style={{
                                        fontSize: '13px',
                                        fontWeight: isActive ? 800 : 650,
                                        color: 'var(--text-main)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {chat.peer_name || `ID ${chat.peer_id}`}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        color: 'var(--text-muted)',
                                        flexShrink: 0,
                                        fontVariantNumeric: 'tabular-nums',
                                      }}
                                    >
                                      {formatTime(chat.updated_at)}
                                    </span>
                                  </div>

                                  <p
                                    style={{
                                      fontSize: '11px',
                                      color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                                      margin: 0,
                                      lineHeight: 1.4,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {chat.last_message || 'Нет сообщений'}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ──── RIGHT: Chat Room ──── */}
        {selectedChat ? (
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Chat Header with Explicit Account Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: `linear-gradient(135deg, ${getAvatarColors(selectedChat.peer_name, selectedChat.peer_id)[0]} 0%, ${getAvatarColors(selectedChat.peer_name, selectedChat.peer_id)[1]} 100%)`,
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {getInitials(selectedChat.peer_name)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                      {selectedChat.peer_name || `ID ${selectedChat.peer_id}`}
                    </span>
                    {selectedChat.peer_username && (
                      <span style={{ fontSize: '11px', color: 'var(--accent-text)', fontWeight: 600 }}>
                        @{selectedChat.peer_username}
                      </span>
                    )}
                  </div>

                  {/* High visibility Bot Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: 'var(--accent-soft)',
                        border: '1px solid var(--accent)',
                        color: 'var(--accent-text)',
                        borderRadius: '6px',
                        padding: '1px 7px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Bot style={{ width: 10, height: 10 }} />
                      <span>Диалог от лица: <strong>{selectedChat.account_custom_name || selectedChat.account_name || selectedChat.account_phone}</strong></span>
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => syncMutation.mutate(selectedChat.account_id)}
                  disabled={syncMutation.isPending}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  <RefreshCw style={{ width: 11, height: 11 }} className={syncMutation.isPending ? 'animate-spin' : ''} />
                  <span>Обновить</span>
                </button>

                <button
                  onClick={() => {
                    setClearScope('current');
                    setShowClearModal(true);
                  }}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="Очистить историю"
                >
                  <Trash2 style={{ width: 12, height: 12 }} />
                </button>
              </div>
            </div>

            {/* Messages Stream */}
            <div
              ref={messagesContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                backgroundColor: 'var(--bg-main)',
                position: 'relative',
              }}
            >
              {isLoadingMessages ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <RefreshCw style={{ width: 20, height: 20, color: 'var(--text-muted)' }} className="animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--text-muted)',
                    gap: '8px',
                  }}
                >
                  <Hash style={{ width: 28, height: 28, opacity: 0.2 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Нет сообщений</span>
                  <span style={{ fontSize: '11px', maxWidth: '260px', textAlign: 'center', lineHeight: 1.5 }}>
                    Новые сообщения появятся здесь автоматически в режиме реального времени
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {dateGroups.map((group, gIdx) => (
                    <div key={group.label || `group_${gIdx}`}>
                      {/* Date separator */}
                      {group.label && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0 8px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: 'var(--text-muted)',
                              backgroundColor: 'var(--bg-card)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              padding: '3px 10px',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {group.label}
                          </span>
                        </div>
                      )}

                      {/* Messages in group */}
                      {group.messages.map((msg) => {
                        const out = !msg.incoming;
                        const isHovered = hoveredMsgId === msg.id;
                        const isDownloading = downloadingMsgId === msg.id;
                        const hasMedia = !!msg.media_path || (msg.text && msg.text.includes('📷 Фото/Медиа'));

                        return (
                          <div
                            key={msg.id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: out ? 'flex-end' : 'flex-start',
                              marginBottom: '2px',
                              position: 'relative',
                            }}
                            onMouseEnter={() => setHoveredMsgId(msg.id)}
                            onMouseLeave={() => setHoveredMsgId(null)}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', maxWidth: '75%' }}>
                              {/* Action buttons for incoming - shown on left */}
                              {!out && isHovered && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    opacity: 0.7,
                                    transition: 'opacity 0.15s',
                                    paddingBottom: '4px',
                                  }}
                                >
                                  <MsgAction icon={Reply} title="Ответить" onClick={() => setReplyingTo(msg)} />
                                  <MsgAction
                                    icon={Copy}
                                    title="Копировать"
                                    onClick={() => {
                                      navigator.clipboard.writeText(msg.text || '');
                                      showToast('Скопировано', 'info');
                                    }}
                                  />
                                  <MsgAction icon={Trash2} title="Удалить" onClick={() => deleteMutation.mutate(msg)} />
                                </div>
                              )}

                              {/* Bubble */}
                              <div
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: out ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                  backgroundColor: out ? 'var(--accent)' : 'var(--bg-card)',
                                  color: out ? '#fff' : 'var(--text-main)',
                                  border: out ? 'none' : '1px solid var(--border-color)',
                                  boxShadow: out
                                    ? '0 1px 4px rgba(0,0,0,0.15)'
                                    : '0 1px 3px rgba(0,0,0,0.06)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px',
                                  wordBreak: 'break-word',
                                  maxWidth: '100%',
                                }}
                              >
                                {/* Media preview if downloaded image */}
                                {msg.media_path && isImageFile(msg.media_path) && (
                                  <div style={{ borderRadius: '8px', overflow: 'hidden', marginBottom: '4px', maxWidth: '320px' }}>
                                    <img
                                      src={withMediaToken(msg.media_path)}
                                      alt="Telegram media"
                                      style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', display: 'block' }}
                                    />
                                  </div>
                                )}

                                {/* Text */}
                                <span style={{ fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                  {msg.text}
                                </span>

                                {/* On-Demand Media Download Button */}
                                {hasMedia && !msg.media_path && (
                                  <button
                                    onClick={() => downloadMediaMutation.mutate(msg.id)}
                                    disabled={isDownloading}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '5px 10px',
                                      borderRadius: '8px',
                                      backgroundColor: out ? 'rgba(255,255,255,0.15)' : 'var(--accent-soft)',
                                      border: `1px solid ${out ? 'rgba(255,255,255,0.3)' : 'var(--accent)'}`,
                                      color: out ? '#fff' : 'var(--accent-text)',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: isDownloading ? 'wait' : 'pointer',
                                      marginTop: '2px',
                                      width: 'fit-content',
                                    }}
                                  >
                                    {isDownloading ? (
                                      <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                    ) : (
                                      <Download style={{ width: 12, height: 12 }} />
                                    )}
                                    <span>{isDownloading ? 'Загрузка...' : 'Загрузить медиафайл'}</span>
                                  </button>
                                )}

                                {/* Downloaded non-image media link */}
                                {msg.media_path && !isImageFile(msg.media_path) && (
                                  <a
                                    href={withMediaToken(msg.media_path)}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      color: out ? 'rgba(255,255,255,0.9)' : 'var(--accent-text)',
                                      textDecoration: 'none',
                                      marginTop: '2px',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      backgroundColor: out ? 'rgba(255,255,255,0.12)' : 'var(--bg-main)',
                                      border: '1px solid var(--border-color)',
                                    }}
                                  >
                                    <FileText style={{ width: 12, height: 12 }} />
                                    <span>Скачать документ</span>
                                  </a>
                                )}

                                {/* Bottom Time and Double Check */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    gap: '3px',
                                    fontSize: '10px',
                                    color: out ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)',
                                    fontVariantNumeric: 'tabular-nums',
                                    marginTop: '1px',
                                  }}
                                >
                                  <span>{formatMsgTime(msg.created_at)}</span>
                                  {out && <CheckCheck style={{ width: 12, height: 12 }} />}
                                </div>
                              </div>

                              {/* Action buttons for outgoing - shown on right */}
                              {out && isHovered && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    opacity: 0.7,
                                    transition: 'opacity 0.15s',
                                    paddingBottom: '4px',
                                  }}
                                >
                                  <MsgAction
                                    icon={Edit2}
                                    title="Редактировать"
                                    onClick={() => {
                                      setEditingMessage(msg);
                                      setEditText(msg.text || '');
                                    }}
                                  />
                                  <MsgAction icon={Reply} title="Ответить" onClick={() => setReplyingTo(msg)} />
                                  <MsgAction
                                    icon={Copy}
                                    title="Копировать"
                                    onClick={() => {
                                      navigator.clipboard.writeText(msg.text || '');
                                      showToast('Скопировано', 'info');
                                    }}
                                  />
                                  <MsgAction icon={Trash2} title="Удалить" onClick={() => deleteMutation.mutate(msg)} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Scroll-to-bottom FAB */}
              {showScrollDown && (
                <button
                  onClick={scrollToBottom}
                  style={{
                    position: 'sticky',
                    bottom: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    zIndex: 5,
                  }}
                >
                  <ArrowDown style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            {/* Reply banner */}
            {replyingTo && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                  padding: '6px 16px',
                  backgroundColor: 'var(--accent-soft)',
                  borderTop: '2px solid var(--accent)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                  <Reply style={{ width: 13, height: 13, color: 'var(--accent-text)', flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-text)', flexShrink: 0 }}>
                    {replyingTo.incoming ? (replyingTo.peer_name || 'Собеседник') : 'Вы'}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {replyingTo.text}
                  </span>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            )}

            {/* Attachment preview */}
            {attachedFile && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                  padding: '5px 16px',
                  borderTop: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ImageIcon style={{ width: 13, height: 13, color: 'var(--accent-text)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {attachedFile.name}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {Math.round(attachedFile.size / 1024)} KB
                  </span>
                </div>
                <button
                  onClick={() => setAttachedFile(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            )}

            {/* Input bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                flexShrink: 0,
                padding: '10px 16px',
                borderTop: '1px solid var(--border-color)',
                gap: '8px',
              }}
            >
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: attachedFile ? 'var(--accent-soft)' : 'var(--bg-main)',
                  color: attachedFile ? 'var(--accent-text)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.12s',
                }}
                title="Прикрепить файл или фото"
              >
                <Paperclip style={{ width: 15, height: 15 }} />
                <input
                  type="file"
                  ref={mediaInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) setAttachedFile(e.target.files[0]);
                  }}
                />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={handleTextareaInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim() || attachedFile) sendMutation.mutate();
                  }
                }}
                placeholder="Сообщение..."
                style={{
                  flex: 1,
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  resize: 'none',
                  minHeight: '36px',
                  maxHeight: '140px',
                  lineHeight: 1.5,
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
              />

              <button
                onClick={() => sendMutation.mutate()}
                disabled={(!text.trim() && !attachedFile) || sendMutation.isPending}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor:
                    (!text.trim() && !attachedFile) || sendMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: (!text.trim() && !attachedFile) || sendMutation.isPending ? 0.4 : 1,
                  flexShrink: 0,
                  transition: 'opacity 0.15s, transform 0.1s',
                }}
              >
                <Send style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>
        ) : (
          /* ──── Empty state (no chat selected) ──── */
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '20px',
              color: 'var(--text-muted)',
              gap: '10px',
              padding: '60px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '4px',
              }}
            >
              <MessageSquare style={{ width: 22, height: 22, opacity: 0.25 }} />
            </div>
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Выберите диалог
            </span>
            <span style={{ fontSize: '12px', maxWidth: '300px', textAlign: 'center', lineHeight: 1.6 }}>
              В левой панели находятся все переписки ваших аккаунтов. Выберите чат, чтобы просмотреть и ответить.
            </span>
          </div>
        )}
      </div>

      {/* ════════ MODAL: Edit Message ════════ */}
      {editingMessage && (
        <ModalOverlay onClose={() => setEditingMessage(null)}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px' }}>
              Редактирование сообщения
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Текст будет обновлён у всех участников диалога в Telegram
            </p>
          </div>

          <textarea
            rows={4}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '13px',
              color: 'var(--text-main)',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
          />

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setEditingMessage(null)}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => editMutation.mutate()}
              disabled={!editText.trim() || editMutation.isPending}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: '10px',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                cursor: !editText.trim() || editMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: !editText.trim() || editMutation.isPending ? 0.5 : 1,
                transition: 'opacity 0.12s',
              }}
            >
              {editMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ════════ MODAL: Clear Sync ════════ */}
      {showClearModal && (
        <ModalOverlay onClose={() => setShowClearModal(false)}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px' }}>
              Очистка кэша синхронизации
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Удалит локально сохранённые сообщения из базы TgActor. В Telegram ничего не изменится.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {selectedChat && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: clearScope === 'current' ? 'var(--accent-soft)' : 'var(--bg-main)',
                  border: `1px solid ${clearScope === 'current' ? 'var(--accent)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.12s',
                }}
              >
                <input
                  type="radio"
                  name="clear_scope"
                  checked={clearScope === 'current'}
                  onChange={() => setClearScope('current')}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ color: 'var(--text-main)' }}>
                  Только текущий аккаунт ({selectedChat.account_phone})
                </span>
              </label>
            )}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: clearScope === 'all' ? 'var(--accent-soft)' : 'var(--bg-main)',
                border: `1px solid ${clearScope === 'all' ? 'var(--accent)' : 'var(--border-color)'}`,
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 0.12s',
              }}
            >
              <input
                type="radio"
                name="clear_scope"
                checked={clearScope === 'all'}
                onChange={() => setClearScope('all')}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ color: 'var(--text-main)' }}>Все аккаунты сразу</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowClearModal(false)}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => clearSyncMutation.mutate(clearScope)}
              disabled={clearSyncMutation.isPending}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: '10px',
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                cursor: clearSyncMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: clearSyncMutation.isPending ? 0.5 : 1,
              }}
            >
              {clearSyncMutation.isPending ? 'Очищаем...' : 'Очистить'}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function MsgAction({
  icon: Icon,
  title,
  onClick,
}: {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '22px',
        height: '22px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: 'transparent',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.1s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-card)';
        e.currentTarget.style.color = 'var(--text-main)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      <Icon style={{ width: 11, height: 11 }} />
    </button>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '20px',
          padding: '24px',
          width: '440px',
          maxWidth: '92vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
