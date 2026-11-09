import { useState } from 'react';
import { ROLES } from '../store.js';

export default function LockScreen({ state, onLogin }) {
  const users = state.employees.filter((e) => e.active !== false && e.pin);
  const [sel, setSel] = useState(users.length === 1 ? users[0].id : '');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const user = users.find((u) => u.id === sel);

  const press = (d) => {
    setErr('');
    const p = (pin + d).slice(0, 8);
    setPin(p);
    if (user && p.length >= String(user.pin).length) {
      if (p === String(user.pin)) onLogin(user.id);
      else { setErr('Невірний PIN'); setPin(''); }
    }
  };

  return (
    <div className="lock">
      <div className="lock-card">
        <div className="lock-brand">
          {state.settings.logo ? <img src={state.settings.logo} alt="" className="logo" /> : <div className="logo-ph">🍪</div>}
          <b>{state.settings.brandName || 'KUS'}</b>
        </div>
        {!user ? (
          <>
            <p className="muted">Хто працює?</p>
            <div className="lock-users">
              {users.map((u) => (
                <button key={u.id} className="lock-user" onClick={() => { setSel(u.id); setPin(''); }}>
                  <span className="avatar">{u.name.slice(0, 1).toUpperCase()}</span>
                  <span>{u.name}</span>
                  <span className="muted small">{ROLES[u.role]}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p><b>{user.name}</b> · введіть PIN</p>
            <div className="pin-dots" aria-live="polite">
              {Array.from({ length: String(user.pin).length }, (_, k) => <i key={k} className={k < pin.length ? 'on' : ''} />)}
            </div>
            {err && <div className="neg small">{err}</div>}
            <div className="pinpad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, k) => (
                d === '' ? <span key={k} /> : (
                  <button key={k} onClick={() => (d === '⌫' ? setPin(pin.slice(0, -1)) : press(d))} aria-label={d === '⌫' ? 'Стерти' : d}>{d}</button>
                )
              ))}
            </div>
            {users.length > 1 && <button className="btn ghost small" onClick={() => { setSel(''); setPin(''); }}>← Інший працівник</button>}
          </>
        )}
      </div>
    </div>
  );
}
