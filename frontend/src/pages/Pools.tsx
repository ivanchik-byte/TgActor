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

  // Custom checkbox inline
  const PoolCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
      onMouseEnter={e => {
        const span = e.currentTarget.querySelector('span');
        if (span) span.style.color = 'var(--text-main)';
      }}
      onMouseLeave={e => {
        const span = e.currentTarget.querySelector('span');
        if (span) span.style.color = 'var(--text-muted)';
      }}
    >
      <div
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: checked ? 'none' : '1px solid var(--border-color)',
          backgroundColor: checked ? 'var(--accent)' : 'var(--bg-main)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M3 8L6 11L11 3.5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" stroke="white" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)', transition: 'color 0.15s' }}>
        {label}
      </span>
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-main)' }}>
          Пулы аккаунтов
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
          Кто пишет реплики сценариев (комментирование) и кто ставит реакции. Аккаунт может быть в обоих пулах, в одном или ни в одном. Сохраняется сразу.
        </p>
      </div>

      <div style={cardStyle}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', whiteSpace: 'nowrap' as const }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={thStyle}>АККАУНТ</th>
              <th style={{ ...thStyle, width: '140px', textAlign: 'center' }}>СТАТУС</th>
              <th style={{ ...thStyle, width: '300px' }}>ПУЛЫ</th>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <PoolCheckbox
                      checked={acc.in_commenting_pool}
                      onChange={(val) => togglePool.mutate({ id: acc.id, pool: 'comment', val })}
                      label="Комментирование"
                    />
                    <PoolCheckbox
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
