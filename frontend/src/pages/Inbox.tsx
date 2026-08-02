import { useState } from 'react';
import { Paperclip } from 'lucide-react';

export default function Inbox() {
  const [text, setText] = useState("");

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[85vh]">
      <div className="flex justify-between items-end mb-2">
        <h2 className="text-2xl font-bold">Инбокс — все ЛС со всех аккаунтов</h2>
        <div className="flex space-x-3">
          <button className="bg-background border border-border hover:text-primary px-4 py-2 rounded-md text-sm transition-colors">
            Обновить сейчас
          </button>
          <button className="bg-background border border-border hover:text-primary px-4 py-2 rounded-md text-sm transition-colors">
            Очистить всё
          </button>
        </div>
      </div>
      <p className="text-muted text-xs mb-6">
        Старые диалоги из tdata-аккаунтов не подтягиваются — только сообщения, пришедшие после первого обнаружения собеседника. Очистить можно весь инбокс или конкретный диалог.
      </p>

      <div className="flex-1 flex bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Sidebar */}
        <div className="w-[320px] border-r border-border flex flex-col">
          <div className="flex-1 overflow-y-auto">
            
            {/* Account Group 1 */}
            <div className="px-4 py-2 bg-[#0B0914] border-y border-border/50 flex justify-between items-center sticky top-0 z-10">
              <span className="text-xs font-semibold text-[#0ea5e9]">acc #13</span>
              <span className="text-[10px] text-muted">8 диалог(а)</span>
            </div>
            <div className="divide-y divide-border/30">
              {/* Chat Item */}
              <div className="p-3 hover:bg-background/40 cursor-pointer flex items-center space-x-3 transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#059669] flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                  1
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <div className="font-medium text-[15px] truncate text-white">19254888041</div>
                    <div className="text-[11px] text-muted">07-13 19:11</div>
                  </div>
                  <div className="text-xs text-muted truncate">—</div>
                </div>
                <div className="bg-accent text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">1</div>
              </div>

              {/* Chat Item */}
              <div className="p-3 hover:bg-background/40 cursor-pointer flex items-center space-x-3 transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#059669] flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                  1
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <div className="font-medium text-[15px] truncate text-white">19496306812</div>
                    <div className="text-[11px] text-muted">07-13 02:27</div>
                  </div>
                  <div className="text-xs text-muted truncate">—</div>
                </div>
                <div className="bg-accent text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">1</div>
              </div>
            </div>

            {/* Account Group 2 */}
            <div className="px-4 py-2 bg-[#0B0914] border-y border-border/50 flex justify-between items-center sticky top-0 z-10">
              <span className="text-xs font-semibold text-[#3b82f6]">acc #9</span>
              <span className="text-[10px] text-muted">1 диалог(а)</span>
            </div>
            <div className="divide-y divide-border/30">
              {/* Chat Item (Telegram) */}
              <div className="p-3 bg-background/20 cursor-pointer flex items-center space-x-3 border-l-2 border-accent">
                <div className="w-10 h-10 rounded-full bg-[#3b82f6] flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                  T
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <div className="font-medium text-[15px] truncate text-white">Telegram</div>
                    <div className="text-[11px] text-muted">07-07 10:33</div>
                  </div>
                  <div className="text-xs text-muted truncate">Two-Step Verification disabled. Dear S...</div>
                </div>
                <div className="bg-accent text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">3</div>
              </div>
            </div>

            {/* Account Group 3 */}
            <div className="px-4 py-2 bg-[#0B0914] border-y border-border/50 flex justify-between items-center sticky top-0 z-10">
              <span className="text-xs font-semibold text-[#84cc16]">acc #7</span>
              <span className="text-[10px] text-muted">2 диалог(а)</span>
            </div>
            <div className="divide-y divide-border/30">
              {/* Chat Item */}
              <div className="p-3 hover:bg-background/40 cursor-pointer flex items-center space-x-3 transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#84cc16] flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                  L
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <div className="font-medium text-[15px] truncate text-white">Leyla Khale</div>
                    <div className="text-[11px] text-muted">07-07 02:26</div>
                  </div>
                  <div className="text-xs text-muted truncate">—</div>
                </div>
                <div className="bg-accent text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">1</div>
              </div>
            </div>

          </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col bg-[#13111c]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-[#3b82f6] flex items-center justify-center text-white font-medium text-lg">
                T
              </div>
              <div>
                <div className="font-bold text-[15px] text-white">Telegram</div>
                <div className="text-xs text-muted">от acc #2 - tg id 777000</div>
              </div>
            </div>
            <button className="bg-background border border-border hover:text-primary px-4 py-1.5 rounded-md text-xs transition-colors">
              Очистить
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            
            {/* Date divider */}
            <div className="flex justify-center my-4">
              <span className="text-[10px] text-muted bg-card px-2 py-0.5 rounded-full">13 июля</span>
            </div>

            {/* Incoming Message Bubble */}
            <div className="flex justify-start">
              <div className="max-w-[75%] rounded-2xl rounded-tl-sm p-4 text-[15px] bg-[#1e1b2e] border border-border/50 text-white shadow-sm">
                <div className="mb-4">
                  Login code: 32889. Do not give this code to anyone, even if they say they are from Telegram!
                </div>
                <div className="mb-4">
                  <span className="text-red-400 mr-1">!</span> 
                  This code can be used to log in to your Telegram account. We never ask it for anything else.
                </div>
                <div>
                  If you didn't request this code by trying to log in on another device, simply ignore this message.
                </div>
                <div className="text-[10px] text-muted mt-2 text-right">
                  06-20 21:43
                </div>
              </div>
            </div>

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
              className="flex-1 bg-[#13111c] border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors text-white"
              placeholder="Ответить от acc #2..."
            />
            <button className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-md text-sm font-medium transition-colors">
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
