import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Check, X, Upload, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);
  const [phoneCodeHash, setPhoneCodeHash] = useState('');

  // File upload refs & state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

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

  // File upload mutation
  const uploadTdata = useMutation({
    mutationFn: async (files: File[]) => {
      const results = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axios.post('/api/accounts/upload-tdata', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        results.push(res.data);
      }
      return results;
    },
    onSuccess: () => {
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  // Shared styles
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '24px',
    transition: 'border-color 0.2s',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: 'var(--text-main)',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const btnAccent: React.CSSProperties = {
    backgroundColor: 'var(--accent)',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.15s, opacity 0.15s',
  };

  const btnSecondary: React.CSSProperties = {
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-muted)',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const thStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  };

  const tdStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '13px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-main)' }}>
          Аккаунты
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
          Bot-ферма. На каждый аккаунт автоматически закрепляется свой sticky-прокси (1:1, не делится). При смерти прокси — авто-свап на свободный.
        </p>
      </div>

      {/* Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
        {/* TData Upload Card */}
        <div style={cardStyle}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
              Загрузка из tdata-архива
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
              .zip с папкой tdata от Telegram Desktop. Будет конвертирован в Telethon-сессию через opentele и привязан к свободному прокси.
            </p>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              style={{
                ...btnAccent,
                opacity: selectedFiles.length === 0 || uploadTdata.isPending ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              disabled={selectedFiles.length === 0 || uploadTdata.isPending}
              onClick={() => uploadTdata.mutate(selectedFiles)}
            >
              {uploadTdata.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploadTdata.isPending ? 'Загрузка...' : 'Импорт'}
            </button>
            <button
              style={btnSecondary}
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-main)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
            >
              Обзор...
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {selectedFiles.length > 0
                ? selectedFiles.map(f => f.name).join(', ')
                : 'Файлы не выбраны.'}
            </span>
          </div>

          {uploadTdata.isSuccess && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check className="w-3.5 h-3.5" /> Файлы загружены
            </div>
          )}
          {uploadTdata.isError && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#ef4444' }}>
              Ошибка загрузки: {(uploadTdata.error as Error)?.message || 'Неизвестная ошибка'}
            </div>
          )}

          <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '14px' }}>
            Можно выбрать несколько файлов одновременно — обработаются по очереди, каждому свой прокси.
          </p>
        </div>

        {/* Phone Login Card */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
            Добавить через телефон
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5, marginBottom: '20px' }}>
            Введи api_id, api_hash (с my.telegram.org) и номер. Telegram пришлёт код.
          </p>

          {step === 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                placeholder="+1442..."
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="api_id"
                  value={apiId}
                  onChange={e => setApiId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
                <input
                  type="text"
                  placeholder="api_hash"
                  value={apiHash}
                  onChange={e => setApiHash(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
              <div>
                <button
                  onClick={() => requestPhoneCode.mutate()}
                  disabled={requestPhoneCode.isPending || !phone || !apiId || !apiHash}
                  style={{
                    ...btnAccent,
                    opacity: requestPhoneCode.isPending || !phone || !apiId || !apiHash ? 0.5 : 1,
                    marginTop: '4px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
                >
                  {requestPhoneCode.isPending ? 'Отправка...' : 'Запросить код'}
                </button>
              </div>
              {requestPhoneCode.isError && (
                <div style={{ fontSize: '12px', color: '#ef4444' }}>
                  Ошибка: {(requestPhoneCode.error as Error)?.message || 'Не удалось отправить код'}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                placeholder="Введите код из Telegram"
                value={code}
                onChange={e => setCode(e.target.value)}
                style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => submitCode.mutate()}
                  disabled={submitCode.isPending || !code}
                  style={{
                    ...btnAccent,
                    opacity: submitCode.isPending || !code ? 0.5 : 1,
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
                >
                  {submitCode.isPending ? 'Вход...' : 'Отправить код'}
                </button>
                <button
                  style={btnSecondary}
                  onClick={() => { setStep(1); setCode(''); }}
                >
                  Назад
                </button>
              </div>
              {submitCode.isError && (
                <div style={{ fontSize: '12px', color: '#ef4444' }}>
                  Ошибка: {(submitCode.error as Error)?.message || 'Не удалось войти'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Accounts List */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <button
            style={btnAccent}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
          >
            Проверить все
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500 }}>
            Аккаунтов: {accounts.length}
            <span style={{ margin: '0 8px', color: 'var(--border-color)' }}>•</span>
            пул прокси: 5
          </span>
        </div>

        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', whiteSpace: 'nowrap' as const }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ ...thStyle, width: '50px' }}>№</th>
                <th style={thStyle}>ТЕЛЕФОН / TG-ID</th>
                <th style={thStyle}>ПРОФИЛЬ</th>
                <th style={thStyle}>ИСТОЧНИК</th>
                <th style={thStyle}>ПРОКСИ</th>
                <th style={thStyle}>СТАТУС</th>
                <th style={thStyle}>ПРОВЕРЕН</th>
                <th style={thStyle}>ДЕЙСТВИЯ</th>
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
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>#{acc.id}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '12px' }}>—</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>{acc.phone}</div>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{acc.first_name || acc.username || 'Без имени'}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{acc.source_type}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>id={acc.proxy_id || 'Нет'}</td>
                  <td style={tdStyle}>
                    {acc.status === 'active' ? (
                      <span style={{ display: 'flex', alignItems: 'center', color: '#22c55e', fontWeight: 500, fontSize: '12px', gap: '4px' }}>
                        <Check className="w-3 h-3" /> активен
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', color: '#ef4444', fontWeight: 500, fontSize: '12px', gap: '4px' }}>
                        <X className="w-3 h-3" /> {acc.status || 'неизвестно'}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: '#22c55e', fontSize: '12px', fontWeight: 500 }}>
                    {new Date(acc.created_at).toLocaleDateString()}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {['Профиль', 'Чаты', 'Проверить'].map(label => (
                        <button
                          key={label}
                          style={{
                            backgroundColor: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-muted)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = 'var(--text-main)';
                            e.currentTarget.style.borderColor = 'var(--accent)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                          }}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        onClick={async () => {
                          if (confirm('Точно удалить аккаунт?')) {
                            await axios.delete(`/api/accounts/${acc.id}`);
                            queryClient.invalidateQueries({ queryKey: ['accounts'] });
                          }
                        }}
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = '#ef4444';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                    Нет загруженных аккаунтов.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
