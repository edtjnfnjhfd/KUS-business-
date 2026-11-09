import { useMemo, useState } from 'react';
import { INGREDIENT_CATEGORIES } from '../store.js';
import { INPUT_UNITS, adjustmentValue, computeStock, dayKey, explode, fmtDate, fmtQty, money, round2, uid, unitPrice } from '../calc.js';
import { Empty, Field, Num, PageHead, Seg, Toast, confirmDelete, useToast } from '../components/ui.jsx';

const REASONS = ['Зіпсовано', 'Брак випічки', 'Прострочено', 'Дегустація / промо', 'Для себе', 'Інше'];

export default function Inventory({ state, update, can }) {
  const [mode, setMode] = useState('inventory');
  const [toast, showToast] = useToast();
  const hist = [...state.adjustments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
  const cur = state.settings.currency;
  return (
    <section>
      <PageHead title="Інвентаризація і списання" sub="Звірка фактичних залишків зі складом програми та списання зіпсованого або браку." />
      <Seg value={mode} onChange={setMode} options={[{ id: 'inventory', label: '⚖️ Інвентаризація' }, { id: 'writeoff', label: '🗑 Списання' }, { id: 'history', label: `Історія (${state.adjustments.length})` }]} />
      {mode === 'inventory' && <InventoryForm state={state} update={update} can={can} done={(m) => { showToast(m); setMode('history'); }} />}
      {mode === 'writeoff' && <WriteoffForm state={state} update={update} done={(m) => { showToast(m); setMode('history'); }} />}
      {mode === 'history' && (hist.length === 0 ? <Empty icon="⚖️" title="Ще не було інвентаризацій і списань" /> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Дата</th><th>Тип</th><th>Позиції</th>{can('costs') && <th className="r">Сума</th>}<th /></tr></thead>
            <tbody>
              {hist.map((a) => {
                const v = adjustmentValue(state, a);
                return (
                  <tr key={a.id}>
                    <td data-label="Дата" className="nowrap">{fmtDate(a.date)}</td>
                    <td data-label="Тип">{a.type === 'inventory' ? 'Інвентаризація' : 'Списання'}{a.note && <div className="muted small">{a.note}</div>}</td>
                    <td data-label="Позиції" className="small">{a.items.slice(0, 5).map((it) => { const ing = state.ingredients.find((i) => i.id === it.ingredientId); return `${ing?.name || '?'} ${it.qty > 0 ? '+' : ''}${fmtQty(Math.round(it.qty * 100) / 100, ing?.baseUnit)}`; }).join('; ')}{a.items.length > 5 ? ` … +${a.items.length - 5}` : ''}</td>
                    {can('costs') && <td data-label="Сума" className={'r nowrap strong ' + (v < 0 ? 'neg' : 'pos')}>{money(v, cur)}</td>}
                    <td><button className="icon-btn" onClick={() => confirmDelete('цей документ (залишки повернуться)') && update((d) => { d.adjustments = d.adjustments.filter((x) => x.id !== a.id); })} aria-label="Видалити">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <Toast text={toast} />
    </section>
  );
}

function InventoryForm({ state, update, can, done }) {
  const cur = state.settings.currency;
  const stock = useMemo(() => computeStock(state), [state]);
  const [cat, setCat] = useState('');
  const [fact, setFact] = useState({}); // id -> фактична кількість (у базових од.)
  const [note, setNote] = useState('');
  const list = state.ingredients.filter((i) => !cat || i.category === cat).sort((a, b) => a.name.localeCompare(b.name));
  const counted = Object.entries(fact).filter(([, v]) => v !== '' && v != null);
  const diffs = counted.map(([id, v]) => {
    const ing = state.ingredients.find((i) => i.id === id);
    const delta = Number(v) - (stock.get(id) || 0);
    return { id, ing, delta, value: delta * unitPrice(ing) };
  }).filter((x) => x.ing && Math.abs(x.delta) > 1e-6);
  const sum = diffs.reduce((s, x) => s + x.value, 0);

  const save = () => {
    if (!counted.length) return;
    update((d) => {
      d.adjustments.push({ id: uid(), date: new Date().toISOString(), type: 'inventory', note: note || `Інвентаризація: перераховано ${counted.length} позицій`, value: round2(sum), items: diffs.map((x) => ({ ingredientId: x.id, qty: Math.round(x.delta * 100) / 100 })) });
    });
    done(diffs.length ? `Інвентаризацію проведено: ${sum < 0 ? 'нестача' : 'надлишок'} ${money(Math.abs(sum), cur)}` : 'Інвентаризацію проведено: все збігається ✓');
  };

  return (
    <div className="card pad">
      <p className="muted">Зважте / порахуйте, що реально лежить на складі, і впишіть у колонку «Факт». Порожні рядки не змінюються.</p>
      <div className="toolbar">
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категорія">
          <option value="">Усі категорії</option>
          {INGREDIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="table compact stack">
          <thead><tr><th>Інгредієнт</th><th className="r">За програмою</th><th className="r">Факт</th><th className="r">Різниця</th></tr></thead>
          <tbody>
            {list.map((i) => {
              const have = stock.get(i.id) || 0;
              const f = fact[i.id];
              const delta = f !== undefined && f !== '' ? Number(f) - have : null;
              const ul = { g: 'г', ml: 'мл', pcs: 'шт' }[i.baseUnit];
              return (
                <tr key={i.id}>
                  <td data-label="Інгредієнт">{i.name}</td>
                  <td data-label="За програмою" className="r nowrap">{fmtQty(Math.round(have), i.baseUnit)}</td>
                  <td data-label="Факт" className="r nowrap"><input className="num qty-wide" inputMode="decimal" value={f ?? ''} placeholder="—" onChange={(e) => setFact({ ...fact, [i.id]: e.target.value.replace(',', '.') })} aria-label={`Факт ${i.name}`} /> <span className="muted small">{ul}</span></td>
                  <td data-label="Різниця" className={'r nowrap ' + (delta < 0 ? 'neg' : delta > 0 ? 'pos' : '')}>{delta == null ? '' : `${delta > 0 ? '+' : ''}${fmtQty(Math.round(delta), i.baseUnit)}`}{delta != null && can('costs') && Math.abs(delta) > 0 && <div className="small">{money(delta * unitPrice(i), cur)}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Field label="Коментар"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row between wrap gap">
        <span>Перераховано: <b>{counted.length}</b>{can('costs') && diffs.length > 0 && <> · результат: <b className={sum < 0 ? 'neg' : 'pos'}>{money(sum, cur)}</b></>}</span>
        <button className="btn primary" disabled={!counted.length} onClick={save}>Провести інвентаризацію</button>
      </div>
    </div>
  );
}

function WriteoffForm({ state, update, done }) {
  const cur = state.settings.currency;
  const [lines, setLines] = useState([{ key: uid(), ref: '', qty: 1, unit: 'pcs', reason: REASONS[0] }]);
  const [date, setDate] = useState(dayKey(new Date()));
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const compute = () => {
    const m = new Map();
    const reasons = new Map();
    for (const l of lines) {
      if (!l.ref || !(Number(l.qty) > 0)) continue;
      const [type, id] = l.ref.split(':');
      if (type === 'rec') {
        const ex = explode(state, id, Number(l.qty));
        for (const [iid, q] of ex) { m.set(iid, (m.get(iid) || 0) + q); reasons.set(iid, l.reason); }
      } else {
        const q = (Number(l.qty) || 0) * (INPUT_UNITS[l.unit]?.f || 1);
        m.set(id, (m.get(id) || 0) + q); reasons.set(id, l.reason);
      }
    }
    return [...m.entries()].map(([ingredientId, q]) => ({ ingredientId, qty: -Math.round(q * 100) / 100, reason: reasons.get(ingredientId) }));
  };
  const items = compute();
  const value = items.reduce((s, it) => s + it.qty * unitPrice(state.ingredients.find((i) => i.id === it.ingredientId)), 0);

  const save = () => {
    if (!items.length) return;
    const descr = lines.filter((l) => l.ref).map((l) => {
      const [type, id] = l.ref.split(':');
      const name = type === 'rec' ? state.recipes.find((r) => r.id === id)?.name : state.ingredients.find((i) => i.id === id)?.name;
      return `${name} × ${l.qty}${type === 'rec' ? ' шт' : ' ' + (INPUT_UNITS[l.unit]?.label || '')} (${l.reason})`;
    }).join(', ');
    update((d) => { d.adjustments.push({ id: uid(), date: new Date(date + 'T18:00').toISOString(), type: 'writeoff', note: descr, value: round2(value), items }); });
    done(`Списано на ${money(Math.abs(value), cur)}`);
  };

  return (
    <div className="card pad">
      <p className="muted">Можна списати і інгредієнт (наприклад, зіпсоване масло), і готову продукцію — тоді інгредієнти спишуться за техкартою.</p>
      <Field label="Дата"><input type="date" value={date} onChange={(e) => setDate(e.target.value || dayKey(new Date()))} /></Field>
      <div className="line-list">
        {lines.map((l) => {
          const [type, id] = (l.ref || ':').split(':');
          const ing = type === 'ing' ? state.ingredients.find((i) => i.id === id) : null;
          return (
            <div key={l.key} className="line-row wo-row">
              <select className="grow" value={l.ref} onChange={(e) => { const [t2, i2] = e.target.value.split(':'); const ni = state.ingredients.find((i) => i.id === i2); setLine(l.key, { ref: e.target.value, unit: t2 === 'rec' ? 'pcs' : ni?.baseUnit === 'g' ? 'g' : ni?.baseUnit === 'ml' ? 'ml' : 'pcs' }); }} aria-label="Що списати">
                <option value="">— що списати —</option>
                <optgroup label="Готова продукція (шт)">{state.recipes.map((r) => <option key={r.id} value={`rec:${r.id}`}>{r.emoji} {r.name}</option>)}</optgroup>
                <optgroup label="Інгредієнти">{[...state.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={`ing:${i.id}`}>{i.name}</option>)}</optgroup>
              </select>
              <span className="input-group w-qty">
                <Num value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} aria-label="Кількість" />
                {type === 'ing' && ing ? (
                  <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label="Одиниця">
                    {Object.entries(INPUT_UNITS).filter(([, u]) => u.base === ing.baseUnit).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
                  </select>
                ) : <span className="ig-text">шт</span>}
              </span>
              <select value={l.reason} onChange={(e) => setLine(l.key, { reason: e.target.value })} aria-label="Причина">{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
              <button className="icon-btn" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Прибрати">✕</button>
            </div>
          );
        })}
      </div>
      <button className="btn ghost small" onClick={() => setLines([...lines, { key: uid(), ref: '', qty: 1, unit: 'pcs', reason: REASONS[0] }])}>+ Рядок</button>
      <div className="row between wrap gap" style={{ marginTop: 12 }}>
        <span>Сума списання: <b className="neg">{money(Math.abs(value), cur)}</b></span>
        <button className="btn primary" disabled={!items.length} onClick={save}>Списати</button>
      </div>
    </div>
  );
}
