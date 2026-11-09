import { useMemo, useState } from 'react';
import { PAYMENTS } from '../store.js';
import { PERIODS, fmtDateTime, money, num, periodRange, inRange, round2, saleTotals, toLocalInput } from '../calc.js';
import { Empty, Field, Modal, Num, PeriodPicker, confirmDelete } from '../components/ui.jsx';

export default function Sales({ state, update, costs }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [editId, setEditId] = useState(null);

  const range = periodRange(period, new Date(), custom);
  const list = useMemo(
    () => state.sales.filter((s) => inRange(s.date, range)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [state.sales, period, custom], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totals = list.reduce((acc, s) => { const t = saleTotals(s); acc.revenue += t.revenue; acc.profit += t.profit; acc.qty += t.qty; return acc; }, { revenue: 0, profit: 0, qty: 0 });

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Історія продажів</h1>
          <p className="muted">{list.length} чеків · {num(totals.qty)} шт · {money(totals.revenue, cur)} виручки · {money(totals.profit, cur)} прибутку</p>
        </div>
      </header>
      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />

      {list.length === 0 ? <Empty icon="🛍️" title="Продажів за цей період немає" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Дата</th><th>Позиції</th><th>Оплата</th><th className="r">Сума</th><th className="r">Прибуток</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const t = saleTotals(s);
                return (
                  <tr key={s.id} className="clickable" onClick={() => setEditId(s.id)}>
                    <td className="nowrap">{fmtDateTime(s.date)}</td>
                    <td>{s.items.map((i) => `${i.name} × ${num(i.qty)}`).join(', ')}{s.note && <div className="muted small">{s.note}</div>}</td>
                    <td>{PAYMENTS[s.payment] || s.payment}</td>
                    <td className="r strong nowrap">{money(t.revenue, cur)}{t.discount > 0 && <div className="muted small">знижка {money(t.discount, cur)}</div>}</td>
                    <td className={'r nowrap ' + (t.profit < 0 ? 'neg' : '')}>{money(t.profit, cur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editId && <SaleModal id={editId} state={state} update={update} costs={costs} onClose={() => setEditId(null)} />}
    </section>
  );
}

function SaleModal({ id, state, update, costs, onClose }) {
  const s = state.sales.find((x) => x.id === id);
  if (!s) return null;
  const cur = state.settings.currency;
  const set = (fn) => update((d) => fn(d.sales.find((x) => x.id === id)));
  const t = saleTotals(s);

  const remove = () => {
    if (!confirmDelete('цей продаж')) return;
    update((d) => { d.sales = d.sales.filter((x) => x.id !== id); });
    onClose();
  };
  const refreshCost = () => set((x) => { for (const i of x.items) { const c = costs.get(i.recipeId); if (c) i.cost = round2(c.perPiece); } });

  return (
    <Modal title="Редагування продажу" onClose={onClose} wide
      footer={<><button className="btn danger ghost" onClick={remove}>Видалити продаж</button><span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      <div className="grid2">
        <Field label="Дата й час"><input type="datetime-local" value={toLocalInput(s.date)} onChange={(e) => e.target.value && set((x) => { x.date = new Date(e.target.value).toISOString(); })} /></Field>
        <Field label="Оплата">
          <select value={s.payment} onChange={(e) => set((x) => { x.payment = e.target.value; })}>
            {Object.entries(PAYMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <table className="table compact">
        <thead><tr><th>Товар</th><th className="r">К-сть</th><th className="r">Ціна</th><th className="r">Собівартість / шт</th><th /></tr></thead>
        <tbody>
          {s.items.map((i, k) => (
            <tr key={k}>
              <td>{i.name}</td>
              <td className="r"><Num className="inline" value={i.qty} onChange={(v) => set((x) => { x.items[k].qty = v; })} /></td>
              <td className="r"><Num className="inline" value={i.price} onChange={(v) => set((x) => { x.items[k].price = v; })} /></td>
              <td className="r"><Num className="inline" value={i.cost} onChange={(v) => set((x) => { x.items[k].cost = v; })} /></td>
              <td><button className="icon-btn" onClick={() => set((x) => { x.items.splice(k, 1); })} aria-label="Прибрати">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn small ghost" onClick={refreshCost}>↻ Підставити поточну собівартість</button>
      <div className="grid2">
        <Field label={`Знижка, ${cur}`}><Num value={s.discount} onChange={(v) => set((x) => { x.discount = v; })} /></Field>
        <Field label="Коментар"><input value={s.note || ''} onChange={(e) => set((x) => { x.note = e.target.value; })} /></Field>
      </div>
      <p><b>Разом: {money(t.revenue, cur)}</b> · прибуток {money(t.profit, cur)}</p>
    </Modal>
  );
}
