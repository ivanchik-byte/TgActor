import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Upload, Loader2, Phone, Folder, RefreshCw, Trash2, User, X, Shield, Plus } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'tdata' | 'phone'>('tdata');
  
  // Phone login state
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');

  // TData state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Profile Details Modal State
  const [selectedProfileAccount, setSelectedProfileAccount] = useState<any | null>(null);

  // Confirm delete account ID state
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<number | null>(null);

  // Toast notification state
  const [toasts, setToasts] = useState<{ id: string; text: string; type: 'success' | 'error' | 'info' }[]>([]);

  // Edit proxy state
  const [editingProxyAccount, setEditingProxyAccount] = useState<any | null>(null);
  const [selectedProxyId, setSelectedProxyId] = useState<number | null>(null);

  // Proxy management state
  const [showAddProxy, setShowAddProxy] = useState(false);
  const [proxyInput, setProxyInput] = useState('');
  const [proxyProtocol, setProxyProtocol] = useState('socks5');
  const [confirmDeleteProxyId, setConfirmDeleteProxyId] = useState<number | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Fetch accounts (ordered correctly on backend!)
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data
  });

  // Fetch proxies
  const { data: proxies = [] } = useQuery({
    queryKey: ['proxies'],
    queryFn: async () => (await axios.get('/api/proxies')).data
  });

  const updateProxy = useMutation({
    mutationFn: async ({ accountId, proxyId }: { accountId: number, proxyId: number | null }) => {
      await axios.patch(`/api/accounts/${accountId}/proxy`, { proxy_id: proxyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setEditingProxyAccount(null);
      showToast('Прокси успешно обновлен!', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось обновить прокси!', 'error');
    }
  });

  const addProxy = useMutation({
    mutationFn: async () => {
      // Parse proxy lines: ip:port, ip:port:user:pass, or ip:port:protocol:user:pass
      const lines = proxyInput.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2) continue;
        const ip = parts[0];
        const port = parseInt(parts[1]);
        let username = null, password = null;
        let protocol = proxyProtocol;
        if (parts.length === 4) {
          username = parts[2];
          password = parts[3];
        } else if (parts.length >= 5) {
          protocol = parts[2];
          username = parts[3];
          password = parts[4];
        }
        await axios.post('/api/proxies', { ip, port, protocol, username, password });
      }
    },
    onSuccess: () => {
      setProxyInput('');
      setShowAddProxy(false);
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      showToast('Прокси успешно добавлены!', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка!', 'error')
  });

  const deleteProxy = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/proxies/${id}`),
    onSuccess: () => {
      setConfirmDeleteProxyId(null);
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      showToast('Прокси удалён.', 'info');
    }
  });

  const requestPhoneCode = useMutation({
    mutationFn: async () => axios.post('/api/accounts/send-code', { phone, api_id: apiId, api_hash: apiHash }),
    onSuccess: (res) => {
      setPhoneCodeHash(res.data.phone_code_hash);
      setStep(2);
      showToast('Код авторизации успешно запрошен!', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось отправить код!', 'error');
    }
  });

  const submitCode = useMutation({
    mutationFn: async () => axios.post('/api/accounts/sign-in', { phone, phone_code_hash: phoneCodeHash, code, password }),
    onSuccess: (res) => {
      if (res.data?.need_password) {
        setNeedPassword(true);
        showToast('Требуется двухфакторный пароль!', 'info');
      } else {
        setStep(1);
        setPhone('');
        setApiId('');
        setApiHash('');
        setCode('');
        setPassword('');
        setNeedPassword(false);
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        showToast('Аккаунт успешно авторизован!', 'success');
      }
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Неверный код авторизации!', 'error');
    }
  });

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
      showToast('Сессии поставлены в очередь импорта!', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Не удалось импортировать tdata!', 'error');
    }
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('Аккаунт успешно удален из базы данных!', 'success');
    },
    onError: (err: any) => {
      showToast(`Не удалось удалить аккаунт: ${err?.response?.data?.detail || err.message}`, 'error');
    }
  });

  // Test account connection mutation
  const testConnection = useMutation({
    mutationFn: async (id: number) => (await axios.post(`/api/accounts/${id}/test`)).data,
    onSuccess: (data) => {
      if (data.status === 'ok') {
        showToast(data.message, 'success');
      } else {
        showToast(data.message, 'error');
      }
    },
    onError: (err: any) => {
      showToast(`Ошибка соединения: ${err?.response?.data?.detail || err.message}`, 'error');
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const zipFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.zip'));
      if (zipFiles.length > 0) {
        setSelectedFiles(zipFiles);
        showToast(`Перетащено файлов: ${zipFiles.length} шт.`, 'info');
      } else {
        showToast('Пожалуйста, перетаскивайте только файлы в формате .zip!', 'error');
      }
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (activeTab !== 'tdata') return;
      
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const zipFiles = Array.from(files).filter(f => f.name.endsWith('.zip'));
        if (zipFiles.length > 0) {
          setSelectedFiles(zipFiles);
          showToast(`Файлы вставлены из буфера обмена: ${zipFiles.length} шт.`, 'info');
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [activeTab]);

  // Shared Styles
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '24px',
    transition: 'all 0.2s',
  };

  const tabButtonStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '12px',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: isActive ? 'var(--accent)' : 'transparent',
    color: isActive ? '#fff' : 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.15s ease',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '13px',
    color: 'var(--text-main)',
    outline: 'none',
    transition: 'all 0.15s ease',
  };

  const btnAccent: React.CSSProperties = {
    backgroundColor: 'var(--accent)',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const btnSecondary: React.CSSProperties = {
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-muted)',
    padding: '10px 16px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const actionBtnStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color)',
    color: 'var(--text-muted)',
    padding: '6px 0',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Custom Toast Notifications */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 9999,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            backgroundColor: t.type === 'error' ? '#ef4444' : t.type === 'info' ? '#3b82f6' : '#22c55e',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Profile Details Modal */}
      {selectedProfileAccount && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            ...cardStyle,
            width: '400px',
            backgroundColor: 'var(--bg-card)',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>Профиль аккаунта</h3>
              <button 
                onClick={() => setSelectedProfileAccount(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent-text)',
                fontSize: '24px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-color)',
              }}>
                {(selectedProfileAccount.first_name || selectedProfileAccount.username || '?')[0]?.toUpperCase()}
              </div>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  {selectedProfileAccount.first_name || selectedProfileAccount.username || 'Без имени'}
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {selectedProfileAccount.username ? `@${selectedProfileAccount.username}` : 'Юзернейм отсутствует'}
                </span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: 'var(--bg-main)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              fontSize: '13px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>ID аккаунта:</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{selectedProfileAccount.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Телефон:</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{selectedProfileAccount.phone || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Источник:</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600, textTransform: 'uppercase' }}>{selectedProfileAccount.source_type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Статус сессии:</span>
                <span style={{ color: selectedProfileAccount.status === 'active' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                  {selectedProfileAccount.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Прокси-сервер:</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                  {selectedProfileAccount.proxy_id ? `ID = ${selectedProfileAccount.proxy_id}` : 'Не привязан'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Создан:</span>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(selectedProfileAccount.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <button onClick={() => setSelectedProfileAccount(null)} style={btnAccent}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Edit Proxy Modal */}
      {editingProxyAccount && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            ...cardStyle,
            width: '380px',
            backgroundColor: 'var(--bg-card)',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                Изменение прокси
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Выберите прокси-сервер для аккаунта {editingProxyAccount.first_name || editingProxyAccount.username || `acc #${editingProxyAccount.id}`}:
              </p>
              
              <select
                value={selectedProxyId || ""}
                onChange={(e) => setSelectedProxyId(e.target.value ? Number(e.target.value) : null)}
                style={inputStyle}
              >
                <option value="">Без прокси (Прямое подключение)</option>
                {proxies.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    ID {p.id}: {p.ip}:{p.port} ({p.protocol})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setEditingProxyAccount(null)}
                style={{ ...btnSecondary, flex: 1 }}
              >
                Отмена
              </button>
              <button
                onClick={() => updateProxy.mutate({ accountId: editingProxyAccount.id, proxyId: selectedProxyId })}
                disabled={updateProxy.isPending}
                style={{ ...btnAccent, flex: 1 }}
              >
                {updateProxy.isPending ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmDeleteAccountId !== null && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            ...cardStyle,
            width: '380px',
            backgroundColor: 'var(--bg-card)',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                Подтверждение удаления
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                Вы действительно хотите удалить этот аккаунт из базы данных? Это действие необратимо и сотрет все привязанные сессии.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  deleteAccount.mutate(confirmDeleteAccountId);
                  setConfirmDeleteAccountId(null);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
              >
                Удалить
              </button>
              <button
                onClick={() => setConfirmDeleteAccountId(null)}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', color: 'var(--text-main)' }}>
          Подключение аккаунтов
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
          Каждый аккаунт привязывается к выделенному прокси. Доступен импорт tdata сессий в zip-архиве либо прямая авторизация по номеру телефона.
        </p>
      </div>

      {/* Tabs & Form wrapper */}
      <div style={{ ...cardStyle, maxWidth: '640px' }}>
        {/* Tab Header Selector */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-main)',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px',
        }}>
          <button
            onClick={() => setActiveTab('tdata')}
            style={tabButtonStyle(activeTab === 'tdata')}
          >
            <Folder className="w-4 h-4" />
            TData Архив (.zip)
          </button>
          <button
            onClick={() => setActiveTab('phone')}
            style={tabButtonStyle(activeTab === 'phone')}
          >
            <Phone className="w-4 h-4" />
            Авторизация по SMS
          </button>
        </div>

        {/* Tab 1: TData Zip Uploader */}
        {activeTab === 'tdata' && (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '14px',
              border: isDragging ? '2px dashed var(--accent)' : '2px dashed var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              backgroundColor: isDragging ? 'var(--accent-soft)' : 'transparent',
              transition: 'all 0.2s ease',
              textAlign: 'center',
              cursor: 'pointer'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload style={{ width: '40px', height: '40px', color: isDragging ? 'var(--accent)' : 'var(--text-muted)', margin: '0 auto' }} />
            <div>
              <p style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>
                Перетащите сюда .zip файлы или нажмите для выбора
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
                Также можно скопировать .zip в проводнике (Ctrl+C) и просто вставить здесь (Ctrl+V)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            {/* Show Selected Files list if any */}
            {selectedFiles.length > 0 && (
              <div 
                style={{
                  textAlign: 'left',
                  backgroundColor: 'var(--bg-main)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  marginTop: '10px'
                }}
                onClick={(e) => e.stopPropagation()} // Prevent file picker
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Выбранные файлы:
                </div>
                {selectedFiles.map((file, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                    <button 
                      onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '11px'
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }} onClick={(e) => e.stopPropagation()}>
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
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploadTdata.isPending ? 'Загрузка...' : 'Импортировать'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: SMS Authentication */}
        {activeTab === 'phone' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: '1.5' }}>
              Введите номер телефона в международном формате и API-данные от my.telegram.org. Мы запросим официальный код входа.
            </p>

            {step === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Номер телефона (+7999...)"
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
                    disabled={requestPhoneCode.isPending || !phone}
                    style={{
                      ...btnAccent,
                      opacity: requestPhoneCode.isPending || !phone ? 0.5 : 1,
                      marginTop: '4px',
                    }}
                  >
                    {requestPhoneCode.isPending ? 'Запрос отправлен...' : 'Отправить запрос'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Введите код авторизации"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
                {needPassword && (
                  <input
                    type="password"
                    placeholder="Введите 2FA пароль"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={inputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => submitCode.mutate()}
                    disabled={submitCode.isPending || !code || (needPassword && !password)}
                    style={{
                      ...btnAccent,
                      opacity: submitCode.isPending || !code || (needPassword && !password) ? 0.5 : 1,
                    }}
                  >
                    {submitCode.isPending ? 'Вход...' : 'Подтвердить код'}
                  </button>
                  <button
                    style={btnSecondary}
                    onClick={() => { setStep(1); setCode(''); setNeedPassword(false); setPassword(''); }}
                  >
                    Назад
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid of Profile Cards */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
            Активные аккаунты ({accounts.length})
          </h3>
          <button
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px' }}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['accounts'] })}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Обновить статус
          </button>
        </div>

        {accounts.length === 0 && !isLoading ? (
          <div style={{
            ...cardStyle,
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--text-muted)',
            borderStyle: 'dashed'
          }}>
            <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p style={{ fontSize: '14px', fontWeight: 500 }}>Список подключенных аккаунтов пуст</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Воспользуйтесь формой выше, чтобы добавить аккаунт.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}>
            {accounts.map((acc: any) => {
              const name = acc.first_name || acc.username || 'Без имени';
              const initial = name[0]?.toUpperCase() || '?';
              const statusColor = acc.status === 'active' ? '#22c55e' : '#ef4444';

              return (
                <div key={acc.id} style={{
                  ...cardStyle,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  justifyContent: 'space-between',
                  border: '1px solid var(--border-color)',
                  backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.01), rgba(255,255,255,0))',
                }}>
                  {/* Card Header: Avatar & Main info */}
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '16px',
                      border: '1px solid var(--border-color)',
                      position: 'relative'
                    }}>
                      {initial}
                      <span style={{
                        position: 'absolute',
                        bottom: '-3px',
                        right: '-3px',
                        fontSize: '9px',
                        fontWeight: 600,
                        backgroundColor: 'var(--bg-main)',
                        padding: '1px 4px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-muted)'
                      }}>
                        {acc.source_type}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--text-main)',
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {name}
                      </h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        {acc.phone || '—'}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <div style={{
                      backgroundColor: `${statusColor}15`,
                      border: `1px solid ${statusColor}30`,
                      color: statusColor,
                      padding: '3px 8px',
                      borderRadius: '20px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {acc.status}
                    </div>
                  </div>

                  {/* Card Body: Info pills */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backgroundColor: 'var(--bg-main)',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    fontSize: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Прокси-сервер</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                          {acc.proxy_id ? `ID = ${acc.proxy_id}` : 'Не привязан'}
                        </span>
                        <button
                          onClick={() => {
                            setEditingProxyAccount(acc);
                            setSelectedProxyId(acc.proxy_id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 4px',
                            textDecoration: 'underline'
                          }}
                        >
                          Изменить
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Добавлен</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(acc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Quick Actions */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
                    <button
                      onClick={() => setSelectedProfileAccount(acc)}
                      style={actionBtnStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = 'var(--text-main)';
                        e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      Профиль
                    </button>
                    <button
                      onClick={() => {
                        localStorage.setItem('selected_inbox_account_id', String(acc.id));
                        navigate('/inbox');
                      }}
                      style={actionBtnStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = 'var(--text-main)';
                        e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      Чаты
                    </button>
                    <button
                      onClick={() => testConnection.mutate(acc.id)}
                      disabled={testConnection.isPending && testConnection.variables === acc.id}
                      style={actionBtnStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = 'var(--text-main)';
                        e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      {testConnection.isPending && testConnection.variables === acc.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Тест'
                      )}
                    </button>

                    <button
                      onClick={() => setConfirmDeleteAccountId(acc.id)}
                      disabled={deleteAccount.isPending}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.06)',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        cursor: deleteAccount.isPending ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: deleteAccount.isPending ? 0.6 : 1
                      }}
                      onMouseEnter={e => {
                        if (!deleteAccount.isPending) {
                          e.currentTarget.style.backgroundColor = '#ef4444';
                          e.currentTarget.style.color = '#fff';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!deleteAccount.isPending) {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.06)';
                          e.currentTarget.style.color = '#ef4444';
                        }
                      }}
                    >
                      {deleteAccount.isPending && deleteAccount.variables === acc.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== PROXY MANAGEMENT SECTION ===== */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield className="w-5 h-5" style={{ color: 'var(--accent-text)' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>Управление прокси</h2>
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
              backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)'
            }}>{proxies.length}</span>
          </div>
          <button
            onClick={() => setShowAddProxy(!showAddProxy)}
            style={{
              backgroundColor: showAddProxy ? 'var(--bg-main)' : 'var(--accent)',
              color: showAddProxy ? 'var(--text-muted)' : '#fff',
              border: showAddProxy ? '1px solid var(--border-color)' : 'none',
              padding: '8px 14px', borderRadius: '8px', fontSize: '12px',
              fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s'
            }}
          >
            {showAddProxy ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddProxy ? 'Скрыть' : 'Добавить прокси'}
          </button>
        </div>

        {/* Add Proxy Form */}
        {showAddProxy && (
          <div style={{
            backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
            borderRadius: '12px', padding: '16px', marginBottom: '16px',
            display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Прокси (по одному на строку)
              </label>
              <textarea
                placeholder={"ip:port\nip:port:user:pass\n192.168.1.1:1080:admin:secret"}
                value={proxyInput}
                onChange={e => setProxyInput(e.target.value)}
                rows={4}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  lineHeight: '1.6'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Протокол
                </label>
                <select
                  value={proxyProtocol}
                  onChange={e => setProxyProtocol(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as const }}
                >
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP</option>
                </select>
              </div>
              <button
                onClick={() => addProxy.mutate()}
                disabled={!proxyInput.trim() || addProxy.isPending}
                style={{
                  ...btnAccent,
                  opacity: (!proxyInput.trim() || addProxy.isPending) ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                {addProxy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addProxy.isPending ? 'Добавляем...' : 'Добавить'}
              </button>
            </div>
          </div>
        )}

        {/* Delete Proxy Confirm */}
        {confirmDeleteProxyId && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '90%',
              display: 'flex', flexDirection: 'column', gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
            }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                Удалить этот прокси?
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => deleteProxy.mutate(confirmDeleteProxyId)}
                  style={{
                    flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none',
                    borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                  }}
                >Удалить</button>
                <button
                  onClick={() => setConfirmDeleteProxyId(null)}
                  style={{
                    backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)', borderRadius: '10px',
                    padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                  }}
                >Отмена</button>
              </div>
            </div>
          </div>
        )}

        {/* Proxy List */}
        {proxies.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px'
          }}>
            <Shield className="w-8 h-8" style={{ color: 'var(--border-color)', margin: '0 auto 8px' }} />
            <p style={{ fontWeight: 600 }}>Прокси не добавлены</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Нажмите «Добавить прокси» для импорта</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {proxies.map((p: any) => (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: '8px',
                  backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: p.status === 'active' ? '#10b981' : '#ef4444'
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                    {p.ip}:{p.port}
                  </span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, padding: '1px 5px',
                    borderRadius: '4px', backgroundColor: 'rgba(99,102,241,0.1)',
                    color: '#818cf8', textTransform: 'uppercase' as const
                  }}>
                    {p.protocol}
                  </span>
                  {p.username && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {p.username}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setConfirmDeleteProxyId(p.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center',
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
