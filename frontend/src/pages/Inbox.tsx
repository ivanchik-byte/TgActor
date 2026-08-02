import { useState, useMemo } from 'react';
import { Paperclip } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export default function Inbox() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [selectedChat, setSelectedChat] = useState<{account_id: int, peer_id: int, sender_username: string} | null>(null);

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

  // Group chats by account_id
  const groupedChats = useMemo(() => {
    const groups: Record<number, typeof chats> = {};
    for (const chat of chats) {
      if (!groups[chat.account_id]) groups[chat.account_id] = [];
      groups[chat.account_id].push(chat);
    }
    return groups;
  }, [chats]);

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[85vh]">
      <div className="flex justify-between items-end mb-2">
        <h2 className="text-2xl font-bold">Инбокс — все ЛС со всех аккаунтов</h2>
        <div className="flex space-x-3">
          <button onClick={() => refetch()} className="bg-background border border-border hover:text-primary px-4 py-2 rounded-md text-sm transition-colors">
            Обновить сейчас
          </button>
        </div>
      </div>
      <p className="text-muted text-xs mb-6">
        Старые диалоги из tdata-аккаунтов не подтягиваются — только сообщения, пришедшие после первого обнаружения собеседника.
      </p>

      <div className="flex-1 flex bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Sidebar */}
        <div className="w-[320px] border-r border-border flex flex-col">
          <div className="flex-1 overflow-y-auto">
            
            {Object.keys(groupedChats).length === 0 ? (
              <div className="p-4 text-center text-muted text-sm mt-10">Нет диалогов</div>
            ) : null}

            {Object.entries(groupedChats).map(([accountId, accountChats]) => (
              <div key={accountId}>
                <div className="px-4 py-2 bg-[#0B0914] border-y border-border/50 flex justify-between items-center sticky top-0 z-10">
                  <span className="text-xs font-semibold text-[#0ea5e9]">acc #{accountId}</span>
                  <span className="text-[10px] text-muted">{accountChats.length} диалог(а)</span>
                </div>
                <div className="divide-y divide-border/30">
                  {accountChats.map((chat: any) => (
                    <div 
                      key={chat.peer_id}
                      onClick={() => setSelectedChat(chat)}
                      className={`p-3 cursor-pointer flex items-center space-x-3 transition-colors ${
                        selectedChat?.peer_id === chat.peer_id && selectedChat?.account_id === chat.account_id
                        ? 'bg-background/80 border-l-2 border-accent'
                        : 'hover:bg-background/40'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#059669] flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                        {chat.sender_username ? chat.sender_username[0].toUpperCase() : 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <div className="font-medium text-[15px] truncate text-white">{chat.sender_username || chat.peer_id}</div>
                          <div className="text-[11px] text-muted">{new Date(chat.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                        <div className="text-xs text-muted truncate">{chat.last_message || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col bg-[#13111c]">
          {selectedChat ? (
            <>
              {/* Header */}
              <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[#3b82f6] flex items-center justify-center text-white font-medium text-lg">
                    {selectedChat.sender_username ? selectedChat.sender_username[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div className="font-bold text-[15px] text-white">{selectedChat.sender_username || selectedChat.peer_id}</div>
                    <div className="text-xs text-muted">от acc #{selectedChat.account_id} - tg id {selectedChat.peer_id}</div>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.is_incoming ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl p-4 text-[15px] shadow-sm ${
                      msg.is_incoming 
                      ? 'rounded-tl-sm bg-[#1e1b2e] border border-border/50 text-white' 
                      : 'rounded-tr-sm bg-accent text-white'
                    }`}>
                      <div>{msg.text}</div>
                      <div className={`text-[10px] mt-2 text-right ${msg.is_incoming ? 'text-muted' : 'text-white/80'}`}>
                        {new Date(msg.received_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input Area */}
              <div className="p-4 bg-card border-t border-border flex items-center space-x-3">
                <button className="text-muted hover:text-primary transition-colors p-2">
                  <Paperclip className="w-5 h-5" />
                </button>
                <input 
                  type="text" 
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage.mutate()}
                  className="flex-1 bg-[#13111c] border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors text-white"
                  placeholder={`Ответить от acc #${selectedChat.account_id}...`}
                />
                <button 
                  onClick={() => sendMessage.mutate()}
                  disabled={sendMessage.isPending || !text}
                  className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {sendMessage.isPending ? '...' : 'Отправить'}
                </button>
              </div>
            </>
          ) : (
             <div className="flex-1 flex items-center justify-center text-muted">
               Выберите диалог слева
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
