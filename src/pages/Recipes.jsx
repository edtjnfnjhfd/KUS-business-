import { useState } from 'react';
import { UNITS, marginInfo, money, num, pct, priceForMargin, uid, usedIn } from '../calc.js';
import { Empty, Field, Num, confirmDelete } from '../components/ui.jsx';

const EMOJIS = ['🍪', '🍫', '🥜', '🍓', '🍋', '🥥', '🍯', '🧁', '🎁', '☕', '🌰', '🍒', '🥨', '❤️'];

export default function Recipes(props) {
  const { state, update, costs } = props;
  const [openId, setOpenId] = useState(null);
  const cur = state.settings.currency;

  const add = () => {
    const id = uid();
    update((d) => {
      d.recipes.push({ id, name: 'Нова техкарта', category: 'Печиво', emoji: '🍪', yieldQty: 12, salePrice: 0, wastePct: 0, active: true, note: '', items: [], extras: [] });
    });
    setOpenId(id);
  };

  if (openId && state.recipes.some((r) => r.id === openId)) {
    return <RecipeEditor {...props} id={openId} onBack={() => setOpenId(null)} onOpen={setOpenId} />;
  }

  const groups = {};
  for (const r of state.recipes) (groups[r.category || 'Інше'] ||= []).push(r);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Техкарти</h1>
          <p className="muted">Рецептури з розрахунком собівартості. Набори можна складати з інших техкарт.</p>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => props.go('ai')}>✨ Рецепт текстом → техкарта</button>
          <button className="btn primary" onClick={add}>+ Нова техкарта</button>
        </div>
      </header>

      {state.recipes.length === 0 && <Empty icon="📋" title="Техкарт ще немає">Створіть першу — додайте інгредієнти й вихід, і собівартість порахується сама.</Empty>}

      {Object.entries(groups).map(([g, rs]) => (
        <div key={g}>
          <h3 className="group-title">{g}</h3>
          <div className="cards">
            {rs.map((r) => {
              const c = costs.get(r.id) || { perPiece: 0 };
              const m = marginInfo(c.perPiece, r.salePrice);
              const low = r.salePrice > 0 && m.marginPct < 50;
              return (
                <button key={r.id} className="card recipe-card" onClick={() => setOpenId(r.id)}>
                  <div className="rc-top">
                    <span className="rc-emoji">{r.emoji || '🍪'}</span>
                    <span className="rc-name">{r.name}</span>
                    {!r.active && <span className="tag">не в касі</span>}
                  </div>
                  <div className="rc-grid">
                    <div><span className="muted small">Собівартість</span><b>{money(c.perPiece, cur)}</b></div>
                    <div><span className="muted small">Ціна</span><b>{r.salePrice ? money(r.salePrice, cur) : '—'}</b></div>
                    <div><span className="muted small">Прибуток / шт</span><b>{r.salePrice ? money(m.profit, cur) : '—'}</b></div>
                    <div><span className="muted small">Маржа</span><b className={low ? 'warn-text' : ''}>{r.salePrice ? pct(m.marginPct) : '—'}</b></div>
                  </div>
                  {c.error === 'cycle' && <div className="alert err small">Техкарта посилається сама на себе</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function RecipeEditor({ state, update, costs, id, onBack, onOpen }) {
  const r = state.recipes.find((x) => x.id === id);
  const c = costs.get(id) || { batch: 0, perPiece: 0, lines: [] };
  const cur = state.settings.currency;
  const m = marginInfo(c.perPiece, r.salePrice);
  const target = state.settings.targetMargin || 65;
  const recommended = priceForMargin(c.perPiece, target);

  const set = (patch) => update((d) => Object.assign(d.recipes.find((x) => x.id === id), patch));
  const setItem = (itemId, patch) => update((d) => Object.assign(d.recipes.find((x) => x.id === id).items.find((i) => i.id === itemId), patch));
  const removeItem = (itemId) => update((d) => { const rr = d.recipes.find((x) => x.id === id); rr.items = rr.items.filter((i) => i.id !== itemId); });
  const moveItem = (itemId, dir) => update((d) => {
    const items = d.recipes.find((x) => x.id === id).items;
    const k = items.findIndex((i) => i.id === itemId);
    const j = k + dir;
    if (j < 0 || j >= items.length) return;
    [items[k], items[j]] = [items[j], items[k]];
  });
  const addItem = () => update((d) => {
    const first = d.ingredients[0];
    d.recipes.find((x) => x.id === id).items.push({ id: uid(), type: 'ing', refId: first?.id || '', qty: 0, perPiece: false });
  });
  const setExtra = (eid, patch) => update((d) => Object.assign(d.recipes.find((x) => x.id === id).extras.find((e) => e.id === eid), patch));
  const addExtra = () => update((d) => { d.recipes.find((x) => x.id === id).extras.push({ id: uid(), name: 'Інше', amount: 0 }); });
  const removeExtra = (eid) => update((d) => { const rr = d.recipes.find((x) => x.id === id); rr.extras = rr.extras.filter((e) => e.id !== eid); });

  const duplicate = () => {
    const nid = uid();
    update((d) => {
      const src = d.recipes.find((x) => x.id === id);
      d.recipes.push({ ...structuredClone(src), id: nid, name: src.name + ' (копія)', items: src.items.map((i) => ({ ...i, id: uid() })), extras: src.extras.map((e) => ({ ...e, id: uid() })) });
    });
    onOpen(nid);
  };
  const remove = () => {
    const parents = usedIn(state, 'rec', id);
    const extra = parents.length ? ` Вона входить у: ${parents.map((p) => p.name).join(', ')}.` : '';
    if (!confirmDelete(`техкарту «${r.name}»?${extra} Історія продажів збережеться`)) return;
    update((d) => { d.recipes = d.recipes.filter((x) => x.id !== id); });
    onBack();
  };

  const otherRecipes = state.recipes.filter((x) => x.id !== id);
  const lineById = new Map(c.lines.map((l) => [l.id, l]));

  return (
    <section>
      <header className="page-head">
        <div className="row gap">
          <button className="btn ghost" onClick={onBack}>← Усі техкарти</button>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={duplicate}>Дублювати</button>
          <button className="btn danger ghost" onClick={remove}>Видалити</button>
        </div>
      </header>

      <div className="editor">
        <div className="editor-main">
          <div className="card pad">
            <div className="row gap wrap">
              <select className="emoji-select" value={r.emoji || '🍪'} onChange={(e) => set({ emoji: e.target.value })} aria-label="Іконка">
                {EMOJIS.map((em) => <option key={em}>{em}</option>)}
              </select>
              <input className="title-input grow" value={r.name} onChange={(e) => set({ name: e.target.value })} aria-label="Назва" />
            </div>
            <div className="grid4">
              <Field label="Категорія">
                <input list="rec-cats" value={r.category || ''} onChange={(e) => set({ category: e.target.value })} />
                <datalist id="rec-cats">{[...new Set(['Печиво', 'Набори', ...state.recipes.map((x) => x.category)])].filter(Boolean).map((x) => <option key={x} value={x} />)}</datalist>
              </Field>
              <Field label="Вихід, шт" hint="Скільки штук з одного замісу"><Num value={r.yieldQty} onChange={(v) => set({ yieldQty: v })} /></Field>
              <Field label="Втрати, %" hint="Брак, залишки тіста"><Num value={r.wastePct} onChange={(v) => set({ wastePct: v })} /></Field>
              <Field label={`Ціна продажу, ${cur}`}><Num value={r.salePrice} onChange={(v) => set({ salePrice: v })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={!!r.active} onChange={(e) => set({ active: e.target.checked })} /> Показувати в касі</label>
          </div>

          <div className="card pad">
            <h3>Склад</h3>
            <div className="table-wrap">
              <table className="table items">
                <thead>
                  <tr><th>Інгредієнт / техкарта</th><th className="r">Кількість</th><th title="Кількість вказана на 1 штуку (пакування, наліпка)">На 1 шт</th><th className="r">Вартість</th><th className="r">Частка</th><th /></tr>
                </thead>
                <tbody>
                  {r.items.map((it, k) => {
                    const l = lineById.get(it.id) || {};
                    const ing = it.type === 'ing' ? state.ingredients.find((x) => x.id === it.refId) : null;
                    const unit = it.type === 'rec' ? 'шт' : (UNITS[ing?.baseUnit] || UNITS.pcs).label;
                    return (
                      <tr key={it.id} className={l.missing ? 'missing' : ''}>
                        <td>
                          <select
                            className="wide-select"
                            value={`${it.type}:${it.refId}`}
                            onChange={(e) => { const [type, refId] = e.target.value.split(':'); setItem(it.id, { type, refId }); }}
                          >
                            {l.missing && <option value={`${it.type}:${it.refId}`}>— оберіть —</option>}
                            <optgroup label="Інгредієнти">
                              {[...state.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={`ing:${i.id}`}>{i.name}</option>)}
                            </optgroup>
                            {otherRecipes.length > 0 && (
                              <optgroup label="Техкарти (напівфабрикати, печиво в набір)">
                                {otherRecipes.map((x) => <option key={x.id} value={`rec:${x.id}`}>{x.emoji} {x.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        </td>
                        <td className="r nowrap"><Num className="inline" value={it.qty} onChange={(v) => setItem(it.id, { qty: v })} /> <span className="muted">{unit}</span></td>
                        <td className="c"><input type="checkbox" checked={!!it.perPiece} onChange={(e) => setItem(it.id, { perPiece: e.target.checked })} aria-label="На 1 шт" /></td>
                        <td className="r strong nowrap">{money(l.cost, cur)}</td>
                        <td className="r muted">{pct((l.share || 0) * 100)}</td>
                        <td className="nowrap actions">
                          <button className="icon-btn" onClick={() => moveItem(it.id, -1)} disabled={k === 0} aria-label="Вгору">↑</button>
                          <button className="icon-btn" onClick={() => moveItem(it.id, 1)} disabled={k === r.items.length - 1} aria-label="Вниз">↓</button>
                          <button className="icon-btn" onClick={() => removeItem(it.id)} aria-label="Видалити рядок">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn ghost" onClick={addItem}>+ Додати рядок</button>
            <p className="muted small">Позначка «На 1 шт» — для пакування: кількість множиться на вихід. Втрати застосовуються лише до інгредієнтів замісу.</p>
          </div>

          <div className="card pad">
            <h3>Додаткові витрати на заміс</h3>
            {r.extras.map((e) => (
              <div className="row gap extra-row" key={e.id}>
                <input className="grow" value={e.name} onChange={(ev) => setExtra(e.id, { name: ev.target.value })} aria-label="Назва витрати" />
                <Num className="inline" value={e.amount} onChange={(v) => setExtra(e.id, { amount: v })} aria-label="Сума" /> <span className="muted">{cur}</span>
                <button className="icon-btn" onClick={() => removeExtra(e.id)} aria-label="Видалити">✕</button>
              </div>
            ))}
            <button className="btn ghost" onClick={addExtra}>+ Електрика, газ, праця…</button>
          </div>

          <div className="card pad">
            <Field label="Технологія / нотатки"><textarea rows={4} value={r.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>
          </div>
        </div>

        <aside className="editor-side">
          <div className="card pad sticky">
            <h3>Розрахунок</h3>
            <dl className="calc">
              <dt>Собівартість замісу</dt><dd>{money(c.batch, cur)}</dd>
              {c.wasteCost > 0 && <><dt className="muted">у т.ч. втрати</dt><dd className="muted">{money(c.wasteCost, cur)}</dd></>}
              {c.extras > 0 && <><dt className="muted">у т.ч. дод. витрати</dt><dd className="muted">{money(c.extras, cur)}</dd></>}
              <dt>Вихід</dt><dd>{num(r.yieldQty)} шт</dd>
              {c.doughG > 0 && <><dt>Вага тіста / 1 шт</dt><dd>{num(Math.round(c.doughG))} г / ≈{num(Math.round(c.pieceWeight))} г</dd></>}
              <dt className="big">Собівартість 1 шт</dt><dd className="big">{money(c.perPiece, cur)}</dd>
              <dt>Ціна продажу</dt><dd>{money(r.salePrice, cur)}</dd>
              <dt>Прибуток з 1 шт</dt><dd className={m.profit < 0 ? 'neg' : 'pos'}>{money(m.profit, cur)}</dd>
              <dt>Маржа</dt><dd>{pct(m.marginPct)}</dd>
              <dt>Націнка</dt><dd>{pct(m.markupPct)}</dd>
              <dt>Food cost</dt><dd>{pct(m.foodCostPct)}</dd>
              <dt>Прибуток з замісу</dt><dd>{money(m.profit * (r.yieldQty || 0), cur)}</dd>
            </dl>
            <div className="reco">
              <div className="muted small">Ціна для маржі {target}%</div>
              <div className="row gap">
                <b>{money(recommended, cur)}</b>
                <button className="btn small" onClick={() => set({ salePrice: Math.ceil(recommended / 5) * 5 })}>Застосувати (≈{Math.ceil(recommended / 5) * 5})</button>
              </div>
            </div>
            {c.error === 'cycle' && <div className="alert err">Техкарта входить сама в себе (через інші). Приберіть циклічне посилання.</div>}
          </div>
        </aside>
      </div>
    </section>
  );
}
