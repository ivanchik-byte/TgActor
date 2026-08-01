import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Send } from 'lucide-react';

export default function Inbox() {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  
  const { data: initialMessages = [] } = useQuery({
    queryKey: ['inbox'],
    queryFn: async () => (await axios.get('/api/inbox/messages')).data
  });

  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages([...initialMessages].reverse());
    }
  }, [initialMessages]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/inbox');
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setMessages(prev => [...prev, msg]);
    };
    return () => ws.close();
  }, []);

  const sendMsg = async () => {
    if (!text.trim()) return;
    try {
      await axios.post('/api/inbox/send', {
        account_id: 1, // Mocked for demo
        peer_id: 123, 
        text
      });
      setText("");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-[80vh] flex bg-card border border-border rounded-lg shadow-sm overflow-hidden">
      <div className="w-1/3 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border font-bold">Активные диалоги</div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-border hover:bg-background/50 cursor-pointer bg-background">
             <div className="font-semibold">User 123 (via Acc #1)</div>
             <div className="text-sm text-muted truncate">Нажмите для просмотра</div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col bg-background/30">
        <div className="p-4 border-b border-border font-bold bg-card">User 123</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m: any, idx) => (
             <div key={idx} className={`flex ${m.is_incoming ? 'justify-start' : 'justify-end'}`}>
               <div className={`max-w-[70%] rounded-lg p-3 text-sm ${m.is_incoming ? 'bg-card border border-border' : 'bg-accent text-white'}`}>
                 {m.text}
                 <div className={`text-xs mt-1 ${m.is_incoming ? 'text-muted' : 'text-white/70'}`}>
                   {new Date(m.timestamp || m.received_at).toLocaleTimeString()}
                 </div>
               </div>
             </div>
          ))}
        </div>
        <div className="p-4 border-t border-border flex space-x-2 bg-card">
          <input 
            type="text" 
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMsg()}
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-shadow"
            placeholder="Написать сообщение..."
          />
          <button 
            onClick={sendMsg}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-md flex items-center transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
