import { useMemo, useState } from 'react';
import { bakePlan, computeStock, dayKey, fmtDate, fmtQty, money, num, yieldUnitLabel } from '../calc.js';
import { Empty, Num, PageHead, Toast, useToast } from '../components/ui.jsx';
import { printDoc } from '../components/Print.jsx';

const EXTRA_KEY = 'kus-plan-extra';
const loadExtra = () => { try { return JSON.parse(localStorage.getItem(EXTRA_KEY) || '{}'); } catch { return {}; } };

export default function Plan({ state, update, can }) {
  const cur = state.settings.currency;
  const tomorrow = dayKey(new Date(Date.now() + 86400000));
  const [date, setDate] = useState(tomorrow);
  const [withOverdue, setWithOverdue] = useState(true);
  const [extra, setExtraState] = useState(loadExtra);
  const [toast, showToast] = useToast();
  const setExtra = (rid, v) => {
    const n = { ...extra, [rid]: v };
    setExtraState(n);
    try { localStorage.setItem(EXTRA_KEY, JSON.stringify(n)); } catch { /* ignore */ }
  };

  const orders = state.orders.filter((o) => !['done', 'cancelled'].includes(o.status) && o.dueAt && (dayKey(o.dueAt) === date || (withOverdue && dayKey(o.dueAt) < date)));
  const need = useMemo(() => {
    const m = new Map();
    for (const o of orders) for (const i of o.items) m.set(i.recipeId, (m.get(i.recipeId) || 0) + (Number(i.qty) || 0));
    for (const [rid, n] of Object.entries(extra)) if (Number(n) > 0) m.set(rid, (m.get(rid) || 0) + Number(n));
    return m;
  }, [orders, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const stock = useMemo(() => computeStock(state), [state]);
  const plan = useMemo(() => bakePlan(state, need, stock), [state, need, stock]);
  const shortage = plan.ingredients.filter((x) => x.short > 0);
  const buyCost = shortage.reduce((s, x) => s + x.cost, 0);

  const shoppingText = () => [`Закупівля до ${fmtDate(date + 'T12:00')}:`, ...shortage.map((x) => `• ${x.ing.name} — ${fmtQty(x.short, x.ing.baseUnit)} (${x.packs} уп. × ${fmtQty(x.ing.packQty, x.ing.baseUnit)})`), `Орієнтовно: ${money(buyCost, cur)}`].join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(shoppingText()); showToast('Список покупок скопійовано'); } catch { showToast('Не вдалося скопіювати'); }
  };
  const markBaking = () => {
    update((d) => { for (const o of d.orders) if (orders.some((x) => x.id === o.id) && ['new', 'confirmed'].includes(o.status)) o.status = 'baking'; });
    showToast('Замовлення переведено в «Готується»');
  };
  const printPlan = () => printDoc(
    <div className="doc-invoice">
      <h2>План випічки на {fmtDate(date + 'T12:00')}</h2>
      <table className="doc-table"><thead><tr><th>Техкарта</th><th>Потрібно</th><th>Замісів</th><th>Вийде, шт</th></tr></thead>
        <tbody>{plan.rows.map((r) => <tr key={r.recipe.id}><td>{r.recipe.name}</td><td className="r">{num(Math.round(r.pieces))} {yieldUnitLabel(r.recipe)}</td><td className="r">{r.batches || '—'}</td><td className="r">{num(r.make)} {yieldUnitLabel(r.recipe)}</td></tr>)}</tbody></table>
      <h3>Інгредієнти</h3>
      <table className="doc-table"><thead><tr><th>Інгредієнт</th><th>Потрібно</th><th>На складі</th><th>Докупити</th></tr></thead>
        <tbody>{plan.ingredients.map((x) => <tr key={x.ing.id}><td>{x.ing.name}</td><td className="r">{fmtQty(x.qty, x.ing.baseUnit)}</td><td className="r">{fmtQty(Math.max(0, x.have), x.ing.baseUnit)}</td><td className="r">{x.short > 0 ? fmtQty(x.short, x.ing.baseUnit) : '—'}</td></tr>)}</tbody></table>
      <h3>Замовлення</h3>
      <ul>{orders.map((o) => <li key={o.id}>№{o.number} · {new Date(o.dueAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}{o.note ? ` · ${o.note}` : ''}</li>)}</ul>
    </div>,
  );

  return (
    <section>
      <PageHead title="План випічки" sub="Скільки замісів зробити під замовлення і вітрину, і чого не вистачає на складі.">
        <button className="btn ghost" onClick={printPlan} disabled={!plan.rows.length}>🖨 Друк плану</button>
      </PageHead>

      <div className="card pad">
        <div className="row gap wrap plan-top">
          <label className="field"><span className="field-label">На дату</span><input type="date" value={date} onChange={(e) => setDate(e.target.value || tomorrow)} /></label>
          <label className="check"><input type="checkbox" checked={withOverdue} onChange={(e) => setWithOverdue(e.target.checked)} /> Враховувати прострочені невидані замовлення</label>
        </div>
        <p className="muted small">Замовлень на цю дату: <b>{orders.length}</b>. {orders.length > 0 && <button className="link" onClick={markBaking}>Позначити всі як «Готується»</button>}</p>
        <h4>Додатково на вітрину / продаж, шт</h4>
        <div className="extra-grid">
          {state.recipes.filter((r) => r.active).map((r) => (
            <label key={r.id} className="extra-item">
              <span className="ellipsis">{r.emoji} {r.name}</span>
              <Num className="qty" value={Number(extra[r.id]) || 0} onChange={(v) => setExtra(r.id, Math.max(0, Math.round(v)))} />
            </label>
          ))}
        </div>
      </div>

      {plan.rows.length === 0 ? <Empty icon="🥣" title="Нічого пекти">Немає замовлень на цю дату — додайте кількість на вітрину вище.</Empty> : (
        <div className="grid2 top">
          <div className="card pad">
            <h3>Що пекти</h3>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Техкарта</th><th className="r">Треба</th><th className="r">Замісів</th><th className="r">Вийде</th></tr></thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.recipe.id}>
                      <td>{r.recipe.emoji} {r.recipe.name}</td>
                      <td className="r nowrap">{num(Math.round(r.pieces * 100) / 100)} {yieldUnitLabel(r.recipe)}</td>
                      <td className="r strong">{r.batches || '—'}</td>
                      <td className="r nowrap">{num(r.make)} {yieldUnitLabel(r.recipe)}{r.spare > 0.01 && <div className="muted small">+{num(Math.round(r.spare))} про запас</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card pad">
            <div className="row between wrap gap"><h3>Інгредієнти</h3>{shortage.length > 0 && <button className="btn small" onClick={copy}>📋 Список покупок</button>}</div>
            {shortage.length > 0 ? <div className="alert warn">Не вистачає {shortage.length} позицій{can('costs') && <> · докупити приблизно на {money(buyCost, cur)}</>}</div> : <div className="alert ok">Усього вистачає ✓</div>}
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Інгредієнт</th><th className="r">Треба</th><th className="r">Є</th><th className="r">Докупити</th></tr></thead>
                <tbody>
                  {plan.ingredients.map((x) => (
                    <tr key={x.ing.id} className={x.short > 0 ? 'row-warn' : ''}>
                      <td>{x.ing.name}</td>
                      <td className="r nowrap">{fmtQty(Math.round(x.qty), x.ing.baseUnit)}</td>
                      <td className="r nowrap">{fmtQty(Math.max(0, Math.round(x.have)), x.ing.baseUnit)}</td>
                      <td className="r nowrap strong">{x.short > 0 ? <>{fmtQty(Math.round(x.short), x.ing.baseUnit)}<div className="muted small">{x.packs} уп.</div></> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <Toast text={toast} />
    </section>
  );
}
