import { useEffect, useState } from 'react';

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
