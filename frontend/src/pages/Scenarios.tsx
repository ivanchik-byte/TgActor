import { useState } from 'react';
import { ArrowUp, ArrowDown, X } from 'lucide-react';

export default function Scenarios() {
  const [isActive, setIsActive] = useState(true);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Parameters Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Параметры сценария</h2>
          <label className="flex items-center space-x-2 cursor-pointer group">
            <div className="relative flex items-center">
              <input 
                type="checkbox" 
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-5 h-5 border border-border rounded bg-background peer-checked:bg-accent peer-checked:border-accent transition-all flex items-center justify-center">
                <svg className={`w-3.5 h-3.5 text-white pointer-events-none ${isActive ? 'opacity-100' : 'opacity-0'}`} viewBox="0 0 14 14" fill="none">
                  <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
                </svg>
              </div>
            </div>
            <span className="text-sm text-muted group-hover:text-primary transition-colors">Активен</span>
          </label>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-5">
          <div>
            <label className="block text-xs text-muted mb-1.5">Название</label>
            <input 
              type="text" 
              defaultValue="test_1"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs text-muted mb-1.5">Интервал по умолчанию, мин (сек)</label>
              <input 
                type="number" 
                defaultValue={30}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Интервал по умолчанию, макс (сек)</label>
              <input 
                type="number" 
                defaultValue={60}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Реакций на сообщение по умолчанию</label>
              <input 
                type="number" 
                defaultValue={0}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">Заметки (для себя)</label>
            <textarea 
              rows={2}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors resize-y"
            ></textarea>
          </div>

          <div className="flex justify-end pt-2">
            <button className="bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-md text-sm font-medium transition-colors">
              Сохранить параметры
            </button>
          </div>
        </div>
      </div>

      {/* Replicas Section */}
      <div>
        <h2 className="text-xl font-bold mb-4">Реплики</h2>
        
        <div className="space-y-6">
          {/* Replica 1 */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6 border-b border-border/50 pb-4">
              <div className="flex items-center space-x-3">
                <span className="bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span className="font-semibold text-[15px]">Реплика</span>
              </div>
              <div className="flex items-center space-x-2">
                <button className="bg-background border border-border hover:text-primary p-1 rounded transition-colors">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button className="bg-background border border-border hover:text-primary p-1 rounded transition-colors">
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white p-1 rounded transition-colors ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="col-span-1">
                  <label className="block text-xs text-muted mb-1.5">Аккаунт (роль №)</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors">
                    <option>1</option>
                    <option>2</option>
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-muted mb-1.5">Тип сообщения</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors">
                    <option>Обычное сообщение</option>
                    <option>Ответ (reply) на реплику 1</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">Текст реплики</label>
                <textarea 
                  rows={2}
                  defaultValue="Я вообще не знаю как можно выжить в этой стране, я зарабатываю 3000$ в месяц и я в ахуе просто"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors resize-y"
                ></textarea>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Интервал перед, мин (сек)</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-muted">
                    <option>из сценария</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Интервал перед, макс (сек)</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-muted">
                    <option>из сценария</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Реакции (эмодзи через пробел)</label>
                  <input 
                    type="text" 
                    defaultValue="👍 🔥 ❤️"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Кол-во реакций</label>
                  <input 
                    type="number" 
                    defaultValue={3}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-end justify-between pt-2">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-3">
                    <button className="bg-background border border-border hover:bg-background/80 px-4 py-1.5 rounded text-xs transition-colors">
                      Обзор...
                    </button>
                    <span className="text-xs text-muted">Файл не выбран.</span>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input type="checkbox" className="peer sr-only" />
                      <div className="w-4 h-4 border border-border rounded bg-background peer-checked:bg-accent peer-checked:border-accent transition-all flex items-center justify-center">
                        <svg className="w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 14" fill="none">
                          <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-xs text-muted group-hover:text-primary transition-colors">Не начинать беседу, если вложение запрещено в группе</span>
                  </label>
                </div>
                <div className="text-[10px] text-muted">нет</div>
              </div>
            </div>

            <div className="flex justify-end pt-6">
              <button className="bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-md text-sm font-medium transition-colors">
                Сохранить реплику
              </button>
            </div>
          </div>

          {/* Replica 2 */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6 border-b border-border/50 pb-4">
              <div className="flex items-center space-x-3">
                <span className="bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span className="font-semibold text-[15px]">Реплика</span>
              </div>
              <div className="flex items-center space-x-2">
                <button className="bg-background border border-border hover:text-primary p-1 rounded transition-colors">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button className="bg-background border border-border hover:text-primary p-1 rounded transition-colors">
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white p-1 rounded transition-colors ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="col-span-1">
                  <label className="block text-xs text-muted mb-1.5">Аккаунт (роль №)</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors">
                    <option>2</option>
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-muted mb-1.5">Тип сообщения</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors">
                    <option>Ответ (reply) на реплику 1</option>
                    <option>Обычное сообщение</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">Текст реплики</label>
                <textarea 
                  rows={2}
                  defaultValue={`Очередной "успешный". Деньги не проблема? Лучше реши чью-то проблему, а не выебуйся`}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors resize-y"
                ></textarea>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Интервал перед, мин (сек)</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-muted">
                    <option>из сценария</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Интервал перед, макс (сек)</label>
                  <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-muted">
                    <option>из сценария</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Реакции (эмодзи через пробел)</label>
                  <input 
                    type="text" 
                    defaultValue="👍"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Кол-во реакций</label>
                  <input 
                    type="number" 
                    defaultValue={2}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-end justify-between pt-2">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-3">
                    <button className="bg-background border border-border hover:bg-background/80 px-4 py-1.5 rounded text-xs transition-colors">
                      Обзор...
                    </button>
                    <span className="text-xs text-muted">Файл не выбран.</span>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input type="checkbox" className="peer sr-only" />
                      <div className="w-4 h-4 border border-border rounded bg-background peer-checked:bg-accent peer-checked:border-accent transition-all flex items-center justify-center">
                        <svg className="w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 14" fill="none">
                          <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
                        </svg>
                      </div>
                    </div>
                    <span className="text-xs text-muted group-hover:text-primary transition-colors">Не начинать беседу, если вложение запрещено в группе</span>
                  </label>
                </div>
                <div className="text-[10px] text-muted">нет</div>
              </div>
            </div>

            <div className="flex justify-end pt-6">
              <button className="bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-md text-sm font-medium transition-colors">
                Сохранить реплику
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
