import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Paperclip, Send, Search, RefreshCw, User, X, MessageSquare, Download, FileText, CheckCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useToast } from '../components/ToastContext';

interface DownloadMediaButtonProps {
  messageId: number;
  mediaType: string;
  isIncoming: boolean;
}

function DownloadMediaButton({ messageId, mediaType, isIncoming }: DownloadMediaButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await axios.post(`/api/inbox/download-media/${messageId}`);
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: isIncoming ? 'var(--bg-main, #0f0d1a)' : 'rgba(255, 255, 255, 0.15)',
        color: isIncoming ? 'var(--text-main, #f8fafc)' : '#ffffff',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
        padding: '6px 12px',
        borderRadius: '8px',
        fontSize: '0.8rem',
        fontWeight: 600,
        cursor: downloading ? 'wait' : 'pointer',
        opacity: downloading ? 0.7 : 1,
        transition: 'all 0.15s ease'
      }}
    >
      <Download size={14} className={downloading ? 'spin' : ''} />
      <span>{downloading ? 'Загрузка...' : `Скачать ${mediaType}`}</span>
      {error && <span style={{ color: '#f87171', marginLeft: '4px' }}>({error})</span>}
    </button>
  );
}

const EMPTY_ARRAY: any[] = [];

export default function Inbox() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [text, setText] = useState("");
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);

  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Query: Fetch chats list
  const { data: chats = EMPTY_ARRAY, refetch, isRefetching } = useQuery({
    queryKey: ['inboxChats'],
    queryFn: async () => (await axios.get('/api/inbox/chats')).data,
    refetchInterval: 5000
  });

  // Query: Fetch messages for selected chat
  const { data: messages = EMPTY_ARRAY, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['inboxMessages', selectedChat?.account_id, selectedChat?.peer_id],
    queryFn: async () => {
      if (!selectedChat) return [];
      return (await axios.get(`/api/inbox/messages/${selectedChat.account_id}/${selectedChat.peer_id}`)).data;
    },
    enabled: !!selectedChat,
    refetchInterval: 3000
  });

  // Mutation: Send message
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!selectedChat) return;

      const formData = new FormData();
      formData.append('account_id', selectedChat.account_id.toString());
      formData.append('peer_id', selectedChat.peer_id.toString());
      formData.append('text', text);
      if (attachedFile) {
        formData.append('file', attachedFile);
      }

      await axios.post('/api/inbox/send', formData);
    },
    onSuccess: () => {
      setText('');
      setAttachedFile(null);
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось отправить сообщение!', 'error');
    }
  });

  // Scroll to bottom on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Support pre-selecting inbox account from dashboard
  useEffect(() => {
    const preselectedAccountIdStr = localStorage.getItem('selected_inbox_account_id');
    if (preselectedAccountIdStr && chats.length > 0) {
      const preselectedId = Number(preselectedAccountIdStr);
      const firstChat = chats.find((c: any) => c.account_id === preselectedId);
      if (firstChat) {
        setSelectedChat(firstChat);
      }
      localStorage.removeItem('selected_inbox_account_id');
    }
  }, [chats]);

  // Drag and Drop event handlers
  const handleMediaDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMediaDragLeave = () => {
    setIsDragging(false);
  };

  const handleMediaDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setAttachedFile(e.dataTransfer.files[0]);
    }
  };

  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFile(e.target.files[0]);
    }
  };

  // Clipboard paste listener
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (!selectedChat) return;
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        setAttachedFile(files[0]);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [selectedChat]);

  // Extract unique accounts from active chats
  const accountsList = useMemo(() => {
    const map = new Map<number, { id: number, name: string }>();
    for (const chat of chats) {
      if (!map.has(chat.account_id)) {
        const displayName = chat.account_custom_name
          ? chat.account_custom_name
          : (chat.account_username 
            ? `@${chat.account_username}` 
            : (chat.account_name || chat.account_phone || `Аккаунт #${chat.account_id}`));
        map.set(chat.account_id, {
          id: chat.account_id,
          name: displayName
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [chats]);

  // Filtered chats by account and search query
  const filteredChats = useMemo(() => {
    return chats.filter((chat: any) => {
      if (filterAccountId !== null && chat.account_id !== filterAccountId) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = (chat.sender_username || '').toLowerCase().includes(query);
        const peerMatch = String(chat.peer_id).includes(query);
        const accMatch = (chat.account_username || chat.account_name || chat.account_phone || '').toLowerCase().includes(query);
        const lastMsgMatch = (chat.last_message || '').toLowerCase().includes(query);
        return nameMatch || peerMatch || accMatch || lastMsgMatch;
      }
      return true;
    });
  }, [chats, filterAccountId, searchQuery]);

  // Group filtered chats by account_id
  const groupedChats = useMemo(() => {
    const groups: Record<number, typeof chats> = {};
    for (const chat of filteredChats) {
      if (!groups[chat.account_id]) groups[chat.account_id] = [];
      groups[chat.account_id].push(chat);
    }
    return groups;
  }, [filteredChats]);

  // Render clickable links in messages
  const renderMessageText = (text: string, isIncoming: boolean) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: isIncoming ? 'var(--accent-text, #a78bfa)' : '#ffffff',
              textDecoration: 'underline',
              fontWeight: 500,
              wordBreak: 'break-all'
            }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  // Generate deterministic avatar gradient from string
  const getAvatarGradient = (str: string) => {
    const gradients = [
      'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      'linear-gradient(135deg, #ec4899 0%, #d946ef 100%)',
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return gradients[Math.abs(hash) % gradients.length];
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px', height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={26} style={{ color: 'var(--accent-color, #6366f1)' }} />
            Инбокс диалогов
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem' }}>
            Сквозное управление сообщениями со всех подключенных аккаунтов в режиме реального времени
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
            background: 'var(--bg-card, #1e293b)',
            color: 'var(--text-main, #f8fafc)',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <RefreshCw size={15} className={isRefetching ? 'spin' : ''} />
          Обновить диалоги
        </button>
      </div>

      {/* Main Inbox Card Container */}
      <div style={{
        flex: 1,
        display: 'flex',
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
      }}>
        
        {/* Left Sidebar — Chat List */}
        <div style={{
          width: '340px',
          borderRight: '1px solid var(--border-color, rgba(255,255,255,0.1))',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(0,0,0,0.15)',
          flexShrink: 0
        }}>
          
          {/* Search Box */}
          <div style={{ padding: '14px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary, #94a3b8)' }} />
              <input
                type="text"
                placeholder="Поиск диалогов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                  background: 'var(--bg-main, #0f0d1a)',
                  color: 'var(--text-main, #f8fafc)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Account Filter Pills */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            alignItems: 'center'
          }}>
            <button
              onClick={() => setFilterAccountId(null)}
              style={{
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: filterAccountId === null ? 'var(--accent-color, #6366f1)' : 'rgba(255,255,255,0.05)',
                color: filterAccountId === null ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                transition: 'all 0.15s ease'
              }}
            >
              Все ({chats.length})
            </button>
            {accountsList.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setFilterAccountId(acc.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: filterAccountId === acc.id ? 'var(--accent-color, #6366f1)' : 'rgba(255,255,255,0.05)',
                  color: filterAccountId === acc.id ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                  transition: 'all 0.15s ease'
                }}
              >
                {acc.name}
              </button>
            ))}
          </div>

          {/* Grouped Chat List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {Object.keys(groupedChats).length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem' }}>
                Диалоги не найдены.
              </div>
            ) : (
              Object.entries(groupedChats).map(([accountId, accountChats]) => (
                <div key={accountId}>
                  
                  {/* Account Header Section */}
                  <div style={{
                    padding: '8px 14px',
                    background: 'rgba(0,0,0,0.25)',
                    borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.05))',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    position: 'sticky',
                    top: 0,
                    zIndex: 5
                  }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-text, #818cf8)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={13} />
                      {accountChats[0]?.account_custom_name
                        ? accountChats[0].account_custom_name
                        : (accountChats[0]?.account_username 
                          ? `@${accountChats[0].account_username}` 
                          : (accountChats[0]?.account_name || accountChats[0]?.account_phone || `Аккаунт #${accountId}`))}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>
                      {accountChats.length}
                    </span>
                  </div>

                  {/* Chat Cards */}
                  {accountChats.map((chat: any) => {
                    const isSelected = selectedChat?.peer_id === chat.peer_id && selectedChat?.account_id === chat.account_id;
                    const peerDisplayName = chat.sender_username ? `@${chat.sender_username}` : `ID ${chat.peer_id}`;

                    return (
                      <div
                        key={`${chat.account_id}_${chat.peer_id}`}
                        onClick={() => setSelectedChat(chat)}
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                          borderLeft: isSelected ? '3px solid var(--accent-color, #6366f1)' : '3px solid transparent',
                          borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.04))',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: getAvatarGradient(peerDisplayName),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                        }}>
                          {(chat.sender_username || String(chat.peer_id))[0]?.toUpperCase() || 'U'}
                        </div>

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                            <span style={{
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              color: isSelected ? 'var(--accent-text, #818cf8)' : 'var(--text-main, #f8fafc)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {peerDisplayName}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a3b8)', flexShrink: 0, marginLeft: '6px' }}>
                              {formatTime(chat.updated_at)}
                            </span>
                          </div>

                          <div style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary, #94a3b8)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {chat.last_message || '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Area — Active Conversation */}
        <div
          onDragOver={handleMediaDragOver}
          onDragLeave={handleMediaDragLeave}
          onDrop={handleMediaDrop}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-main, #0f0d1a)',
            position: 'relative'
          }}
        >
          {/* File Drag & Drop Overlay Indicator */}
          {isDragging && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(99, 102, 241, 0.15)',
              backdropFilter: 'blur(4px)',
              border: '2px dashed var(--accent-color, #6366f1)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text, #818cf8)',
              fontWeight: 700,
              fontSize: '1.1rem',
              gap: '12px'
            }}>
              <Paperclip size={28} />
              <span>Перетащите файл для прикрепления к сообщению</span>
            </div>
          )}

          {selectedChat ? (
            <>
              {/* Chat Thread Header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                background: 'var(--bg-card, #1e293b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: getAvatarGradient(selectedChat.sender_username || String(selectedChat.peer_id)),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '1rem'
                  }}>
                    {(selectedChat.sender_username || String(selectedChat.peer_id))[0]?.toUpperCase() || 'U'}
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main, #f8fafc)' }}>
                      {selectedChat.sender_username ? `@${selectedChat.sender_username}` : `Telegram ID: ${selectedChat.peer_id}`}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px' }}>
                      От имени: <span style={{ color: 'var(--accent-text, #818cf8)', fontWeight: 600 }}>
                        {selectedChat.account_custom_name
                          ? selectedChat.account_custom_name
                          : (selectedChat.account_username 
                            ? `@${selectedChat.account_username}` 
                            : (selectedChat.account_name || selectedChat.account_phone || `Аккаунт #${selectedChat.account_id}`))}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(34, 197, 94, 0.12)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.2)', fontWeight: 600 }}>
                  Активный тред
                </div>
              </div>

              {/* Messages Flow Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem' }}>
                    {isLoadingMessages ? 'Загрузка сообщений...' : 'История сообщений пуста.'}
                  </div>
                ) : (
                  messages.map((msg: any) => (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: msg.is_incoming ? 'flex-start' : 'flex-end',
                        marginBottom: '2px'
                      }}
                    >
                      <div style={{
                        maxWidth: '68%',
                        padding: '12px 16px',
                        borderRadius: msg.is_incoming ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                        background: msg.is_incoming ? 'var(--bg-card, #1e293b)' : 'var(--accent-color, #6366f1)',
                        color: msg.is_incoming ? 'var(--text-main, #f8fafc)' : '#ffffff',
                        border: msg.is_incoming ? '1px solid var(--border-color, rgba(255,255,255,0.08))' : 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        fontSize: '0.9rem',
                        lineHeight: 1.5
                      }}>

                        {/* Text Content */}
                        {msg.text && (
                          <div style={{ wordBreak: 'break-word' }}>
                            {renderMessageText(msg.text, msg.is_incoming)}
                          </div>
                        )}

                        {/* Media Renderings */}
                        {msg.media_type && (
                          <div style={{ marginTop: msg.text ? '10px' : 0 }}>
                            {msg.media_path ? (
                              <>
                                {(msg.media_type === 'photo' || msg.media_type === 'sticker' || msg.media_type === 'animation') && (
                                  <div style={{ maxWidth: '320px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <img src={msg.media_path} alt={msg.media_type} style={{ width: '100%', height: 'auto', display: 'block' }} />
                                  </div>
                                )}

                                {msg.media_type === 'video' && (
                                  <div style={{ maxWidth: '320px', borderRadius: '10px', overflow: 'hidden' }}>
                                    <video src={msg.media_path} controls style={{ width: '100%', height: 'auto', display: 'block' }} />
                                  </div>
                                )}

                                {(msg.media_type === 'voice' || msg.media_type === 'audio') && (
                                  <div style={{ maxWidth: '280px' }}>
                                    <audio src={msg.media_path} controls style={{ width: '100%' }} />
                                  </div>
                                )}

                                {msg.media_type === 'document' && (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: msg.is_incoming ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)',
                                    marginTop: '4px'
                                  }}>
                                    <FileText size={18} />
                                    <a
                                      href={msg.media_path}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        fontSize: '0.8rem',
                                        color: msg.is_incoming ? 'var(--accent-text, #818cf8)' : '#ffffff',
                                        textDecoration: 'underline',
                                        fontWeight: 600,
                                        wordBreak: 'break-all'
                                      }}
                                    >
                                      Открыть документ
                                    </a>
                                  </div>
                                )}
                              </>
                            ) : (
                              <DownloadMediaButton messageId={msg.id} mediaType={msg.media_type} isIncoming={msg.is_incoming} />
                            )}
                          </div>
                        )}

                        {/* Message Time & Status */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '4px',
                          marginTop: '6px',
                          fontSize: '0.7rem',
                          color: msg.is_incoming ? 'var(--text-secondary, #94a3b8)' : 'rgba(255,255,255,0.7)'
                        }}>
                          <span>{formatTime(msg.created_at || msg.received_at)}</span>
                          {!msg.is_incoming && <CheckCheck size={13} />}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Attachment Preview Box */}
              {attachedFile && (
                <div style={{
                  padding: '10px 16px',
                  background: 'var(--bg-card, #1e293b)',
                  borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-main, #f8fafc)' }}>
                    <Paperclip size={16} style={{ color: 'var(--accent-color, #6366f1)' }} />
                    <span>Файл: <strong>{attachedFile.name}</strong> ({(attachedFile.size / 1024 / 1024).toFixed(2)} МБ)</span>
                  </div>
                  <button
                    onClick={() => setAttachedFile(null)}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Message Input Controls */}
              <div style={{
                padding: '16px 20px',
                background: 'var(--bg-card, #1e293b)',
                borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <input
                  type="file"
                  ref={mediaFileInputRef}
                  onChange={handleMediaFileChange}
                  style={{ display: 'none' }}
                />

                <button
                  onClick={() => mediaFileInputRef.current?.click()}
                  title="Прикрепить файл"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    borderRadius: '10px',
                    padding: '10px',
                    color: 'var(--text-secondary, #94a3b8)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Paperclip size={18} />
                </button>

                <input
                  type="text"
                  placeholder={`Сообщение от лица аккаунта #${selectedChat.account_id}...`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (text.trim() || attachedFile) && sendMessage.mutate()}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    background: 'var(--bg-main, #0f0d1a)',
                    color: 'var(--text-main, #f8fafc)',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />

                <button
                  onClick={() => sendMessage.mutate()}
                  disabled={sendMessage.isPending || (!text.trim() && !attachedFile)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--accent-color, #6366f1)',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    cursor: sendMessage.isPending || (!text.trim() && !attachedFile) ? 'not-allowed' : 'pointer',
                    opacity: sendMessage.isPending || (!text.trim() && !attachedFile) ? 0.5 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Send size={16} />
                  <span>{sendMessage.isPending ? 'Отправка...' : 'Отправить'}</span>
                </button>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary, #94a3b8)',
              gap: '12px'
            }}>
              <MessageSquare size={48} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>Выберите диалог в списке слева для начала общения</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
