import { useCallback, useEffect, useRef, useState } from 'react';

const parseNum = (t) => {
  const s = String(t).replace(/\s/g, '').replace(',', '.');
  if (s === '' || s === '-' || s === '.') return 0;
  return Number(s);
};
const show = (v) => (v === 0 || v ? String(v) : '');

/** Числове поле, яке дозволяє вводити кому і не «стрибає» під час набору. */
export function Num({ value, onChange, onCommit, className = '', ...rest }) {
  const [text, setText] = useState(show(value));
  useEffect(() => {
    if (parseNum(text) !== Number(value)) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={'num ' + className}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseNum(e.target.value);
        if (!Number.isNaN(v) && onChange) onChange(v);
      }}
      onBlur={() => {
        const v = parseNum(text);
        if (!Number.isNaN(v) && onCommit) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      {...rest}
    />
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={'field ' + className}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрити">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className={'stat' + (tone ? ' ' + tone : '')}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ icon = '🍪', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function PeriodPicker({ value, onChange, custom, onCustom, periods }) {
  return (
    <div className="period">
      <div className="chips">
        {periods.map((p) => (
          <button key={p.id} className={'chip' + (value === p.id ? ' on' : '')} onClick={() => onChange(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="row gap">
          <input type="date" value={custom.from || ''} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          <span>—</span>
          <input type="date" value={custom.to || ''} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}

export function confirmDelete(what) {
  return window.confirm(`Видалити ${what}? Цю дію не можна скасувати.`);
}

export function PageHead({ title, sub, children }) {
  return (
    <header className="page-head">
      <div className="ph-text">
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="ph-actions">{children}</div>}
    </header>
  );
}

export function Badge({ tone = 'grey', children }) {
  return <span className={'badge-pill ' + tone}>{children}</span>;
}

/** Перемикач-вкладки. options: [{id, label}] */
export function Seg({ value, onChange, options, className = '' }) {
  return (
    <div className={'chips ' + className} role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={'chip' + (value === o.id ? ' on' : '')} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Пошук і вибір клієнта (з можливістю швидко додати нового). */
export function CustomerPicker({ customers, value, onChange, onCreate, placeholder = 'Клієнт (ім’я або телефон)…' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const sel = customers.find((c) => c.id === value);
  const s = q.trim().toLowerCase();
  const digits = s.replace(/\D/g, '');
  const list = s
    ? customers.filter((c) => c.name.toLowerCase().includes(s) || (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits)) || (c.instagram || '').toLowerCase().includes(s)).slice(0, 8)
    : customers.slice(0, 8);
  if (sel) {
    return (
      <div className="cust-sel">
        <span className="avatar sm">{sel.name.slice(0, 1).toUpperCase()}</span>
        <span className="grow ellipsis"><b>{sel.name}</b>{sel.type === 'wholesale' && <Badge tone="blue">опт</Badge>} <span className="muted small">{sel.phone}</span></span>
        <button className="icon-btn" onClick={() => onChange('')} aria-label="Прибрати клієнта">✕</button>
      </div>
    );
  }
  return (
    <div className="picker">
      <input value={q} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (list.length > 0 || (s && onCreate)) && (
        <div className="picker-list">
          {list.map((c) => (
            <button key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(c.id); setQ(''); setOpen(false); }}>
              <b>{c.name}</b> <span className="muted small">{c.phone} {c.type === 'wholesale' ? '· опт' : ''}</span>
            </button>
          ))}
          {s && onCreate && (
            <button className="picker-new" onMouseDown={(e) => e.preventDefault()} onClick={() => { const id = onCreate(q.trim()); onChange(id); setQ(''); setOpen(false); }}>
              + Новий клієнт «{q.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Toast({ text }) {
  if (!text) return null;
  return <div className="toast" role="status">{text}</div>;
}

export function useToast() {
  const [text, setText] = useState('');
  const timer = useRef(null);
  const show = useCallback((t) => { setText(t); clearTimeout(timer.current); timer.current = setTimeout(() => setText(''), 2600); }, []);
  return [text, show];
}
