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

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    overflow: 'hidden',
  };

  const thStyle: React.CSSProperties = {
    padding: '14px 20px',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  };

  const tdStyle: React.CSSProperties = {
    padding: '14px 20px',
    fontSize: '14px',
  };

  // Custom Toggle Switch component to fix label double-trigger bug and look premium
  const PoolSwitch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '20px',
          borderRadius: '10px',
          backgroundColor: checked ? 'var(--accent)' : 'var(--bg-main)',
          border: '1px solid var(--border-color)',
          position: 'relative',
          transition: 'background-color 0.2s',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '3px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </div>
      <span style={{ fontSize: '13px', color: checked ? 'var(--text-main)' : 'var(--text-muted)', transition: 'color 0.2s' }}>
        {label}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-main)' }}>
          Пулы аккаунтов
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
          Укажите роли участников: кто пишет сообщения (комментирование), а кто ставит лайки/реакции. Изменения сохраняются автоматически.
        </p>
      </div>

      <div style={cardStyle}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', whiteSpace: 'nowrap' as const }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={thStyle}>АККАУНТ</th>
              <th style={{ ...thStyle, width: '140px', textAlign: 'center' }}>СТАТУС</th>
              <th style={{ ...thStyle, width: '320px' }}>АКТИВНЫЕ ПУЛЫ</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc: any) => (
              <tr
                key={acc.id}
                style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  {acc.username || acc.first_name || `Аккаунт #${acc.id}`}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    color: '#22c55e',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}>
                    active
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <PoolSwitch
                      checked={acc.in_commenting_pool}
                      onChange={(val) => togglePool.mutate({ id: acc.id, pool: 'comment', val })}
                      label="Комментирование"
                    />
                    <PoolSwitch
                      checked={acc.in_reaction_pool}
                      onChange={(val) => togglePool.mutate({ id: acc.id, pool: 'reaction', val })}
                      label="Реакции"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && !isLoading && (
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>
                  Нет загруженных аккаунтов.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
