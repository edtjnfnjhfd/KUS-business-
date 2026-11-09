import { useEffect, useMemo, useState } from 'react';
import { useStore } from './store.js';
import { computeCosts } from './calc.js';
import POS from './pages/POS.jsx';
import Reports from './pages/Reports.jsx';
import Recipes from './pages/Recipes.jsx';
import Ingredients from './pages/Ingredients.jsx';
import Sales from './pages/Sales.jsx';
import Expenses from './pages/Expenses.jsx';
import Assistant from './pages/Assistant.jsx';
import Settings from './pages/Settings.jsx';

const TABS = [
  { id: 'pos', icon: '🧾', label: 'Каса', C: POS },
  { id: 'reports', icon: '📊', label: 'Звіти', C: Reports },
  { id: 'recipes', icon: '📋', label: 'Техкарти', C: Recipes },
  { id: 'ingredients', icon: '🧈', label: 'Інгредієнти', C: Ingredients },
  { id: 'sales', icon: '🛍️', label: 'Продажі', C: Sales },
  { id: 'expenses', icon: '💸', label: 'Витрати', C: Expenses },
  { id: 'ai', icon: '✨', label: 'AI-помічник', C: Assistant },
  { id: 'settings', icon: '⚙️', label: 'Налаштування', C: Settings },
];

function initialTab() {
  const h = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? h : 'pos';
}

export default function App() {
  const store = useStore();
  const { state, saveError } = store;
  const [tab, setTab] = useState(initialTab);
  const costs = useMemo(() => computeCosts(state), [state.ingredients, state.recipes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', state.settings.accent || '#c8743a');
    document.title = `${state.settings.brandName || 'KUS'} — облік`;
  }, [state.settings.accent, state.settings.brandName]);

  const Current = TABS.find((t) => t.id === tab).C;
  const props = { ...store, costs, go: setTab };

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          {state.settings.logo ? <img src={state.settings.logo} alt="" className="logo" /> : <div className="logo-ph">🍪</div>}
          <div>
            <div className="brand-name">{state.settings.brandName || 'KUS'}</div>
            <div className="brand-tag">{state.settings.tagline}</div>
          </div>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} className={'nav-btn' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
              <span className="nav-ic" aria-hidden>{t.icon}</span>
              <span className="nav-lb">{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        {saveError && <div className="alert err">{saveError}</div>}
        <Current {...props} />
      </main>
    </div>
  );
}
