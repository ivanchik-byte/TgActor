import { useState, useRef } from 'react';
import { ArrowUp, ArrowDown, X, Paperclip } from 'lucide-react';

export default function Scenarios() {
  const [isActive, setIsActive] = useState(true);
  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);
  const [file1Name, setFile1Name] = useState('');
  const [file2Name, setFile2Name] = useState('');

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

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'auto' as any,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '6px',
    fontWeight: 500,
  };

  const btnAccent: React.CSSProperties = {
    backgroundColor: 'var(--accent)',
    color: '#fff',
    padding: '8px 18px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  };

  const btnSecondary: React.CSSProperties = {
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-muted)',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const btnIcon: React.CSSProperties = {
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-muted)',
    padding: '5px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const focusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    e.currentTarget.style.borderColor = 'var(--accent)';
  const blurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    e.currentTarget.style.borderColor = 'var(--border-color)';

  // Custom checkbox component
  const Checkbox = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
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
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', transition: 'color 0.15s' }}>
        {label}
      </span>
    </label>
  );

  // Replica card component
  const ReplicaCard = ({
    number,
    defaultRole,
    defaultType,
    defaultText,
    defaultReactions,
    defaultReactionCount,
    fileRef,
    fileName,
    onFileSelect,
  }: {
    number: number;
    defaultRole: string;
    defaultType: string;
    defaultText: string;
    defaultReactions: string;
    defaultReactionCount: number;
    fileRef: React.RefObject<HTMLInputElement | null>;
    fileName: string;
    onFileSelect: (name: string) => void;
  }) => (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '14px',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            backgroundColor: 'var(--accent)',
            color: '#fff',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
          }}>
            {number}
          </span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>
            Реплика
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            style={btnIcon}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            style={btnIcon}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            style={{
              ...btnIcon,
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderColor: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              marginLeft: '4px',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'; e.currentTarget.style.color = '#ef4444'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Role + Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Аккаунт (роль №)</label>
            <select style={selectStyle} defaultValue={defaultRole} onFocus={focusHandler as any} onBlur={blurHandler as any}>
              <option>1</option>
              <option>2</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Тип сообщения</label>
            <select style={selectStyle} defaultValue={defaultType} onFocus={focusHandler as any} onBlur={blurHandler as any}>
              <option>Обычное сообщение</option>
              <option>Ответ (reply) на реплику 1</option>
            </select>
          </div>
        </div>

        {/* Text */}
        <div>
          <label style={labelStyle}>Текст реплики</label>
          <textarea
            rows={2}
            defaultValue={defaultText}
            style={{ ...inputStyle, resize: 'vertical' as const }}
            onFocus={focusHandler as any}
            onBlur={blurHandler as any}
          />
        </div>

        {/* Intervals + Reactions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Интервал перед, мин (сек)</label>
            <select style={{ ...selectStyle, color: 'var(--text-muted)' }} onFocus={focusHandler as any} onBlur={blurHandler as any}>
              <option>из сценария</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Интервал перед, макс (сек)</label>
            <select style={{ ...selectStyle, color: 'var(--text-muted)' }} onFocus={focusHandler as any} onBlur={blurHandler as any}>
              <option>из сценария</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Реакции (эмодзи через пробел)</label>
            <input
              type="text"
              defaultValue={defaultReactions}
              style={inputStyle}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />
          </div>
          <div>
            <label style={labelStyle}>Кол-во реакций</label>
            <input
              type="number"
              defaultValue={defaultReactionCount}
              style={inputStyle}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />
          </div>
        </div>

        {/* File + Checkbox */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                ref={fileRef}
                type="file"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  onFileSelect(f ? f.name : '');
                }}
              />
              <button
                style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => fileRef.current?.click()}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
              >
                <Paperclip className="w-3 h-3" />
                Обзор...
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {fileName || 'Файл не выбран.'}
              </span>
            </div>
            <Checkbox
              checked={false}
              onChange={() => {}}
              label="Не начинать беседу, если вложение запрещено в группе"
            />
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
          <button
            style={btnAccent}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
          >
            Сохранить реплику
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '48px' }}>
      {/* Parameters Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>Параметры сценария</h2>
          <Checkbox checked={isActive} onChange={setIsActive} label="Активен" />
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Название</label>
              <input
                type="text"
                defaultValue="test_1"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Интервал по умолчанию, мин (сек)</label>
                <input type="number" defaultValue={30} style={inputStyle} onFocus={focusHandler} onBlur={blurHandler} />
              </div>
              <div>
                <label style={labelStyle}>Интервал по умолчанию, макс (сек)</label>
                <input type="number" defaultValue={60} style={inputStyle} onFocus={focusHandler} onBlur={blurHandler} />
              </div>
              <div>
                <label style={labelStyle}>Реакций на сообщение по умолчанию</label>
                <input type="number" defaultValue={0} style={inputStyle} onFocus={focusHandler} onBlur={blurHandler} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Заметки (для себя)</label>
              <textarea
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' as const }}
                onFocus={focusHandler as any}
                onBlur={blurHandler as any}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
              <button
                style={btnAccent}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
              >
                Сохранить параметры
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Replicas */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-main)' }}>Реплики</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <ReplicaCard
            number={1}
            defaultRole="1"
            defaultType="Обычное сообщение"
            defaultText="Я вообще не знаю как можно выжить в этой стране, я зарабатываю 3000$ в месяц и я в ахуе просто"
            defaultReactions="👍 🔥 ❤️"
            defaultReactionCount={3}
            fileRef={fileRef1}
            fileName={file1Name}
            onFileSelect={setFile1Name}
          />

          <ReplicaCard
            number={2}
            defaultRole="2"
            defaultType="Ответ (reply) на реплику 1"
            defaultText={`Очередной "успешный". Деньги не проблема? Лучше реши чью-то проблему, а не выебуйся`}
            defaultReactions="👍"
            defaultReactionCount={2}
            fileRef={fileRef2}
            fileName={file2Name}
            onFileSelect={setFile2Name}
          />
        </div>
      </div>
    </div>
  );
}
