import { useMemo, useState } from 'react';
import { INGREDIENT_CATEGORIES } from '../store.js';
import { computeStock, dayKey, fmtDate, fmtQty, money, unitPrice } from '../calc.js';
import { Badge, Empty, Modal, Num, PageHead, Seg, Stat } from '../components/ui.jsx';

export default function Stock({ state, update, go, can }) {
  const cur = state.settings.currency;
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [hist, setHist] = useState(null);
  const stock = useMemo(() => computeStock(state), [state]);

  const rows = state.ingredients.map((i) => {
    const have = stock.get(i.id) || 0;
    const min = Number(i.minStock) || 0;
    const st = have <= 0 ? 'out' : min > 0 && have < min ? 'low' : 'ok';
    return { ing: i, have, min, st, value: Math.max(0, have) * unitPrice(i) };
  }).filter((r) => (filter === 'all' || (filter === 'low' && r.st !== 'ok')) && (!cat || r.ing.category === cat) && (!q || r.ing.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ({ out: 0, low: 1, ok: 2 }[a.st] - { out: 0, low: 1, ok: 2 }[b.st]) || a.ing.name.localeCompare(b.ing.name));
  const all = state.ingredients.map((i) => ({ have: stock.get(i.id) || 0, i }));
  const totalValue = all.reduce((s, x) => s + Math.max(0, x.have) * unitPrice(x.i), 0);
  const lowCount = all.filter((x) => x.have <= 0 || ((Number(x.i.minStock) || 0) > 0 && x.have < x.i.minStock)).length;

  return (
    <section>
      <PageHead title="Залишки на складі" sub="Постачання додають, продажі списують за техкартами автоматично, інвентаризація вирівнює з фактом.">
        <button className="btn ghost" onClick={() => go('inventory')}>⚖️ Інвентаризація</button>
        <button className="btn primary" onClick={() => go('supplies')}>🚚 Нове постачання</button>
      </PageHead>
      <div className="stats stats-3">
        {can('costs') && <Stat label="Вартість залишків" value={money(totalValue, cur)} sub="за останніми цінами" />}
        <Stat label="Позицій" value={state.ingredients.length} />
        <Stat label="Закінчується" value={lowCount} tone={lowCount ? 'neg' : 'pos'} sub="нижче мінімуму або 0" />
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Пошук…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категорія">
          <option value="">Усі категорії</option>
          {INGREDIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <Seg value={filter} onChange={setFilter} options={[{ id: 'all', label: 'Усі' }, { id: 'low', label: `Докупити (${lowCount})` }]} className="no-mb" />
      </div>
      {rows.length === 0 ? <Empty icon="🏬" title="Нічого не знайдено" /> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Інгредієнт</th><th className="r">Залишок</th><th className="r">Мінімум</th><th>Стан</th>{can('costs') && <th className="r">Вартість</th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ing.id} className="clickable" onClick={() => setHist(r.ing.id)}>
                  <td data-label="Інгредієнт"><b>{r.ing.name}</b><div className="muted small">{r.ing.category}</div></td>
                  <td data-label="Залишок" className={'r strong nowrap ' + (r.have < 0 ? 'neg' : '')}>{fmtQty(Math.round(r.have * 100) / 100, r.ing.baseUnit)}</td>
                  <td data-label="Мінімум" className="r nowrap" onClick={(e) => e.stopPropagation()}>
                    <Num className="qty-wide" value={r.min} onCommit={(v) => update((d) => { d.ingredients.find((x) => x.id === r.ing.id).minStock = Math.max(0, v); })} aria-label="Мінімальний залишок" />
                    <span className="muted small"> {({ g: 'г', ml: 'мл', pcs: 'шт' })[r.ing.baseUnit]}</span>
                  </td>
                  <td data-label="Стан">{r.st === 'out' ? <Badge tone="red">немає</Badge> : r.st === 'low' ? <Badge tone="amber">мало</Badge> : <Badge tone="green">ок</Badge>}</td>
                  {can('costs') && <td data-label="Вартість" className="r nowrap">{money(r.value, cur)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Від’ємний залишок означає, що продали більше, ніж було оформлено постачань — внесіть постачання або проведіть інвентаризацію.</p>
      {hist && <HistoryModal id={hist} state={state} onClose={() => setHist(null)} />}
    </section>
  );
}

function HistoryModal({ id, state, onClose }) {
  const ing = state.ingredients.find((i) => i.id === id);
  const moves = [];
  for (const s of state.supplies) for (const it of s.items) if (it.ingredientId === id) moves.push({ date: s.date, qty: Number(it.qty), label: 'Постачання' + (s.supplier ? ` (${s.supplier})` : '') });
  for (const a of state.adjustments) for (const it of a.items) if (it.ingredientId === id) moves.push({ date: a.date, qty: Number(it.qty), label: a.type === 'inventory' ? 'Інвентаризація' : 'Списання' + (it.reason ? `: ${it.reason}` : '') });
  const byDay = new Map();
  for (const s of state.sales) for (const c of s.consumption || []) if (c.ingredientId === id) { const k = dayKey(s.date); byDay.set(k, (byDay.get(k) || 0) + c.qty); }
  for (const [k, q] of byDay) moves.push({ date: k + 'T23:59', qty: -q, label: 'Продажі за день' });
  moves.sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <Modal title={`Рух: ${ing.name}`} onClose={onClose}>
      {moves.length === 0 ? <p className="muted">Рухів ще не було.</p> : (
        <table className="table compact">
          <thead><tr><th>Дата</th><th>Операція</th><th className="r">К-сть</th></tr></thead>
          <tbody>{moves.slice(0, 200).map((m, k) => <tr key={k}><td className="nowrap">{fmtDate(m.date)}</td><td>{m.label}</td><td className={'r nowrap ' + (m.qty < 0 ? 'neg' : 'pos')}>{m.qty > 0 ? '+' : ''}{fmtQty(Math.round(m.qty * 100) / 100, ing.baseUnit)}</td></tr>)}</tbody>
        </table>
      )}
    </Modal>
  );
}

