import { useState, useMemo, useEffect, useRef } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

function DownloadMediaButton({ messageId, mediaType, isIncoming }: { messageId: number, mediaType: string, isIncoming: boolean }) {
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
      setError(err.response?.data?.detail || "Ошибка");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: isIncoming ? 'var(--bg-main)' : 'rgba(255, 255, 255, 0.2)',
        color: isIncoming ? 'var(--text-main)' : '#fff',
        border: '1px solid var(--border-color)',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        cursor: 'pointer',
        fontWeight: 600,
        opacity: downloading ? 0.7 : 1,
        transition: 'all 0.15s'
      }}
    >
      <Paperclip style={{ width: '14px', height: '14px' }} />
      {downloading ? 'Загрузка...' : `Скачать ${mediaType}`}
      {error && <span style={{ color: '#ef4444', marginLeft: '6px' }}>({error})</span>}
    </button>
  );
}

export default function Inbox() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: chats = [], refetch } = useQuery({
    queryKey: ['inboxChats'],
    queryFn: async () => (await axios.get('/api/inbox/chats')).data,
    refetchInterval: 5000
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['inboxMessages', selectedChat?.account_id, selectedChat?.peer_id],
    queryFn: async () => {
      if (!selectedChat) return [];
      return (await axios.get(`/api/inbox/messages/${selectedChat.account_id}/${selectedChat.peer_id}`)).data;
    },
    enabled: !!selectedChat,
    refetchInterval: 3000
  });

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
    }
  });

  // Scroll to bottom on new messages
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

  const handlePaperclipClick = () => {
    mediaFileInputRef.current?.click();
  };

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

  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);

  // Extract unique account info from active chats
  const accountsList = useMemo(() => {
    const map = new Map<number, { id: number, name: string }>();
    for (const chat of chats) {
      if (!map.has(chat.account_id)) {
        const displayName = chat.account_username 
          ? `@${chat.account_username}` 
          : (chat.account_name || chat.account_phone || `acc #${chat.account_id}`);
        map.set(chat.account_id, {
          id: chat.account_id,
          name: displayName
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [chats]);

  // Group chats by account_id
  const groupedChats = useMemo(() => {
    const groups: Record<number, typeof chats> = {};
    for (const chat of chats) {
      if (filterAccountId !== null && chat.account_id !== filterAccountId) continue;
      if (!groups[chat.account_id]) groups[chat.account_id] = [];
      groups[chat.account_id].push(chat);
    }
    return groups;
  }, [chats, filterAccountId]);

  // Helper to parse links and render as clickable components
  const renderMessageText = (text: string, isIncoming: boolean) => {
    if (!text) return '';
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
              color: isIncoming ? 'var(--accent)' : '#fff',
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

  // Generate avatar color from string
  const avatarColor = (str: string) => {
    const colors = ['#b91c3d', '#8b5cf6', '#0891b2', '#059669', '#d97706', '#7c3aed', '#dc2626', '#2563eb'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const btnSecondary: React.CSSProperties = {
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-muted)',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '85vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)' }}>
            Централизованный инбокс диалогов
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Лента прямых сообщений собирается автоматически с момента первой активности. История переписок с tdata-аккаунтов синхронизируется в реальном времени при получении новых уведомлений.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={btnSecondary}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--text-main)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--border-color)';
          }}
        >
          Обновить сейчас
        </button>
      </div>

      {/* Chat Layout */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            width: '300px',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          {/* Account Filter Pills */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              backgroundColor: 'var(--bg-surface)'
            }}
          >
            <button
              onClick={() => setFilterAccountId(null)}
              style={{
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '11px',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                cursor: 'pointer',
                backgroundColor: filterAccountId === null ? 'var(--accent)' : 'var(--bg-card)',
                color: filterAccountId === null ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s'
              }}
            >
              Все
            </button>
            {accountsList.map(acc => (
              <button
                key={acc.id}
                onClick={() => setFilterAccountId(acc.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  backgroundColor: filterAccountId === acc.id ? 'var(--accent)' : 'var(--bg-card)',
                  color: filterAccountId === acc.id ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s'
                }}
              >
                {acc.name}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {Object.keys(groupedChats).length === 0 && (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Нет диалогов
              </div>
            )}

            {Object.entries(groupedChats).map(([accountId, accountChats]) => (
              <div key={accountId}>
                {/* Account header */}
                <div
                  style={{
                    padding: '8px 14px',
                    backgroundColor: 'var(--bg-surface)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    position: 'sticky',
                    top: 0,
                    zIndex: 5,
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-text)' }}>
                    {accountChats[0]?.account_username 
                      ? `@${accountChats[0].account_username}` 
                      : (accountChats[0]?.account_name || accountChats[0]?.account_phone || `acc #${accountId}`)}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {accountChats.length} диалог(а)
                  </span>
                </div>

                {/* Chat items */}
                {accountChats.map((chat: any) => {
                  const isSelected = selectedChat?.peer_id === chat.peer_id && selectedChat?.account_id === chat.account_id;
                  const name = chat.sender_username || String(chat.peer_id);
                  return (
                    <div
                      key={chat.peer_id}
                      onClick={() => setSelectedChat(chat)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'background-color 0.1s',
                        backgroundColor: isSelected ? 'var(--accent-soft)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                        borderBottom: '1px solid var(--border-color)',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: avatarColor(name),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '14px',
                          flexShrink: 0,
                        }}
                      >
                        {name[0]?.toUpperCase() || 'U'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                          <div style={{
                            fontWeight: 500,
                            fontSize: '14px',
                            color: 'var(--text-main)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>
                            {new Date(chat.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {chat.last_message || '—'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Chat Panel */}
        <div
          onDragOver={handleMediaDragOver}
          onDragLeave={handleMediaDragLeave}
          onDrop={handleMediaDrop}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-main)',
            border: isDragging ? '2px dashed var(--accent)' : 'none',
            boxSizing: 'border-box'
          }}
        >
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    backgroundColor: avatarColor(selectedChat.sender_username || String(selectedChat.peer_id)),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '16px',
                  }}
                >
                  {(selectedChat.sender_username || String(selectedChat.peer_id))[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>
                    {selectedChat.sender_username || selectedChat.peer_id}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    от {selectedChat.account_username 
                      ? `@${selectedChat.account_username}` 
                      : (selectedChat.account_name || selectedChat.account_phone || `acc #${selectedChat.account_id}`)} · tg id {selectedChat.peer_id}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.map((msg: any) => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.is_incoming ? 'flex-start' : 'flex-end' }}>
                    <div
                      style={{
                        maxWidth: '70%',
                        padding: '10px 14px',
                        fontSize: '14px',
                        lineHeight: 1.5,
                        borderRadius: msg.is_incoming ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                        backgroundColor: msg.is_incoming ? 'var(--bg-card)' : 'var(--accent)',
                        color: msg.is_incoming ? 'var(--text-main)' : '#fff',
                        border: msg.is_incoming ? '1px solid var(--border-color)' : 'none',
                      }}
                    >
                      {/* Message Text with clickable links */}
                      <div>{renderMessageText(msg.text, msg.is_incoming)}</div>
                      
                      {/* Media Files Rendering */}
                      {msg.media_type && (
                        <div style={{ marginTop: '8px' }}>
                          {msg.media_path ? (
                            <>
                              {(msg.media_type === 'photo' || msg.media_type === 'sticker' || msg.media_type === 'animation') && (
                                <div style={{ maxWidth: '300px', borderRadius: '8px', overflow: 'hidden' }}>
                                  <img src={msg.media_path} alt={msg.media_type} style={{ width: '100%', height: 'auto', display: 'block' }} />
                                </div>
                              )}
                              {msg.media_type === 'video' && (
                                <div style={{ maxWidth: '300px', borderRadius: '8px', overflow: 'hidden' }}>
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
                                  gap: '8px',
                                  backgroundColor: msg.is_incoming ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.15)',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  marginTop: '4px'
                                }}>
                                  <Paperclip style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                                  <a
                                    href={msg.media_path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: '12px',
                                      color: msg.is_incoming ? 'var(--accent)' : '#fff',
                                      textDecoration: 'underline',
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

                      {/* Timestamp */}
                      <div style={{
                        fontSize: '10px',
                        marginTop: '6px',
                        textAlign: 'right',
                        color: msg.is_incoming ? 'var(--text-muted)' : 'rgba(255,255,255,0.7)',
                      }}>
                        {new Date(msg.received_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Attached file preview */}
              {attachedFile && (
                <div style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--bg-card)',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-main)' }}>
                    <Paperclip style={{ width: '14px', height: '14px', color: 'var(--accent)' }} />
                    <span>Прикреплен файл: <strong>{attachedFile.name}</strong> ({(attachedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                  <button
                    onClick={() => setAttachedFile(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    Удалить
                  </button>
                </div>
              )}

              {/* Input */}
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-card)',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <input 
                  type="file"
                  ref={mediaFileInputRef}
                  onChange={handleMediaFileChange}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={handlePaperclipClick}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '6px',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-main)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (text.trim() || attachedFile) && sendMessage.mutate()}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  placeholder={`Ответить от acc #${selectedChat.account_id}...`}
                />
                <button
                  onClick={() => sendMessage.mutate()}
                  disabled={sendMessage.isPending || (!text.trim() && !attachedFile)}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#fff',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    opacity: sendMessage.isPending || (!text.trim() && !attachedFile) ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
                >
                  <Send className="w-4 h-4" />
                  {sendMessage.isPending ? '...' : 'Отправить'}
                </button>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}>
              Выберите диалог слева
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
