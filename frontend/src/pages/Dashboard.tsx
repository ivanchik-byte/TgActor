
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, ShieldAlert, UploadCloud } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data
  });

  const { data: proxyMode } = useQuery({
    queryKey: ['proxyMode'],
    queryFn: async () => (await axios.get('/api/config/proxy-mode')).data
  });

  const toggleProxyMode = useMutation({
    mutationFn: async (val: boolean) => axios.post('/api/config/proxy-mode', { use_proxy: val }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxyMode'] })
  });

  const togglePool = useMutation({
    mutationFn: async ({ id, pool, val }: any) => {
      const acc = accounts.find((a: any) => a.id === id);
      return axios.patch(`/api/accounts/${id}/pools`, {
        in_commenting_pool: pool === 'comment' ? val : acc.in_commenting_pool,
        in_reaction_pool: pool === 'reaction' ? val : acc.in_reaction_pool,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] })
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-lg border border-border shadow-sm">
        <div>
          <h2 className="text-lg font-bold">Настройки сети</h2>
          <p className="text-sm text-muted">Глобальный переключатель прокси-серверов.</p>
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={() => toggleProxyMode.mutate(true)}
            className={`px-4 py-2 flex items-center rounded-md font-medium text-sm transition-colors ${
              proxyMode?.use_proxy ? 'bg-emerald-600 text-white' : 'bg-background border border-border text-muted hover:text-primary'
            }`}
          >
            <Shield className="w-4 h-4 mr-2" />
            Использовать прокси: ДА (Рекомендовано)
          </button>
          <button 
            onClick={() => toggleProxyMode.mutate(false)}
            className={`px-4 py-2 flex items-center rounded-md font-medium text-sm transition-colors ${
              proxyMode?.use_proxy === false ? 'bg-red-600 text-white' : 'bg-background border border-border text-muted hover:text-primary'
            }`}
          >
            <ShieldAlert className="w-4 h-4 mr-2" />
            Использовать прокси: НЕТ (ОПАСНО)
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-bold">Ферма аккаунтов</h2>
          <button className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center transition-colors">
            <UploadCloud className="w-4 h-4 mr-2" /> Загрузить TData (.zip)
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-muted uppercase text-xs">
            <tr>
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Phone / Username</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-center">Commenting Pool</th>
              <th className="px-4 py-3 font-semibold text-center">Reaction Pool</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accounts.map((acc: any) => (
              <tr key={acc.id} className="hover:bg-background/50 transition-colors">
                <td className="px-4 py-3 text-muted">#{acc.id}</td>
                <td className="px-4 py-3 font-medium">{acc.phone || acc.username || 'Unknown'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${acc.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                    {acc.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <input 
                    type="checkbox" 
                    checked={acc.in_commenting_pool}
                    onChange={(e) => togglePool.mutate({ id: acc.id, pool: 'comment', val: e.target.checked })}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input 
                    type="checkbox" 
                    checked={acc.in_reaction_pool}
                    onChange={(e) => togglePool.mutate({ id: acc.id, pool: 'reaction', val: e.target.checked })}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                </td>
              </tr>
            ))}
            {accounts.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">Нет загруженных аккаунтов.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
