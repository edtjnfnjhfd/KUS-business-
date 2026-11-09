import { useEffect, useMemo, useState } from 'react';
import { useStore } from './store.js';
import { computeCosts } from './calc.js';
import { NAV, ALL_PAGES, permsFor } from './nav.js';
import { useSync } from './sync.js';
import { useDailyTelegram } from './telegram.js';
import LockScreen from './components/LockScreen.jsx';
import { PrintHost } from './components/Print.jsx';

function initialTab() {
  const h = window.location.hash.replace('#', '');
  return ALL_PAGES.some((t) => t.id === h) ? h : 'pos';
}

export default function App() {
  const store = useStore();
  const { state, local, setLocal, saveError } = store;
  const [tab, setTab] = useState(initialTab);
  const [moreOpen, setMoreOpen] = useState(false);
  const costs = useMemo(() => computeCosts(state), [state.ingredients, state.recipes]); // eslint-disable-line react-hooks/exhaustive-deps
  const sync = useSync(store);
  useDailyTelegram(state, store.update);

  // Поточний працівник (якщо увімкнено вхід за PIN)
  const pinUsers = state.employees.filter((e) => e.active !== false && e.pin);
  const lockOn = state.settings.requirePin && pinUsers.length > 0;
  const user = state.employees.find((e) => e.id === local.employeeId) || null;
  const role = lockOn ? user?.role : 'owner';
  const can = useMemo(() => permsFor(role), [role]);

  const go = (id) => { setTab(id); setMoreOpen(false); window.scrollTo(0, 0); };
  useEffect(() => { window.location.hash = tab; }, [tab]);
  useEffect(() => {
    const onHash = () => { const h = window.location.hash.replace('#', ''); if (ALL_PAGES.some((t) => t.id === h)) setTab(h); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', state.settings.accent || '#c8743a');
    document.title = `${state.settings.brandName || 'KUS'} — облік`;
  }, [state.settings.accent, state.settings.brandName]);

  if (lockOn && !user) return <LockScreen state={state} onLogin={(id) => setLocal({ employeeId: id })} />;

  const allowed = ALL_PAGES.filter((p) => can(p.perm));
  const page = allowed.find((p) => p.id === tab) || allowed[0];
  const Current = page.C;
  const props = { ...store, costs, go, can, user, sync };
  const bottom = ['pos', 'orders', 'plan', 'reports'].map((id) => allowed.find((p) => p.id === id)).filter(Boolean).slice(0, 4);

  const Brand = (
    <div className="brand">
      {state.settings.logo ? <img src={state.settings.logo} alt="" className="logo" /> : <div className="logo-ph" aria-hidden>🍪</div>}
      <div className="brand-txt">
        <div className="brand-name">{state.settings.brandName || 'KUS'}</div>
        <div className="brand-tag">{state.settings.tagline}</div>
      </div>
    </div>
  );
  const UserChip = (
    <div className="user-chip">
      {sync.enabled && <span className={'sync-dot ' + sync.status} title={sync.message}>{sync.status === 'ok' ? '☁︎' : sync.status === 'error' ? '⚠︎' : '⟳'}</span>}
      {lockOn && user && (
        <button className="btn ghost small on-dark" onClick={() => setLocal({ employeeId: '' })} title="Змінити користувача">
          👤 {user.name}
        </button>
      )}
    </div>
  );

  return (
    <div className="app">
      <aside className="side">
        {Brand}
        <nav className="nav" aria-label="Розділи">
          {NAV.map((g) => {
            const items = g.items.filter((p) => can(p.perm));
            if (!items.length) return null;
            return (
              <div key={g.group} className="nav-group">
                {g.group && <div className="nav-title">{g.group}</div>}
                {items.map((t) => (
                  <button key={t.id} className={'nav-btn' + (page.id === t.id ? ' on' : '')} onClick={() => go(t.id)}>
                    <span className="nav-ic" aria-hidden>{t.icon}</span>
                    <span className="nav-lb">{t.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">{UserChip}</div>
      </aside>

      <header className="topbar">
        {Brand}
        {UserChip}
      </header>

      <main className="main">
        {saveError && <div className="alert err">{saveError}</div>}
        {sync.status === 'error' && sync.enabled && <div className="alert warn">Синхронізація: {sync.message}</div>}
        <Current {...props} key={page.id} />
      </main>

      <nav className="bottombar" aria-label="Швидкі розділи">
        {bottom.map((t) => (
          <button key={t.id} className={'bb-btn' + (page.id === t.id && !moreOpen ? ' on' : '')} onClick={() => go(t.id)}>
            <span aria-hidden>{t.icon}</span><span>{t.short || t.label}</span>
          </button>
        ))}
        <button className={'bb-btn' + (moreOpen || !bottom.some((b) => b.id === page.id) ? ' on' : '')} onClick={() => setMoreOpen((v) => !v)}>
          <span aria-hidden>☰</span><span>Ще</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-back" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Усі розділи">
            {NAV.map((g) => {
              const items = g.items.filter((p) => can(p.perm));
              if (!items.length) return null;
              return (
                <div key={g.group} className="sheet-group">
                  {g.group && <div className="nav-title">{g.group}</div>}
                  <div className="sheet-grid">
                    {items.map((t) => (
                      <button key={t.id} className={'sheet-btn' + (page.id === t.id ? ' on' : '')} onClick={() => go(t.id)}>
                        <span className="sheet-ic" aria-hidden>{t.icon}</span>
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <PrintHost />
    </div>
  );
}
