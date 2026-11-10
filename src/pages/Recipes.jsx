import { useState } from 'react';
import { UNITS, bigUnitPrice, isSemi, marginInfo, money, num, pct, priceForMargin, uid, usedIn, yieldUnitLabel } from '../calc.js';
import { Empty, Field, Num, PageHead, Seg, confirmDelete } from '../components/ui.jsx';
import { IngredientModal } from './Ingredients.jsx';

const EMOJIS = ['🍪', '🍫', '🥜', '🍓', '🍋', '🥥', '🍯', '🧁', '🎁', '☕', '🌰', '🍒', '🥨', '❤️', '🥣', '🧈'];
const NEW_ING = '__new_ing__';
const NEW_SEMI = '__new_semi__';

/** Собівартість для показу: для штучних — за 1 шт, для напівфабрикатів — за 100 г / 100 мл. */
function costLabel(r, c, cur) {
  if (isSemi(r)) return { value: money((c?.perPiece || 0) * 100, cur), unit: `за 100 ${yieldUnitLabel(r)}` };
  return { value: money(c?.perPiece || 0, cur), unit: 'за 1 шт' };
}

export default function Recipes(props) {
  const { state, update, costs } = props;
  // Історія переходів між техкартами: [Classic, Солона карамель] → «Назад до Classic»
  const [stack, setStack] = useState([]);
  const [filter, setFilter] = useState('all');
  const cur = state.settings.currency;
  const openId = stack[stack.length - 1];

  const create = (semi) => {
    const id = uid();
    update((d) => {
      d.recipes.push(semi
        ? { id, name: 'Новий напівфабрикат', category: 'Напівфабрикати', emoji: '🍯', yieldQty: 500, yieldUnit: 'g', salePrice: 0, wastePct: 0, active: false, note: '', items: [], extras: [] }
        : { id, name: 'Нова техкарта', category: 'Печиво', emoji: '🍪', yieldQty: 12, yieldUnit: 'pcs', salePrice: 0, wastePct: 0, active: true, note: '', items: [], extras: [] });
    });
    return id;
  };
  const open = (id) => setStack((s) => [...s, id]);
  const back = () => setStack((s) => s.slice(0, -1));

  if (openId && state.recipes.some((r) => r.id === openId)) {
    const prev = state.recipes.find((r) => r.id === stack[stack.length - 2]);
    return <RecipeEditor {...props} key={openId} id={openId} prev={prev} onBack={back} onOpen={open} onReplace={(id) => setStack((s) => [...s.slice(0, -1), id])} onCreateSemi={() => create(true)} />;
  }

  const list = state.recipes.filter((r) => filter === 'all' || (filter === 'semi' ? isSemi(r) : !isSemi(r)));
  const groups = {};
  for (const r of list) (groups[isSemi(r) ? 'Напівфабрикати' : r.category || 'Інше'] ||= []).push(r);
  const semiCount = state.recipes.filter(isSemi).length;

  return (
    <section>
      <PageHead title="Техкарти" sub="Рецептури з розрахунком собівартості. Напівфабрикати (карамель, крем, начинка) рахуються в грамах і додаються в інші техкарти.">
        <button className="btn ghost" onClick={() => props.go('ai')}>✨ Рецепт текстом</button>
        <button className="btn ghost" onClick={() => open(create(true))}>+ Напівфабрикат</button>
        <button className="btn primary" onClick={() => open(create(false))}>+ Техкарта</button>
      </PageHead>

      {state.recipes.length > 0 && (
        <Seg value={filter} onChange={setFilter} options={[{ id: 'all', label: 'Усі' }, { id: 'goods', label: 'Товари' }, { id: 'semi', label: `Напівфабрикати (${semiCount})` }]} />
      )}
      {state.recipes.length === 0 && <Empty icon="📋" title="Техкарт ще немає">Створіть першу — додайте інгредієнти й вихід, і собівартість порахується сама.</Empty>}
      {filter === 'semi' && semiCount === 0 && <Empty icon="🍯" title="Напівфабрикатів ще немає">Наприклад, солона карамель: вихід 400 г, а в печиво додаєте 80 г — собівартість порахується сама.</Empty>}

      {Object.entries(groups).map(([g, rs]) => (
        <div key={g}>
          <h3 className="group-title">{g}</h3>
          <div className="cards">
            {rs.map((r) => {
              const c = costs.get(r.id) || { perPiece: 0 };
              const m = marginInfo(c.perPiece, r.salePrice);
              const low = r.salePrice > 0 && m.marginPct < 50;
              const semi = isSemi(r);
              const cl = costLabel(r, c, cur);
              const parents = semi ? usedIn(state, 'rec', r.id) : [];
              return (
                <button key={r.id} className="card recipe-card" onClick={() => open(r.id)}>
                  <div className="rc-top">
                    <span className="rc-emoji">{r.emoji || '🍪'}</span>
                    <span className="rc-name">{r.name}</span>
                    {!semi && !r.active && <span className="tag">не в касі</span>}
                  </div>
                  {semi ? (
                    <div className="rc-grid">
                      <div><span className="muted small">Собівартість {cl.unit}</span><b>{cl.value}</b></div>
                      <div><span className="muted small">Вихід замісу</span><b>{num(r.yieldQty)} {yieldUnitLabel(r)}</b></div>
                      <div className="span2"><span className="muted small">Використовується в</span><b className="ellipsis">{parents.length ? parents.map((p) => p.name).join(', ') : '—'}</b></div>
                    </div>
                  ) : (
                    <div className="rc-grid">
                      <div><span className="muted small">Собівартість</span><b>{cl.value}</b></div>
                      <div><span className="muted small">Ціна</span><b>{r.salePrice ? money(r.salePrice, cur) : '—'}</b></div>
                      <div><span className="muted small">Прибуток / шт</span><b>{r.salePrice ? money(m.profit, cur) : '—'}</b></div>
                      <div><span className="muted small">Маржа</span><b className={low ? 'warn-text' : ''}>{r.salePrice ? pct(m.marginPct) : '—'}</b></div>
                    </div>
                  )}
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

function RecipeEditor({ state, update, costs, id, prev, onBack, onOpen, onReplace, onCreateSemi }) {
  const r = state.recipes.find((x) => x.id === id);
  const c = costs.get(id) || { batch: 0, perPiece: 0, lines: [] };
  const cur = state.settings.currency;
  const semi = isSemi(r);
  const yu = yieldUnitLabel(r);
  const m = marginInfo(c.perPiece, r.salePrice);
  const target = state.settings.targetMargin || 65;
  const recommended = priceForMargin(c.perPiece, target);
  const [ingModal, setIngModal] = useState(null);

  const set = (patch) => update((d) => { Object.assign(d.recipes.find((x) => x.id === id), patch); });
  const setItem = (itemId, patch) => update((d) => { Object.assign(d.recipes.find((x) => x.id === id).items.find((i) => i.id === itemId), patch); });
  const removeItem = (itemId) => update((d) => { const rr = d.recipes.find((x) => x.id === id); rr.items = rr.items.filter((i) => i.id !== itemId); });
  const moveItem = (itemId, dir) => update((d) => {
    const items = d.recipes.find((x) => x.id === id).items;
    const k = items.findIndex((i) => i.id === itemId);
    const j = k + dir;
    if (j < 0 || j >= items.length) return;
    [items[k], items[j]] = [items[j], items[k]];
  });
  const addItem = (type = 'ing') => update((d) => { d.recipes.find((x) => x.id === id).items.push({ id: uid(), type, refId: '', qty: 0, perPiece: false }); });
  const setExtra = (eid, patch) => update((d) => { Object.assign(d.recipes.find((x) => x.id === id).extras.find((e) => e.id === eid), patch); });
  const addExtra = () => update((d) => { d.recipes.find((x) => x.id === id).extras.push({ id: uid(), name: 'Інше', amount: 0 }); });
  const removeExtra = (eid) => update((d) => { const rr = d.recipes.find((x) => x.id === id); rr.extras = rr.extras.filter((e) => e.id !== eid); });

  /** Вибір у рядку: інгредієнт, техкарта, або створити новий інгредієнт / напівфабрикат. */
  const pick = (itemId, value) => {
    if (value === NEW_ING) {
      const nid = uid();
      update((d) => {
        d.ingredients.push({ id: nid, name: 'Новий інгредієнт', category: 'Основа', baseUnit: 'g', packQty: 1000, packPrice: 0, minStock: 0, note: '', updatedAt: new Date().toISOString(), history: [] });
        Object.assign(d.recipes.find((x) => x.id === id).items.find((i) => i.id === itemId), { type: 'ing', refId: nid });
      });
      setIngModal(nid);
      return;
    }
    if (value === NEW_SEMI) {
      const nid = onCreateSemi();
      update((d) => { Object.assign(d.recipes.find((x) => x.id === id).items.find((i) => i.id === itemId), { type: 'rec', refId: nid }); });
      onOpen(nid);
      return;
    }
    const [type, refId] = value.split(':');
    setItem(itemId, { type, refId });
  };

  const duplicate = () => {
    const nid = uid();
    const src = state.recipes.find((x) => x.id === id);
    update((d) => {
      d.recipes.push({ ...JSON.parse(JSON.stringify(src)), id: nid, name: src.name + ' (копія)', items: src.items.map((i) => ({ ...i, id: uid() })), extras: (src.extras || []).map((e) => ({ ...e, id: uid() })) });
    });
    onReplace(nid);
  };
  const remove = () => {
    const parents = usedIn(state, 'rec', id);
    const extra = parents.length ? ` Вона входить у: ${parents.map((p) => p.name).join(', ')}.` : '';
    if (!confirmDelete(`техкарту «${r.name}»?${extra} Історія продажів збережеться`)) return;
    update((d) => { d.recipes = d.recipes.filter((x) => x.id !== id); });
    onBack();
  };
  const setYieldUnit = (u) => set(u === 'pcs' ? { yieldUnit: 'pcs' } : { yieldUnit: u, active: false, category: r.category === 'Печиво' || !r.category ? 'Напівфабрикати' : r.category });

  const others = state.recipes.filter((x) => x.id !== id);
  const semis = others.filter(isSemi);
  const goods = others.filter((x) => !isSemi(x));
  const ingSorted = [...state.ingredients].sort((a, b) => a.name.localeCompare(b.name));
  const lineById = new Map(c.lines.map((l) => [l.id, l]));
  const parents = usedIn(state, 'rec', id);
  const cl = costLabel(r, c, cur);

  return (
    <section>
      <header className="page-head">
        <button className="btn ghost" onClick={onBack}>← {prev ? `Назад до «${prev.name}»` : 'Усі техкарти'}</button>
        <div className="ph-actions">
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
            <div className="grid-fields">
              <Field label="Тип">
                <select value={r.yieldUnit || 'pcs'} onChange={(e) => setYieldUnit(e.target.value)}>
                  <option value="pcs">Товар, шт</option>
                  <option value="g">Напівфабрикат, г</option>
                  <option value="ml">Напівфабрикат, мл</option>
                </select>
              </Field>
              <Field label={`Вихід, ${yu}`} hint={semi ? 'Скільки грамів виходить з одного замісу' : 'Скільки штук з одного замісу'}><Num value={r.yieldQty} onChange={(v) => set({ yieldQty: v })} /></Field>
              <Field label="Втрати, %" hint={semi ? 'Залишки на посуді тощо' : 'Брак, залишки тіста'}><Num value={r.wastePct} onChange={(v) => set({ wastePct: v })} /></Field>
              <Field label="Категорія">
                <input list="rec-cats" value={r.category || ''} onChange={(e) => set({ category: e.target.value })} />
                <datalist id="rec-cats">{[...new Set(['Печиво', 'Набори', 'Напівфабрикати', ...state.recipes.map((x) => x.category)])].filter(Boolean).map((x) => <option key={x} value={x} />)}</datalist>
              </Field>
              {!semi && <Field label={`Ціна продажу, ${cur}`}><Num value={r.salePrice} onChange={(v) => set({ salePrice: v })} /></Field>}
              {!semi && <Field label={`Оптова ціна, ${cur}`} hint="Для оптових клієнтів"><Num value={r.wholesalePrice || 0} onChange={(v) => set({ wholesalePrice: v })} /></Field>}
            </div>
            {!semi && <label className="check"><input type="checkbox" checked={!!r.active} onChange={(e) => set({ active: e.target.checked })} /> Показувати в касі</label>}
            {parents.length > 0 && (
              <div className="used-in">
                <span className="muted small">Входить у:</span>
                {parents.map((p) => <button key={p.id} className="chip" onClick={() => onOpen(p.id)}>{p.emoji} {p.name} →</button>)}
              </div>
            )}
          </div>

          <div className="card pad">
            <h3>Склад</h3>
            <div className="items-grid">
              <div className="ig-row ig-head">
                <span>Інгредієнт / напівфабрикат</span><span className="r">Кількість</span><span className="c" title="Кількість вказана на 1 штуку (пакування, наліпка)">На 1 шт</span><span className="r">Вартість</span><span className="r">Частка</span><span />
              </div>
              {r.items.map((it, k) => {
                const l = lineById.get(it.id) || {};
                const ing = it.type === 'ing' ? state.ingredients.find((x) => x.id === it.refId) : null;
                const sub = it.type === 'rec' ? state.recipes.find((x) => x.id === it.refId) : null;
                const unit = it.type === 'rec' ? yieldUnitLabel(sub) : (UNITS[ing?.baseUnit] || UNITS.pcs).label;
                const empty = !ing && !sub;
                return (
                  <div key={it.id} className={'ig-row' + (empty && it.refId ? ' missing' : '')}>
                    <span className="ig-name">
                      <select value={empty ? '' : `${it.type}:${it.refId}`} onChange={(e) => pick(it.id, e.target.value)} aria-label="Інгредієнт">
                        {empty && <option value="">— оберіть —</option>}
                        <optgroup label="Інгредієнти">
                          {ingSorted.map((i) => <option key={i.id} value={`ing:${i.id}`}>{i.name}</option>)}
                          <option value={NEW_ING}>＋ Новий інгредієнт…</option>
                        </optgroup>
                        <optgroup label="Напівфабрикати (карамель, крем…)">
                          {semis.map((x) => <option key={x.id} value={`rec:${x.id}`}>{x.emoji} {x.name}</option>)}
                          <option value={NEW_SEMI}>＋ Новий напівфабрикат…</option>
                        </optgroup>
                        {goods.length > 0 && (
                          <optgroup label="Інші техкарти (печиво в набір)">
                            {goods.map((x) => <option key={x.id} value={`rec:${x.id}`}>{x.emoji} {x.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                      {ing && (
                        <span className="ig-sub">
                          {money(bigUnitPrice(ing), cur)}/{UNITS[ing.baseUnit]?.big}
                          <button className="link small" onClick={() => setIngModal(ing.id)}>✎ ціна / назва</button>
                        </span>
                      )}
                      {sub && (
                        <span className="ig-sub">
                          {isSemi(sub) ? `${money((costs.get(sub.id)?.perPiece || 0) * 1000, cur)}/${UNITS[sub.yieldUnit]?.big}` : `${money(costs.get(sub.id)?.perPiece || 0, cur)}/шт`}
                          <button className="link small" onClick={() => onOpen(sub.id)}>→ відкрити техкарту</button>
                        </span>
                      )}
                    </span>
                    <span className="ig-qty input-group"><Num value={it.qty} onChange={(v) => setItem(it.id, { qty: v })} aria-label="Кількість" /><span className="ig-text">{unit}</span></span>
                    <label className={'ig-pp c' + (semi ? ' invisible' : '')}><input type="checkbox" checked={!!it.perPiece} onChange={(e) => setItem(it.id, { perPiece: e.target.checked })} aria-label="На 1 шт" /><span className="show-mobile small">на 1 шт</span></label>
                    <span className="ig-cost r strong nowrap">{money(l.cost, cur)}</span>
                    <span className="ig-share r muted">{pct((l.share || 0) * 100)}</span>
                    <span className="ig-act nowrap">
                      <button className="icon-btn" onClick={() => moveItem(it.id, -1)} disabled={k === 0} aria-label="Вгору">↑</button>
                      <button className="icon-btn" onClick={() => moveItem(it.id, 1)} disabled={k === r.items.length - 1} aria-label="Вниз">↓</button>
                      <button className="icon-btn" onClick={() => removeItem(it.id)} aria-label="Видалити рядок">✕</button>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="row gap wrap">
              <button className="btn ghost" onClick={() => addItem('ing')}>+ Інгредієнт</button>
              <button className="btn ghost" onClick={() => addItem('rec')}>+ Напівфабрикат / техкарта</button>
            </div>
            <p className="muted small">
              Немає потрібного інгредієнта? У списку оберіть «＋ Новий інгредієнт…». Напівфабрикат (наприклад, солона карамель) — окрема техкарта з виходом у грамах: тут вкажіть, скільки грамів іде в заміс.
              {!semi && ' «На 1 шт» — для пакування: кількість множиться на вихід.'}
            </p>
          </div>

          <div className="card pad">
            <h3>Додаткові витрати на заміс</h3>
            {r.extras.map((e) => (
              <div className="line-row" key={e.id}>
                <input className="grow" value={e.name} onChange={(ev) => setExtra(e.id, { name: ev.target.value })} aria-label="Назва витрати" />
                <span className="input-group w-price"><Num value={e.amount} onChange={(v) => setExtra(e.id, { amount: v })} aria-label="Сума" /><span className="ig-text">{cur}</span></span>
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
              <dt>Вихід</dt><dd>{num(r.yieldQty)} {yu}</dd>
              {!semi && c.doughG > 0 && <><dt>Вага тіста / 1 шт</dt><dd>{num(Math.round(c.doughG))} г / ≈{num(Math.round(c.pieceWeight))} г</dd></>}
              <dt className="total">Собівартість {cl.unit}</dt><dd className="total">{cl.value}</dd>
              {semi ? (
                <><dt>Собівартість 1 {UNITS[r.yieldUnit]?.big}</dt><dd>{money(c.perPiece * 1000, cur)}</dd></>
              ) : (
                <>
                  <dt>Ціна продажу</dt><dd>{money(r.salePrice, cur)}</dd>
                  <dt>Прибуток з 1 шт</dt><dd className={m.profit < 0 ? 'neg' : 'pos'}>{money(m.profit, cur)}</dd>
                  <dt>Маржа</dt><dd>{pct(m.marginPct)}</dd>
                  <dt>Націнка</dt><dd>{pct(m.markupPct)}</dd>
                  <dt>Food cost</dt><dd>{pct(m.foodCostPct)}</dd>
                  <dt>Прибуток з замісу</dt><dd>{money(m.profit * (r.yieldQty || 0), cur)}</dd>
                </>
              )}
            </dl>
            {!semi && (
              <div className="reco">
                <div className="muted small">Ціна для маржі {target}%</div>
                <div className="row between gap wrap">
                  <b>{money(recommended, cur)}</b>
                  <button className="btn small" onClick={() => set({ salePrice: Math.ceil(recommended / 5) * 5 })}>Поставити ≈{Math.ceil(recommended / 5) * 5}</button>
                </div>
              </div>
            )}
            {semi && <p className="muted small">Змінили ціну цукру чи вершків — собівартість карамелі і всіх техкарт, куди вона входить, перерахується автоматично.</p>}
            {c.error === 'cycle' && <div className="alert err">Техкарта входить сама в себе (через інші). Приберіть циклічне посилання.</div>}
          </div>
        </aside>
      </div>
      {ingModal && <IngredientModal id={ingModal} state={state} update={update} costs={costs} onClose={() => setIngModal(null)} />}
    </section>
  );
}
