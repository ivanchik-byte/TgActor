import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Users,
  MessageSquare,
  Heart,
  Search,
  AlertCircle,
  Sparkles,
  Layers,
  LayoutGrid,
  List,
  CheckSquare,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '../components/ToastContext';

interface Account {
  id: number;
  phone: string;
  is_active: boolean;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  custom_name?: string | null;
  status: string;
  source_type?: string;
  position?: number;
  pool_type?: string;
  in_commenting_pool: boolean;
  in_reaction_pool: boolean;
  proxy_id?: number | null;
}

type FilterPool = 'all' | 'commenting' | 'reactions' | 'both' | 'none';

export default function Pools() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterPool>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isBatchApplying, setIsBatchApplying] = useState(false);

  // Fetch accounts list
  const { data: accounts = [], isLoading, isError, refetch } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data,
  });

  // Single account toggle mutation
  const togglePool = useMutation({
    mutationFn: async ({ id, pool, val }: { id: number; pool: 'comment' | 'reaction'; val: boolean }) => {
      const acc = accounts.find((a) => a.id === id);
      if (!acc) return;
      return axios.patch(`/api/accounts/${id}/pools`, {
        in_commenting_pool: pool === 'comment' ? val : acc.in_commenting_pool,
        in_reaction_pool: pool === 'reaction' ? val : acc.in_reaction_pool,
      });
    },
    onMutate: async ({ id, pool, val }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['accounts'] });
      const previousAccounts = queryClient.getQueryData<Account[]>(['accounts']);

      queryClient.setQueryData<Account[]>(['accounts'], (old = []) =>
        old.map((acc) => {
          if (acc.id !== id) return acc;
          const nextComment = pool === 'comment' ? val : acc.in_commenting_pool;
          const nextReact = pool === 'reaction' ? val : acc.in_reaction_pool;
          let nextType = 'none';
          if (nextComment && nextReact) nextType = 'both';
          else if (nextComment) nextType = 'commenting';
          else if (nextReact) nextType = 'reactions';

          return {
            ...acc,
            in_commenting_pool: nextComment,
            in_reaction_pool: nextReact,
            pool_type: nextType,
          };
        })
      );

      return { previousAccounts };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(['accounts'], context.previousAccounts);
      }
      showToast('Ошибка при обновлении пула аккаунта', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  // Batch toggle mutation for filtered or all accounts
  const applyBatchPool = async (action: 'all_comment' | 'all_reaction' | 'all_both' | 'clear_all') => {
    if (filteredAccounts.length === 0) return;
    setIsBatchApplying(true);
    try {
      const updates = filteredAccounts.map((acc) => {
        let in_commenting_pool = acc.in_commenting_pool;
        let in_reaction_pool = acc.in_reaction_pool;

        if (action === 'all_comment') {
          in_commenting_pool = true;
        } else if (action === 'all_reaction') {
          in_reaction_pool = true;
        } else if (action === 'all_both') {
          in_commenting_pool = true;
          in_reaction_pool = true;
        } else if (action === 'clear_all') {
          in_commenting_pool = false;
          in_reaction_pool = false;
        }

        return axios.patch(`/api/accounts/${acc.id}/pools`, {
          in_commenting_pool,
          in_reaction_pool,
        });
      });

      await Promise.all(updates);
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('Пулы успешно обновлены для выбранных аккаунтов', 'success');
    } catch (err) {
      showToast('Ошибка при массовом обновлении пулов', 'error');
    } finally {
      setIsBatchApplying(false);
    }
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = accounts.length;
    const commenting = accounts.filter((a) => a.in_commenting_pool).length;
    const reaction = accounts.filter((a) => a.in_reaction_pool).length;
    const both = accounts.filter((a) => a.in_commenting_pool && a.in_reaction_pool).length;
    const none = accounts.filter((a) => !a.in_commenting_pool && !a.in_reaction_pool).length;
    const active = accounts.filter((a) => a.status === 'active' || a.is_active).length;

    return { total, commenting, reaction, both, none, active };
  }, [accounts]);

  // Filtering
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      // Search
      const search = searchQuery.toLowerCase().trim();
      if (search) {
        const name = (acc.custom_name || `${acc.first_name || ''} ${acc.last_name || ''}`).toLowerCase();
        const username = (acc.username || '').toLowerCase();
        const phone = (acc.phone || '').toLowerCase();
        const matches = name.includes(search) || username.includes(search) || phone.includes(search);
        if (!matches) return false;
      }

      // Filter by pool
      if (activeFilter === 'commenting') return acc.in_commenting_pool;
      if (activeFilter === 'reactions') return acc.in_reaction_pool;
      if (activeFilter === 'both') return acc.in_commenting_pool && acc.in_reaction_pool;
      if (activeFilter === 'none') return !acc.in_commenting_pool && !acc.in_reaction_pool;

      return true;
    });
  }, [accounts, searchQuery, activeFilter]);

  // Color generator for avatar initials
  const getAvatarGradient = (id: number) => {
    const gradients = [
      'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
      'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
    ];
    return gradients[id % gradients.length];
  };

  const getAccountDisplayName = (acc: Account) => {
    if (acc.custom_name) return acc.custom_name;
    if (acc.first_name || acc.last_name) {
      return [acc.first_name, acc.last_name].filter(Boolean).join(' ');
    }
    if (acc.username) return `@${acc.username}`;
    return acc.phone || `Аккаунт #${acc.id}`;
  };

  const getInitials = (acc: Account) => {
    const name = getAccountDisplayName(acc).replace('@', '');
    return name.slice(0, 2).toUpperCase() || 'TG';
  };

  // Custom Toggle Switch
  const PoolToggle = ({
    checked,
    onChange,
    label,
    icon: Icon,
    color,
    disabled = false,
  }: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label: string;
    icon: any;
    color: string;
    disabled?: boolean;
  }) => {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderRadius: '10px',
          backgroundColor: checked ? 'var(--accent-soft)' : 'var(--bg-main)',
          border: `1px solid ${checked ? color : 'var(--border-color)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
          width: '100%',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !checked) {
            e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
            e.currentTarget.style.borderColor = 'var(--text-muted)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !checked) {
            e.currentTarget.style.backgroundColor = 'var(--bg-main)';
            e.currentTarget.style.borderColor = 'var(--border-color)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              backgroundColor: checked ? color : 'var(--bg-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: checked ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.18s ease',
            }}
          >
            <Icon style={{ width: '14px', height: '14px' }} />
          </div>
          <span
            style={{
              fontSize: '13px',
              fontWeight: checked ? 600 : 500,
              color: checked ? 'var(--text-main)' : 'var(--text-muted)',
              transition: 'color 0.18s ease',
            }}
          >
            {label}
          </span>
        </div>

        {/* The slider pill */}
        <div
          style={{
            width: '38px',
            height: '22px',
            borderRadius: '11px',
            backgroundColor: checked ? color : 'rgba(120, 120, 128, 0.25)',
            position: 'relative',
            transition: 'background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              position: 'absolute',
              top: '3px',
              left: checked ? '19px' : '3px',
              transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s ease',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
            }}
          />
        </div>
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header & Overview */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--accent-soft)',
                  border: '1px solid var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-text)',
                }}
              >
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: 'var(--text-main)',
                    margin: 0,
                  }}
                >
                  Пулы аккаунтов
                </h1>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                    margin: 0,
                  }}
                >
                  Оркестрация ролей: распределение аккаунтов по задачам написания сообщений и реакций
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions Dropdown / Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => applyBatchPool('all_both')}
              disabled={isBatchApplying || accounts.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-soft)',
                border: '1px solid var(--accent)',
                color: 'var(--accent-text)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: accounts.length === 0 ? 'not-allowed' : 'pointer',
                opacity: accounts.length === 0 ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (accounts.length > 0) e.currentTarget.style.backgroundColor = 'var(--accent)';
                if (accounts.length > 0) e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                if (accounts.length > 0) e.currentTarget.style.backgroundColor = 'var(--accent-soft)';
                if (accounts.length > 0) e.currentTarget.style.color = 'var(--accent-text)';
              }}
              title="Добавить все отфильтрованные аккаунты во все пулы"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Все во все пулы</span>
            </button>

            <button
              onClick={() => applyBatchPool('clear_all')}
              disabled={isBatchApplying || accounts.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: accounts.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#ef4444';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
              title="Исключить отфильтрованные аккаунты из всех пулов"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
          }}
        >
          {/* Card 1: Total */}
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Всего аккаунтов
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {isLoading ? '...' : stats.total}
              </div>
              <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                <span>{stats.active} активных</span>
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Commenting */}
          <div
            onClick={() => setActiveFilter(activeFilter === 'commenting' ? 'all' : 'commenting')}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${activeFilter === 'commenting' ? 'var(--accent)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => {
              if (activeFilter !== 'commenting') e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Пул комментаторов
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {isLoading ? '...' : stats.commenting}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Пишут тексты и диалоги
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Reactions */}
          <div
            onClick={() => setActiveFilter(activeFilter === 'reactions' ? 'all' : 'reactions')}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${activeFilter === 'reactions' ? 'var(--accent)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => {
              if (activeFilter !== 'reactions') e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Пул реакций
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {isLoading ? '...' : stats.reaction}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Ставят эмодзи-лайки
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(236, 72, 153, 0.1)',
                color: '#ec4899',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Heart className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Both / Unassigned */}
          <div
            onClick={() => setActiveFilter(activeFilter === 'both' ? 'all' : 'both')}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${activeFilter === 'both' ? 'var(--accent)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => {
              if (activeFilter !== 'both') e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Универсальные (Оба)
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                {isLoading ? '...' : stats.both}
              </div>
              <div style={{ fontSize: '12px', color: stats.none > 0 ? '#eab308' : 'var(--text-muted)', marginTop: '2px' }}>
        {stats.none > 0 ? ` ${stats.none} без пула` : 'Все распределены'}
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Control bar: Search + Filter Tabs + View Mode Toggle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '10px 16px',
        }}
      >
        {/* Left: Search input */}
        <div
          style={{
            position: 'relative',
            minWidth: '260px',
            flex: '1 1 260px',
            maxWidth: '380px',
          }}
        >
          <Search
            style={{
              width: '16px',
              height: '16px',
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Поиск по имени, @username, телефону..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 12px 8px 36px',
              fontSize: '13px',
              color: 'var(--text-main)',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px',
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Center: Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Все', count: stats.total },
            { id: 'commenting', label: 'Комментаторы', count: stats.commenting },
            { id: 'reactions', label: 'Реакции', count: stats.reaction },
            { id: 'both', label: 'Оба пула', count: stats.both },
            { id: 'none', label: 'Без пула', count: stats.none },
          ].map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as FilterPool)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    e.currentTarget.style.color = 'var(--text-main)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-main)',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: View Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '2px',
          }}
        >
          <button
            onClick={() => setViewMode('grid')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 8px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'grid' ? 'var(--bg-card)' : 'transparent',
              color: viewMode === 'grid' ? 'var(--accent-text)' : 'var(--text-muted)',
              cursor: 'pointer',
              boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.15s ease',
            }}
            title="Вид: Сетка карточек"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 8px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'table' ? 'var(--bg-card)' : 'transparent',
              color: viewMode === 'table' ? 'var(--accent-text)' : 'var(--text-muted)',
              cursor: 'pointer',
              boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.15s ease',
            }}
            title="Вид: Компактная таблица"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        // Loading Skeleton
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                opacity: 0.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--bg-main)',
                  }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ height: '14px', width: '60%', backgroundColor: 'var(--bg-main)', borderRadius: '4px' }} />
                  <div style={{ height: '10px', width: '40%', backgroundColor: 'var(--bg-main)', borderRadius: '4px' }} />
                </div>
              </div>
              <div style={{ height: '38px', backgroundColor: 'var(--bg-main)', borderRadius: '8px' }} />
              <div style={{ height: '38px', backgroundColor: 'var(--bg-main)', borderRadius: '8px' }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        // Error State
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid #ef4444',
            borderRadius: '14px',
            padding: '40px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertCircle className="w-10 h-10 text-red-500" />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
            Не удалось загрузить список аккаунтов
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '400px' }}>
            Проверьте соединение с сервером или статус бэкенда.
          </p>
          <button
            onClick={() => refetch()}
            style={{
              marginTop: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Повторить попытку
          </button>
        </div>
      ) : filteredAccounts.length === 0 ? (
        // Empty State
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: 'var(--accent-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
            }}
          >
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
              {searchQuery ? 'Ничего не найдено' : 'Аккаунты отсутствуют в этой выборке'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', margin: 0, lineHeight: 1.5 }}>
              {searchQuery
                ? `По запросу «${searchQuery}» аккаунтов не найдено. Попробуйте сбросить поисковый запрос.`
                : accounts.length === 0
                ? 'Вы еще не добавили ни одного Telegram аккаунта. Перейдите в раздел Аккаунты для импорта сессий.'
                : 'В выбранном фильтре нет подходящих аккаунтов. Измените фильтр сверху.'}
            </p>
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                marginTop: '4px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Сбросить поиск
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        // CARD GRID VIEW
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredAccounts.map((acc) => {
            const displayName = getAccountDisplayName(acc);
            const initials = getInitials(acc);
            const isBoth = acc.in_commenting_pool && acc.in_reaction_pool;

            return (
              <div
                key={acc.id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Top Profile Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    {/* Avatar */}
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: getAvatarGradient(acc.id),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '15px',
                        letterSpacing: '0.02em',
                        flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      }}
                    >
                      {initials}
                    </div>

                    {/* Name / info */}
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={displayName}
                      >
                        {displayName}
                      </div>

                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '1px',
                        }}
                      >
                        {acc.username && <span>@{acc.username}</span>}
                        {acc.username && acc.phone && <span>•</span>}
                        {acc.phone && <span>{acc.phone}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Pool Badge */}
                  <div style={{ flexShrink: 0 }}>
                    {isBoth ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        <Sparkles className="w-3 h-3" />
                        Оба пула
                      </span>
                    ) : acc.in_commenting_pool ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          color: '#3b82f6',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                        }}
                      >
                        <MessageSquare className="w-3 h-3" />
                        Комменты
                      </span>
                    ) : acc.in_reaction_pool ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'rgba(236, 72, 153, 0.12)',
                          color: '#ec4899',
                          border: '1px solid rgba(236, 72, 153, 0.25)',
                        }}
                      >
                        <Heart className="w-3 h-3" />
                        Реакции
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: 'var(--bg-main)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        Не назначен
                      </span>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', opacity: 0.6 }} />

                {/* Toggles Container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <PoolToggle
                    checked={acc.in_commenting_pool}
                    onChange={(val) => togglePool.mutate({ id: acc.id, pool: 'comment', val })}
                    label="Комментирование"
                    icon={MessageSquare}
                    color="#3b82f6"
                  />
                  <PoolToggle
                    checked={acc.in_reaction_pool}
                    onChange={(val) => togglePool.mutate({ id: acc.id, pool: 'reaction', val })}
                    label="Эмодзи-реакции"
                    icon={Heart}
                    color="#ec4899"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // COMPACT TABLE VIEW
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}>
                <th
                  style={{
                    padding: '14px 20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                  }}
                >
                  АККАУНТ
                </th>
                <th
                  style={{
                    padding: '14px 20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    width: '140px',
                    textAlign: 'center',
                  }}
                >
                  СТАТУС
                </th>
                <th
                  style={{
                    padding: '14px 20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    width: '380px',
                  }}
                >
                  НАЗНАЧЕНИЕ ПУЛОВ
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acc) => {
                const displayName = getAccountDisplayName(acc);
                const initials = getInitials(acc);

                return (
                  <tr
                    key={acc.id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background-color 0.12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Account Info */}
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '10px',
                            background: getAvatarGradient(acc.id),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '12px',
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                            {displayName}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                            {acc.username ? `@${acc.username}` : acc.phone || `ID #${acc.id}`}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor:
                            acc.status === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                          color: acc.status === 'error' ? '#ef4444' : '#22c55e',
                          border: `1px solid ${
                            acc.status === 'error' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)'
                          }`,
                        }}
                      >
                        <span
                          style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            backgroundColor: acc.status === 'error' ? '#ef4444' : '#22c55e',
                          }}
                        />
                        {acc.status || 'active'}
                      </span>
                    </td>

                    {/* Toggles */}
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '170px' }}>
                          <PoolToggle
                            checked={acc.in_commenting_pool}
                            onChange={(val) => togglePool.mutate({ id: acc.id, pool: 'comment', val })}
                            label="Комменты"
                            icon={MessageSquare}
                            color="#3b82f6"
                          />
                        </div>
                        <div style={{ width: '170px' }}>
                          <PoolToggle
                            checked={acc.in_reaction_pool}
                            onChange={(val) => togglePool.mutate({ id: acc.id, pool: 'reaction', val })}
                            label="Реакции"
                            icon={Heart}
                            color="#ec4899"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
