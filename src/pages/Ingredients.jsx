import { useMemo, useState } from 'react';
import { INGREDIENT_CATEGORIES, setIngredientPrice } from '../store.js';
import { UNITS, INPUT_UNITS, bigUnitPrice, fmtDate, fmtQty, money, uid, usedIn, toBase } from '../calc.js';
import { Empty, Field, Modal, Num, confirmDelete } from '../components/ui.jsx';

function packInputUnit(ing) {
  if (ing.baseUnit === 'g') return ing.packQty >= 1000 && ing.packQty % 1000 === 0 ? 'kg' : 'g';
  if (ing.baseUnit === 'ml') return ing.packQty >= 1000 && ing.packQty % 1000 === 0 ? 'l' : 'ml';
  return 'pcs';
}

export default function Ingredients({ state, update, costs, go }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editId, setEditId] = useState(null);
  const cur = state.settings.currency;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.ingredients
      .filter((i) => (!s || i.name.toLowerCase().includes(s)) && (!cat || i.category === cat))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [state.ingredients, q, cat]);

  const add = () => {
    const id = uid();
    update((d) => {
      d.ingredients.push({ id, name: 'Новий інгредієнт', category: 'Основа', baseUnit: 'g', packQty: 1000, packPrice: 0, note: '', updatedAt: new Date().toISOString(), history: [] });
    });
    setEditId(id);
  };

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Інгредієнти й пакування</h1>
          <p className="muted">Змініть ціну — собівартість усіх техкарт перерахується автоматично.</p>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => go('ai')}>✨ Внести чек через AI</button>
          <button className="btn primary" onClick={add}>+ Додати</button>
        </div>
      </header>

      <div className="toolbar">
        <input className="search" placeholder="Пошук…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Усі категорії</option>
          {INGREDIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <Empty icon="🧈" title="Інгредієнтів поки немає">Додайте вручну або вставте чек у вкладці «AI-помічник».</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Назва</th>
                <th>Категорія</th>
                <th className="r">Упаковка</th>
                <th className="r">Ціна упаковки</th>
                <th className="r">За кг / л / шт</th>
                <th className="r">Техкарт</th>
                <th>Оновлено</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const uses = usedIn(state, 'ing', i.id).length;
                const u = UNITS[i.baseUnit] || UNITS.pcs;
                return (
                  <tr key={i.id}>
                    <td><button className="link" onClick={() => setEditId(i.id)}>{i.name}</button></td>
                    <td><span className="tag">{i.category}</span></td>
                    <td className="r">{fmtQty(i.packQty, i.baseUnit)}</td>
                    <td className="r">
                      <Num
                        className="inline"
                        value={i.packPrice}
                        aria-label={`Ціна упаковки: ${i.name}`}
                        onCommit={(v) => update((d) => setIngredientPrice(d, i.id, { packPrice: v }))}
                      />
                    </td>
                    <td className="r strong">{money(bigUnitPrice(i), cur)}<span className="muted"> /{u.big}</span></td>
                    <td className="r">{uses || <span className="muted">—</span>}</td>
                    <td className="muted small">{i.updatedAt ? fmtDate(i.updatedAt) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editId && <IngredientModal id={editId} state={state} update={update} costs={costs} onClose={() => setEditId(null)} />}
    </section>
  );
}

function IngredientModal({ id, state, update, costs, onClose }) {
  const ing = state.ingredients.find((i) => i.id === id);
  const [packUnit, setPackUnit] = useState(() => (ing ? packInputUnit(ing) : 'g'));
  if (!ing) return null;
  const cur = state.settings.currency;
  const f = INPUT_UNITS[packUnit]?.f || 1;
  const uses = usedIn(state, 'ing', id);

  const set = (patch) => update((d) => Object.assign(d.ingredients.find((x) => x.id === id), patch));
  const changeBase = (baseUnit) => {
    const pu = baseUnit === 'g' ? 'kg' : baseUnit === 'ml' ? 'l' : 'pcs';
    setPackUnit(pu);
    set({ baseUnit });
  };
  const remove = () => {
    const msg = uses.length ? `інгредієнт «${ing.name}»? Він використовується в ${uses.length} техкартах — ці рядки стануть порожніми` : `інгредієнт «${ing.name}»`;
    if (!confirmDelete(msg)) return;
    update((d) => { d.ingredients = d.ingredients.filter((x) => x.id !== id); });
    onClose();
  };

  return (
    <Modal title="Інгредієнт" onClose={onClose} wide
      footer={<><button className="btn danger ghost" onClick={remove}>Видалити</button><span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      <div className="grid2">
        <Field label="Назва"><input value={ing.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <Field label="Категорія">
          <select value={ing.category} onChange={(e) => set({ category: e.target.value })}>
            {INGREDIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Облік у" hint="У чому вказувати кількість у техкартах">
          <select value={ing.baseUnit} onChange={(e) => changeBase(e.target.value)}>
            <option value="g">грамах (г)</option>
            <option value="ml">мілілітрах (мл)</option>
            <option value="pcs">штуках (шт)</option>
          </select>
        </Field>
        <Field label="Розмір упаковки">
          <div className="row gap">
            <Num value={ing.packQty / f} onCommit={(v) => update((d) => setIngredientPrice(d, id, { packQty: toBase(v, packUnit).qty }))} />
            <select value={packUnit} onChange={(e) => setPackUnit(e.target.value)}>
              {Object.entries(INPUT_UNITS).filter(([, u]) => u.base === ing.baseUnit).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
            </select>
          </div>
        </Field>
        <Field label={`Ціна упаковки, ${cur}`}>
          <Num value={ing.packPrice} onCommit={(v) => update((d) => setIngredientPrice(d, id, { packPrice: v }))} />
        </Field>
        <Field label="Ціна за одиницю">
          <div className="readout">{money(bigUnitPrice(ing), cur)} / {UNITS[ing.baseUnit]?.big}</div>
        </Field>
      </div>
      <Field label="Примітка (постачальник, бренд…)"><input value={ing.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>

      <h4>Де використовується</h4>
      {uses.length === 0 ? <p className="muted">Ще не додано в жодну техкарту.</p> : (
        <ul className="plain">
          {uses.map((r) => {
            const c = costs.get(r.id);
            const lineCost = c?.lines.filter((l) => l.type === 'ing' && r.items.find((it) => it.id === l.id)?.refId === id).reduce((s, l) => s + l.cost, 0) || 0;
            return <li key={r.id}>{r.emoji} {r.name} — {money(lineCost, cur)} на заміс <span className="muted">({money(c?.perPiece, cur)} собівартість 1 шт)</span></li>;
          })}
        </ul>
      )}

      <h4>Історія цін</h4>
      {(ing.history || []).length === 0 ? <p className="muted">Ціна ще не змінювалася.</p> : (
        <table className="table compact">
          <thead><tr><th>Дата</th><th className="r">Упаковка</th><th className="r">Ціна</th><th className="r">За кг/л/шт</th></tr></thead>
          <tbody>
            {[...ing.history].reverse().map((h, k) => (
              <tr key={k}>
                <td>{fmtDate(h.date)}</td>
                <td className="r">{fmtQty(h.packQty, ing.baseUnit)}</td>
                <td className="r">{money(h.packPrice, cur)}</td>
                <td className="r">{money(bigUnitPrice({ ...ing, ...h }), cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
