import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export default function Pools() {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data
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
      <div>
        <h2 className="text-2xl font-bold mb-1">Пулы аккаунтов</h2>
        <p className="text-muted text-sm">
          Кто пишет реплики сценариев (комментирование) и кто ставит реакции. Аккаунт может быть в обоих пулах, в одном или ни в одном. Сохраняется сразу.
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="text-muted uppercase text-xs border-b border-border">
            <tr>
              <th className="px-6 py-4 font-semibold">АККАУНТ</th>
              <th className="px-6 py-4 font-semibold w-40 text-center">СТАТУС</th>
              <th className="px-6 py-4 font-semibold w-64">ПУЛЫ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {accounts.map((acc: any) => (
              <tr key={acc.id} className="hover:bg-background/40 transition-colors">
                <td className="px-6 py-4 font-medium text-[15px]">
                  {acc.username || acc.first_name || `Аккаунт #${acc.id}`}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-block px-3 py-1 rounded-full border border-emerald-500/30 text-emerald-500 text-xs font-medium">
                    active
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-6">
                    <label className="flex items-center space-x-2 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input 
                          type="checkbox" 
                          checked={acc.in_commenting_pool}
                          onChange={(e) => togglePool.mutate({ id: acc.id, pool: 'comment', val: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-4 h-4 border border-border rounded bg-background peer-checked:bg-accent peer-checked:border-accent transition-all flex items-center justify-center">
                          <svg className={`w-3 h-3 text-white pointer-events-none ${acc.in_commenting_pool ? 'opacity-100' : 'opacity-0'}`} viewBox="0 0 14 14" fill="none">
                            <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
                          </svg>
                        </div>
                      </div>
                      <span className="text-sm text-muted group-hover:text-primary transition-colors">Комментирование</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input 
                          type="checkbox" 
                          checked={acc.in_reaction_pool}
                          onChange={(e) => togglePool.mutate({ id: acc.id, pool: 'reaction', val: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-4 h-4 border border-border rounded bg-background peer-checked:bg-accent peer-checked:border-accent transition-all flex items-center justify-center">
                          <svg className={`w-3 h-3 text-white pointer-events-none ${acc.in_reaction_pool ? 'opacity-100' : 'opacity-0'}`} viewBox="0 0 14 14" fill="none">
                            <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
                          </svg>
                        </div>
                      </div>
                      <span className="text-sm text-muted group-hover:text-primary transition-colors">Реакции</span>
                    </label>
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && !isLoading && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-muted">Нет загруженных аккаунтов.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
