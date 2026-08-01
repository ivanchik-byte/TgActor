
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Plus, MessageSquare, Image, Reply } from 'lucide-react';

export default function Scenarios() {
  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => (await axios.get('/api/scenarios')).data
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Сценарии диалогов</h2>
        <button className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors">
          <Plus className="w-4 h-4 mr-2" /> Новый сценарий
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-border font-bold">Сохраненные</div>
          <div className="flex-1 overflow-y-auto">
            {scenarios.map((sc: any) => (
              <div key={sc.id} className="p-4 border-b border-border hover:bg-background/50 cursor-pointer">
                <div className="font-semibold">{sc.title}</div>
                <div className="text-xs text-muted mt-1">Делей: {sc.min_delay}-{sc.max_delay}s</div>
              </div>
            ))}
            {scenarios.length === 0 && (
              <div className="p-4 text-sm text-muted text-center">Нет сценариев</div>
            )}
          </div>
        </div>

        <div className="col-span-2 bg-card border border-border rounded-lg shadow-sm p-4 flex flex-col h-[600px]">
           <h3 className="font-bold border-b border-border pb-4 mb-4">Редактор шагов</h3>
           <div className="flex-1 overflow-y-auto space-y-4 pr-2">
             <div className="border border-border rounded-md p-4 bg-background">
               <div className="flex items-center justify-between mb-2">
                 <span className="font-semibold text-sm bg-border px-2 py-1 rounded">Шаг 1 (Role 1)</span>
                 <div className="flex space-x-2 text-muted">
                    <MessageSquare className="w-4 h-4" />
                 </div>
               </div>
               <textarea 
                 className="w-full bg-card border border-border rounded p-2 text-sm focus:outline-none focus:border-accent" 
                 placeholder="Текст сообщения..."
                 rows={2}
               />
               <div className="flex justify-between items-center mt-2">
                 <div className="flex space-x-2">
                   <button className="text-xs flex items-center text-muted hover:text-primary"><Image className="w-3 h-3 mr-1" /> Медиа</button>
                 </div>
                 <div className="text-xs text-muted">Задержка: 1-2 сек</div>
               </div>
             </div>

             <div className="border border-border rounded-md p-4 bg-background">
               <div className="flex items-center justify-between mb-2">
                 <span className="font-semibold text-sm bg-border px-2 py-1 rounded">Шаг 2 (Role 2)</span>
                 <div className="flex space-x-2 text-muted">
                    <Reply className="w-4 h-4 text-accent" />
                 </div>
               </div>
               <textarea 
                 className="w-full bg-card border border-border rounded p-2 text-sm focus:outline-none focus:border-accent" 
                 placeholder="Ответ на Шаг 1..."
                 rows={2}
               />
               <div className="flex justify-between items-center mt-2">
                 <div className="text-xs bg-border px-2 py-1 rounded">Реакции: 👍 🔥 (x2)</div>
                 <div className="text-xs text-muted">Задержка: 2-5 сек</div>
               </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
