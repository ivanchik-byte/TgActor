import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Check, X } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);
  const [phoneCodeHash, setPhoneCodeHash] = useState('');

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data
  });

  const requestPhoneCode = useMutation({
    mutationFn: async () => axios.post('/api/accounts/send-code', { phone, api_id: apiId, api_hash: apiHash }),
    onSuccess: (res) => {
      setPhoneCodeHash(res.data.phone_code_hash);
      setStep(2);
    }
  });

  const submitCode = useMutation({
    mutationFn: async () => axios.post('/api/accounts/sign-in', { phone, phone_code_hash: phoneCodeHash, code }),
    onSuccess: () => {
      setStep(1);
      setPhone('');
      setApiId('');
      setApiHash('');
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  return (
    <div className="space-y-8">
      {/* Top Description */}
      <div>
        <h2 className="text-2xl font-bold mb-1">Аккаунты</h2>
        <p className="text-muted text-sm">
          Bot-ферма. На каждый аккаунт автоматически закрепляется свой sticky-прокси (1:1, не делится). При смерти прокси — авто-свап на свободный.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TData Upload */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold mb-2">Загрузка из tdata-архива</h3>
            <p className="text-muted text-sm mb-6">
              .zip с папкой tdata от Telegram Desktop. Будет конвертирован в Telethon-сессию через opentele и привязан к свободному прокси.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button className="bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-md text-sm font-medium transition-colors">
              Импорт
            </button>
            <button className="bg-background hover:bg-background/80 border border-border px-4 py-2 rounded-md text-sm transition-colors text-muted hover:text-primary">
              Обзор...
            </button>
            <span className="text-muted text-sm flex-1">Файлы не выбраны.</span>
          </div>
          <p className="text-muted text-xs mt-4">Можно выбрать несколько файлов одновременно — обработаются по очереди, каждому свой прокси.</p>
        </div>

        {/* Phone Login */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-2">Добавить через телефон</h3>
          <p className="text-muted text-sm mb-6">
            Введи api_id, api_hash (с my.telegram.org) и номер. Telegram пришлёт код. Если есть 2FA — пароль введёшь после кода.
          </p>
          
          {step === 1 ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="+1442..."
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <div className="flex space-x-3">
                <input
                  type="text"
                  placeholder="api_id"
                  value={apiId}
                  onChange={e => setApiId(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  placeholder="api_hash"
                  value={apiHash}
                  onChange={e => setApiHash(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex justify-start">
                <button 
                  onClick={() => requestPhoneCode.mutate()}
                  disabled={requestPhoneCode.isPending}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors mt-2"
                >
                  {requestPhoneCode.isPending ? 'Отправка...' : 'Запросить код'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Введите код из Telegram"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <div className="flex justify-start">
                <button 
                  onClick={() => submitCode.mutate()}
                  disabled={submitCode.isPending}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {submitCode.isPending ? 'Вход...' : 'Отправить код'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Accounts List */}
      <div>
        <div className="flex justify-start items-center space-x-4 mb-4">
          <button className="bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-md text-sm transition-colors">
            Проверить все
          </button>
          <div className="text-muted text-sm font-medium">
            Аккаунтов: {accounts.length} <span className="mx-2 text-border">•</span> пул прокси: 5
          </div>
        </div>
        
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="text-muted uppercase text-xs border-b border-border">
              <tr>
                <th className="px-4 py-4 font-semibold w-16">№</th>
                <th className="px-4 py-4 font-semibold">ТЕЛЕФОН / TG-ID</th>
                <th className="px-4 py-4 font-semibold">ПРОФИЛЬ</th>
                <th className="px-4 py-4 font-semibold">ИСТОЧНИК</th>
                <th className="px-4 py-4 font-semibold">ПРОКСИ</th>
                <th className="px-4 py-4 font-semibold">СТАТУС</th>
                <th className="px-4 py-4 font-semibold">ПРОВЕРЕН</th>
                <th className="px-4 py-4 font-semibold">ДЕЙСТВИЯ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {accounts.map((acc: any) => (
                <tr key={acc.id} className="hover:bg-background/40 transition-colors">
                  <td className="px-4 py-3 text-muted">#{acc.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-muted">—</div>
                    <div className="text-muted text-xs mt-0.5">id {acc.telegram_id || acc.phone}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">{acc.first_name || acc.username || 'Letxxirc Oqyendoybg'}</td>
                  <td className="px-4 py-3 text-muted">{acc.source_type}</td>
                  <td className="px-4 py-3 text-muted">id={acc.proxy_id || 20}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center text-emerald-500 font-medium text-xs">
                      <Check className="w-3 h-3 mr-1" /> активен
                    </span>
                    <div className="text-muted text-[10px] mt-0.5">ok</div>
                  </td>
                  <td className="px-4 py-3 text-emerald-500 text-xs font-medium">07-17 00:37 ok</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-start space-x-2">
                      <button className="bg-background border border-border hover:text-primary px-3 py-1 rounded text-xs transition-colors">Профиль</button>
                      <button className="bg-background border border-border hover:text-primary px-3 py-1 rounded text-xs transition-colors">Чаты</button>
                      <button className="bg-background border border-border hover:text-primary px-3 py-1 rounded text-xs transition-colors">Проверить</button>
                      <button className="bg-background border border-border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 px-2 py-1 rounded text-xs transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">Нет загруженных аккаунтов.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
