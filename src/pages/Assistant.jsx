import { useState } from 'react';
import { setIngredientPrice } from '../store.js';
import { UNITS, bigUnitPrice, buildReport, fmtQty, marginInfo, money, pct, periodRange, round2, toBase, uid } from '../calc.js';
import { askAnalyst, imageToBase64, parsePurchases, parseRecipe, searchPrices } from '../ai.js';
import { Empty, Num, PageHead } from '../components/ui.jsx';

const aiCfg = (local) => ({ apiKey: local.apiKey, model: local.model || 'claude-opus-5-5' });

const TOOLS = [
  { id: 'purchases', label: '🧾 Чек / список покупок' },
  { id: 'prices', label: '🔎 Середні ціни в регіоні' },
  { id: 'recipe', label: '📋 Рецепт → техкарта' },
  { id: 'analyst', label: '💬 Запитати аналітика' },
];

export default function Assistant(props) {
  const [tool, setTool] = useState('purchases');
  const hasKey = !!props.local.apiKey;
  return (
    <section>
      <PageHead title="AI-помічник" sub="Внесіть чек фото чи текстом, знайдіть ринкові ціни, перетворіть рецепт на техкарту або спитайте поради. Ви завжди бачите результат перед збереженням." />
      {!hasKey && (
        <div className="alert warn">
          Щоб AI запрацював, додайте API-ключ Anthropic у{' '}
          <button className="link" onClick={() => props.go('settings')}>Налаштуваннях</button>. Решта програми працює і без нього.
        </div>
      )}
      <div className="chips tabs scroll-x">
        {TOOLS.map((t) => <button key={t.id} className={'chip' + (tool === t.id ? ' on' : '')} onClick={() => setTool(t.id)}>{t.label}</button>)}
      </div>
      {tool === 'purchases' && <Purchases {...props} />}
      {tool === 'prices' && <Prices {...props} />}
      {tool === 'recipe' && <RecipeImport {...props} />}
      {tool === 'analyst' && <Analyst {...props} />}
    </section>
  );
}

function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true); setError('');
    try { return await fn(); } catch (e) { setError(e.message || String(e)); return null; } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

function Status({ busy, error, text = 'AI думає…' }) {
  if (busy) return <div className="alert info"><span className="spinner" /> {text}</div>;
  if (error) return <div className="alert err">{error}</div>;
  return null;
}

function MatchSelect({ ingredients, value, onChange, baseUnit }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} className="wide-select">
      <option value="">+ Створити новий інгредієнт</option>
      {[...ingredients].sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
        <option key={i.id} value={i.id} disabled={baseUnit && i.baseUnit !== baseUnit}>{i.name}{baseUnit && i.baseUnit !== baseUnit ? ' (інша одиниця)' : ''}</option>
      ))}
    </select>
  );
}

// ───────────── 1. Чек / покупки ─────────────
function Purchases({ state, update, local }) {
  const cur = state.settings.currency;
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [rows, setRows] = useState(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState('');
  const [asSupply, setAsSupply] = useState(true);
  const [supplier, setSupplier] = useState('');
  const [payAcc, setPayAcc] = useState('cash');
  const { busy, error, run } = useRun();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (f) setImage(await imageToBase64(f));
  };
  const analyze = () => run(async () => {
    setDone('');
    const res = await parsePurchases(aiCfg(local), state.ingredients, { text: text.trim(), image });
    const known = new Set(state.ingredients.map((i) => i.id));
    setRows(res.items.map((it) => {
      const b = toBase(it.qty, it.unit);
      const match = it.matchedIngredientId && known.has(it.matchedIngredientId) ? state.ingredients.find((i) => i.id === it.matchedIngredientId) : null;
      return { key: uid(), apply: true, name: it.name, category: it.category, qty: b.qty, baseUnit: b.base, price: it.totalPrice, matchId: match && match.baseUnit === b.base ? match.id : null };
    }));
    setComment(res.comment);
  });
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const apply = () => {
    let upd = 0; let created = 0;
    const supplyItems = [];
    update((d) => {
      for (const r of rows) {
        if (!r.apply || !(r.qty > 0)) continue;
        let id = r.matchId;
        if (id) { setIngredientPrice(d, id, { packPrice: round2(r.price), packQty: r.qty }, 'чек (AI)'); upd++; }
        else {
          id = uid();
          d.ingredients.push({ id, name: r.name, category: r.category || 'Інше', baseUnit: r.baseUnit, packQty: r.qty, packPrice: round2(r.price), minStock: 0, note: '', updatedAt: new Date().toISOString(), lastSource: 'чек (AI)', history: [] });
          created++;
        }
        supplyItems.push({ ingredientId: id, qty: r.qty, total: round2(r.price) });
      }
      if (asSupply && supplyItems.length) d.supplies.push({ id: uid(), date: new Date().toISOString(), supplier: supplier || 'Чек (AI)', accountId: payAcc, note: 'Внесено через AI', items: supplyItems });
    });
    setDone(`Готово: оновлено ${upd}, додано ${created}${asSupply ? ', залишки на складі збільшено' : ''}. Собівартість техкарт перераховано.`);
    setRows(null); setText(''); setImage(null);
  };

  return (
    <div className="card pad">
      <p className="muted">Вставте текст чеку або список у вільній формі, наприклад: «борошно 2 пачки по 1 кг — 64 грн, масло 82% 4×200г 392, яйця 30 шт 175». Або сфотографуйте чек.</p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Список покупок або текст чеку…" />
      <div className="row gap wrap">
        <label className="btn ghost file-btn">📷 Фото чеку<input type="file" accept="image/*" capture="environment" onChange={onFile} hidden /></label>
        {image && <span className="row gap"><img src={image.preview} alt="Фото чеку" className="thumb" /><button className="icon-btn" onClick={() => setImage(null)} aria-label="Прибрати фото">✕</button></span>}
        <span className="grow" />
        <button className="btn primary" disabled={busy || (!text.trim() && !image)} onClick={analyze}>Розпізнати</button>
      </div>
      <Status busy={busy} error={error} text="Розбираю чек…" />
      {done && <div className="alert ok">{done}</div>}

      {rows && (
        <>
          <h3>Перевірте перед збереженням</h3>
          {comment && <p className="muted">💡 {comment}</p>}
          {rows.length === 0 ? <Empty title="Нічого не знайдено" /> : (
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th /><th>Позиція з чеку</th><th>Куди записати</th><th className="r">Кількість</th><th className="r">Сума, {cur}</th><th className="r">За кг/л/шт</th><th className="r">Було</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const match = state.ingredients.find((i) => i.id === r.matchId);
                    const newBig = r.qty > 0 ? (r.price / r.qty) * (UNITS[r.baseUnit]?.factor || 1) : 0;
                    const oldBig = match ? bigUnitPrice(match) : 0;
                    const diff = oldBig > 0 ? ((newBig - oldBig) / oldBig) * 100 : null;
                    return (
                      <tr key={r.key} className={r.apply ? '' : 'dim'}>
                        <td><input type="checkbox" checked={r.apply} onChange={(e) => setRow(r.key, { apply: e.target.checked })} aria-label="Застосувати" /></td>
                        <td><input value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} /></td>
                        <td><MatchSelect ingredients={state.ingredients} value={r.matchId} baseUnit={r.baseUnit} onChange={(v) => setRow(r.key, { matchId: v })} /></td>
                        <td className="r nowrap"><Num className="inline" value={r.qty} onChange={(v) => setRow(r.key, { qty: v })} /> {UNITS[r.baseUnit]?.label}</td>
                        <td className="r"><Num className="inline" value={r.price} onChange={(v) => setRow(r.key, { price: v })} /></td>
                        <td className="r nowrap">{money(newBig, cur)}</td>
                        <td className="r nowrap">{match ? <>{money(oldBig, cur)} {diff != null && Math.abs(diff) >= 0.5 && <span className={diff > 0 ? 'neg' : 'pos'}>({diff > 0 ? '+' : ''}{pct(diff)})</span>}</> : <span className="muted">новий</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="form-grid">
            <label className="check align-end"><input type="checkbox" checked={asSupply} onChange={(e) => setAsSupply(e.target.checked)} /> Записати як постачання (додати на склад)</label>
            {asSupply && <label className="field"><span className="field-label">Постачальник</span><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Metro, Сільпо…" /></label>}
            {asSupply && (
              <label className="field"><span className="field-label">Оплачено з</span>
                <select value={payAcc} onChange={(e) => setPayAcc(e.target.value)}>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="">Не з рахунків бізнесу</option></select>
              </label>
            )}
          </div>
          <div className="row gap">
            <button className="btn primary" onClick={apply} disabled={!rows.some((r) => r.apply)}>Зберегти</button>
            <button className="btn ghost" onClick={() => setRows(null)}>Скасувати</button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────── 2. Середні ціни ─────────────
function Prices({ state, update, local }) {
  const cur = state.settings.currency;
  const [city, setCity] = useState(state.settings.city || '');
  const [sel, setSel] = useState(() => new Set(state.ingredients.filter((i) => i.category !== 'Пакування').map((i) => i.id)));
  const [rows, setRows] = useState(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState('');
  const { busy, error, run } = useRun();

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const search = () => run(async () => {
    setDone('');
    const chosen = state.ingredients.filter((i) => sel.has(i.id));
    const res = await searchPrices(aiCfg(local), chosen, city);
    setRows(res.items.filter((it) => sel.has(it.ingredientId)).map((it) => {
      const b = toBase(it.packQty, it.unit);
      const ing = state.ingredients.find((i) => i.id === it.ingredientId);
      return { ...it, qty: b.qty, base: b.base, apply: it.found && ing?.baseUnit === b.base, ok: ing?.baseUnit === b.base };
    }));
    setComment(res.comment);
  });
  const apply = () => {
    let n = 0;
    update((d) => { for (const r of rows) if (r.apply && r.ok && r.qty > 0) { setIngredientPrice(d, r.ingredientId, { packPrice: round2(r.packPrice), packQty: r.qty }, `пошук AI (${city})`); n++; } });
    setDone(`Оновлено цін: ${n}. Собівартість перераховано.`);
    setRows(null);
  };

  return (
    <div className="card pad">
      <p className="muted">AI пошукає ціни в інтернет-магазинах і мережах вашого регіону. Пошук займає 1–3 хвилини. Ціни орієнтовні — перевіряйте перед збереженням.</p>
      <div className="row gap wrap">
        <label className="row gap">Місто / регіон <input value={city} onChange={(e) => setCity(e.target.value)} /></label>
        <button className="btn small ghost" onClick={() => setSel(new Set(state.ingredients.map((i) => i.id)))}>Обрати всі</button>
        <button className="btn small ghost" onClick={() => setSel(new Set())}>Зняти всі</button>
      </div>
      <div className="pick-list">
        {state.ingredients.map((i) => (
          <label key={i.id} className={'pick' + (sel.has(i.id) ? ' on' : '')}>
            <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /> {i.name}
          </label>
        ))}
      </div>
      <button className="btn primary" disabled={busy || sel.size === 0} onClick={search}>Знайти ціни ({sel.size})</button>
      <Status busy={busy} error={error} text="Шукаю ціни в інтернеті… це може зайняти кілька хвилин" />
      {done && <div className="alert ok">{done}</div>}

      {rows && (
        <>
          <h3>Знайдені ціни</h3>
          {comment && <p className="muted">💡 {comment}</p>}
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th /><th>Інгредієнт</th><th className="r">Упаковка</th><th className="r">Ціна</th><th className="r">За кг/л/шт</th><th className="r">Ваша ціна</th><th>Джерело</th></tr></thead>
              <tbody>
                {rows.map((r, k) => {
                  const ing = state.ingredients.find((i) => i.id === r.ingredientId);
                  if (!ing) return null;
                  const big = r.qty > 0 ? (r.packPrice / r.qty) * (UNITS[r.base]?.factor || 1) : 0;
                  return (
                    <tr key={k} className={r.apply ? '' : 'dim'}>
                      <td><input type="checkbox" disabled={!r.ok} checked={r.apply} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === k ? { ...x, apply: e.target.checked } : x)))} aria-label="Застосувати" /></td>
                      <td>{ing.name}{!r.found && <div className="muted small">не знайдено надійно</div>}{!r.ok && <div className="neg small">інша одиниця виміру</div>}</td>
                      <td className="r nowrap">{fmtQty(r.qty, r.base)}</td>
                      <td className="r"><Num className="inline" value={r.packPrice} onChange={(v) => setRows((rs) => rs.map((x, j) => (j === k ? { ...x, packPrice: v } : x)))} /></td>
                      <td className="r nowrap">{money(big, cur)}</td>
                      <td className="r nowrap muted">{money(bigUnitPrice(ing), cur)}</td>
                      <td className="small muted">{r.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row gap">
            <button className="btn primary" onClick={apply} disabled={!rows.some((r) => r.apply)}>Застосувати обрані</button>
            <button className="btn ghost" onClick={() => setRows(null)}>Скасувати</button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────── 3. Рецепт → техкарта ─────────────
function RecipeImport({ state, update, go, local }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState(null);
  const { busy, error, run } = useRun();

  const analyze = () => run(async () => {
    const res = await parseRecipe(aiCfg(local), state.ingredients, text);
    const known = new Map(state.ingredients.map((i) => [i.id, i]));
    setDraft({
      name: res.name, yieldQty: res.yieldQty, note: res.note,
      items: res.items.map((it) => {
        const b = toBase(it.qty, it.unit);
        const m = known.get(it.matchedIngredientId);
        return { key: uid(), name: it.name, category: it.category, qty: b.qty, base: b.base, perPiece: it.perPiece, matchId: m && m.baseUnit === b.base ? m.id : null };
      }),
    });
  });
  const setItem = (key, patch) => setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  const create = () => {
    update((d) => {
      const items = draft.items.map((it) => {
        let refId = it.matchId;
        if (!refId) {
          refId = uid();
          const isBig = it.base !== 'pcs';
          d.ingredients.push({ id: refId, name: it.name, category: it.category || 'Інше', baseUnit: it.base, packQty: isBig ? 1000 : 1, packPrice: 0, note: 'Додано з рецепту — вкажіть ціну', updatedAt: new Date().toISOString(), history: [] });
        }
        return { id: uid(), type: 'ing', refId, qty: it.qty, perPiece: it.perPiece };
      });
      d.recipes.push({ id: uid(), name: draft.name, category: 'Печиво', emoji: '🍪', yieldQty: draft.yieldQty, salePrice: 0, wastePct: 3, active: true, note: draft.note, items, extras: [] });
    });
    setDraft(null); setText('');
    go('recipes');
  };
  const newCount = draft ? draft.items.filter((i) => !i.matchId).length : 0;

  return (
    <div className="card pad">
      <p className="muted">Вставте рецепт будь-якою мовою — з чашками, ложками, як завгодно. AI переведе все в грами й складе техкарту.</p>
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Наприклад: 230 г масла, 1 склянка коричневого цукру, 2 яйця, 2 і 3/4 склянки борошна… Виходить 12 печив по 110 г." />
      <button className="btn primary" disabled={busy || !text.trim()} onClick={analyze}>Скласти техкарту</button>
      <Status busy={busy} error={error} text="Складаю техкарту…" />
      {draft && (
        <>
          <h3>Чернетка техкарти</h3>
          <div className="row gap wrap">
            <input className="title-input grow" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <label className="row gap">Вихід <Num className="inline" value={draft.yieldQty} onChange={(v) => setDraft({ ...draft, yieldQty: v })} /> шт</label>
          </div>
          {draft.note && <p className="muted">💡 {draft.note}</p>}
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>З рецепту</th><th>Інгредієнт у базі</th><th className="r">Кількість</th><th>На 1 шт</th><th /></tr></thead>
              <tbody>
                {draft.items.map((it) => (
                  <tr key={it.key}>
                    <td><input value={it.name} onChange={(e) => setItem(it.key, { name: e.target.value })} /></td>
                    <td><MatchSelect ingredients={state.ingredients} value={it.matchId} baseUnit={it.base} onChange={(v) => setItem(it.key, { matchId: v })} /></td>
                    <td className="r nowrap"><Num className="inline" value={it.qty} onChange={(v) => setItem(it.key, { qty: v })} /> {UNITS[it.base]?.label}</td>
                    <td className="c"><input type="checkbox" checked={it.perPiece} onChange={(e) => setItem(it.key, { perPiece: e.target.checked })} /></td>
                    <td><button className="icon-btn" onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((x) => x.key !== it.key) }))} aria-label="Прибрати">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {newCount > 0 && <p className="muted small">Буде створено {newCount} нових інгредієнтів з ціною 0 — потім вкажіть їхні ціни (або скористайтесь «Середні ціни»).</p>}
          <div className="row gap">
            <button className="btn primary" onClick={create}>Створити техкарту</button>
            <button className="btn ghost" onClick={() => setDraft(null)}>Скасувати</button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────── 4. Аналітик ─────────────
function businessContext(state, costs) {
  const rep = (id) => {
    const r = buildReport(state, periodRange(id));
    return { revenue: round2(r.revenue), cogs: round2(r.cost), grossProfit: round2(r.profit), otherExpenses: round2(r.expenses), netProfit: round2(r.net), unitsSold: r.qty, checks: r.checks, topProducts: r.products.slice(0, 10).map((p) => ({ name: p.name, qty: p.qty, revenue: round2(p.revenue), profit: round2(p.profit) })) };
  };
  return JSON.stringify({
    currency: state.settings.currency,
    city: state.settings.city,
    ingredients: state.ingredients.map((i) => ({ name: i.name, pack: fmtQty(i.packQty, i.baseUnit), packPrice: i.packPrice, pricePerKgLPcs: round2(bigUnitPrice(i)) })),
    techCards: state.recipes.map((r) => {
      const c = costs.get(r.id) || { perPiece: 0, lines: [] };
      const m = marginInfo(c.perPiece, r.salePrice);
      return { name: r.name, yield: r.yieldQty, costPerPiece: round2(c.perPiece), salePrice: r.salePrice, marginPct: round2(m.marginPct), composition: c.lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unitLabel, perPiece: l.perPiece, cost: round2(l.cost) })) };
    }),
    reports: { today: rep('today'), thisWeek: rep('week'), thisMonth: rep('month'), lastMonth: rep('prevMonth'), allTime: rep('all') },
  });
}

const SUGGEST = [
  'Які техкарти найменш вигідні і як їх покращити?',
  'Яку ціну поставити на новий набір з 6 печив?',
  'Порівняй цей місяць з минулим.',
  'Що найбільше впливає на собівартість Classic?',
];

function Analyst({ state, costs, local }) {
  const [q, setQ] = useState('');
  const [chat, setChat] = useState([]);
  const { busy, error, run } = useRun();

  const ask = (question) => run(async () => {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ('');
    const history = chat.map((m) => ({ role: m.role, content: m.text }));
    setChat((c) => [...c, { role: 'user', text }]);
    const answer = await askAnalyst(aiCfg(local), businessContext(state, costs), text, history);
    setChat((c) => [...c, { role: 'assistant', text: answer }]);
  });

  return (
    <div className="card pad">
      <p className="muted">AI бачить ваші техкарти, ціни й звіти та відповідає з урахуванням ваших цифр.</p>
      {chat.length === 0 && (
        <div className="chips">{SUGGEST.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}</div>
      )}
      <div className="chat">
        {chat.map((m, k) => <div key={k} className={'msg ' + m.role}>{m.text}</div>)}
      </div>
      <Status busy={busy} error={error} />
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ваше питання…" />
        <button className="btn primary" disabled={busy || !q.trim()}>Надіслати</button>
        {chat.length > 0 && <button type="button" className="btn ghost" onClick={() => setChat([])}>Нова розмова</button>}
      </form>
    </div>
  );
}

