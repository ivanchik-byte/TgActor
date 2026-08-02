import { useState, useMemo, useEffect, useRef } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export default function Inbox() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [selectedChat, setSelectedChat] = useState<{account_id: number, peer_id: number, sender_username: string} | null>(null);
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
      await axios.post('/api/inbox/send', {
        account_id: selectedChat.account_id,
        peer_id: selectedChat.peer_id,
        text
      });
    },
    onSuccess: () => {
      setText('');
      queryClient.invalidateQueries({ queryKey: ['inboxMessages'] });
    }
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Group chats by account_id
  const groupedChats = useMemo(() => {
    const groups: Record<number, typeof chats> = {};
    for (const chat of chats) {
      if (!groups[chat.account_id]) groups[chat.account_id] = [];
      groups[chat.account_id].push(chat);
    }
    return groups;
  }, [chats]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)' }}>
          Инбокс — все ЛС со всех аккаунтов
        </h2>
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
      <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '16px' }}>
        Старые диалоги из tdata-аккаунтов не подтягиваются — только сообщения, пришедшие после первого обнаружения собеседника.
      </p>

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
                    acc #{accountId}
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
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-main)',
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
                    от acc #{selectedChat.account_id} · tg id {selectedChat.peer_id}
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
                      <div>{msg.text}</div>
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
                <button
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
                  onKeyDown={e => e.key === 'Enter' && text.trim() && sendMessage.mutate()}
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
                  disabled={sendMessage.isPending || !text.trim()}
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
                    opacity: sendMessage.isPending || !text.trim() ? 0.5 : 1,
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
