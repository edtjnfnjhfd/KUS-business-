import { fmtDate, fmtDateTime, labelComposition, money, num, saleTotals } from '../calc.js';
import { paymentLabel } from '../store.js';

/** Касовий чек 58/80 мм (нефіскальний; фіскальний — від Checkbox). */
export function ReceiptDoc({ state, sale, width = 58 }) {
  const t = saleTotals(sale);
  const cur = state.settings.currency;
  const cust = state.customers.find((c) => c.id === sale.customerId);
  return (
    <div className="doc-receipt" style={{ width: `${width - 6}mm` }}>
      <div className="c"><b>{state.settings.brandName}</b>{state.settings.producer && <div className="small">{state.settings.producer}</div>}</div>
      <div className="small c">{fmtDateTime(sale.date)}</div>
      {sale.type === 'return' && <div className="c"><b>ПОВЕРНЕННЯ</b></div>}
      <hr />
      {sale.items.map((i, k) => (
        <div key={k} className="rc-line">
          <div>{i.name}</div>
          <div className="rc-row"><span>{num(i.qty)} × {num(i.price)}</span><span>{num(i.qty * i.price)}</span></div>
        </div>
      ))}
      <hr />
      {t.discount !== 0 && <div className="rc-row"><span>Знижка</span><span>−{num(t.discount)}</span></div>}
      {t.delivery > 0 && <div className="rc-row"><span>Доставка</span><span>{num(t.delivery)}</span></div>}
      {Number(sale.prepaid) > 0 && <div className="rc-row"><span>Передоплата</span><span>−{num(sale.prepaid)}</span></div>}
      <div className="rc-row big"><span>РАЗОМ</span><span>{money(t.revenue - (Number(sale.prepaid) || 0), cur)}</span></div>
      <div className="rc-row small"><span>Оплата</span><span>{paymentLabel(state, sale.payment)}</span></div>
      {cust && <div className="rc-row small"><span>Клієнт</span><span>{cust.name}</span></div>}
      {Number(sale.bonusEarned) > 0 && <div className="rc-row small"><span>Нараховано бонусів</span><span>{num(sale.bonusEarned)}</span></div>}
      {sale.fiscal?.fiscalCode && <div className="small c">Фіскальний номер: {sale.fiscal.fiscalCode}</div>}
      {!sale.fiscal?.fiscalCode && <div className="small c muted">Нефіскальний документ</div>}
      <div className="c small" style={{ marginTop: 6 }}>Дякуємо! 🍪</div>
    </div>
  );
}

/** Видаткова накладна А4 (для опту). */
export function InvoiceDoc({ state, sale }) {
  const t = saleTotals(sale);
  const cur = state.settings.currency;
  const cust = state.customers.find((c) => c.id === sale.customerId);
  const no = sale.number || sale.id.slice(0, 6).toUpperCase();
  return (
    <div className="doc-invoice">
      <h2>Видаткова накладна № {no}</h2>
      <p>від {fmtDate(sale.date)}</p>
      <table className="doc-kv"><tbody>
        <tr><td>Постачальник:</td><td><b>{state.settings.brandName}</b>{state.settings.producer ? `, ${state.settings.producer}` : ''}</td></tr>
        <tr><td>Покупець:</td><td><b>{cust?.name || '—'}</b>{cust?.phone ? `, ${cust.phone}` : ''}{cust?.note ? `, ${cust.note}` : ''}</td></tr>
      </tbody></table>
      <table className="doc-table">
        <thead><tr><th>№</th><th>Найменування</th><th>Од.</th><th>К-сть</th><th>Ціна, {cur}</th><th>Сума, {cur}</th></tr></thead>
        <tbody>
          {sale.items.map((i, k) => (
            <tr key={k}><td>{k + 1}</td><td>{i.name}</td><td>шт</td><td className="r">{num(i.qty)}</td><td className="r">{money(i.price, '')}</td><td className="r">{money(i.qty * i.price, '')}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="doc-total">
        {t.discount !== 0 && <div>Знижка: {money(t.discount, cur)}</div>}
        {t.delivery > 0 && <div>Доставка: {money(t.delivery, cur)}</div>}
        <div><b>Всього до сплати: {money(t.revenue, cur)}</b></div>
        <div className="small">Оплата: {paymentLabel(state, sale.payment)}</div>
      </div>
      <div className="doc-sign"><div>Відпустив ____________________</div><div>Отримав ____________________</div></div>
    </div>
  );
}

/** Етикетки на продукцію. */
export function LabelSheet({ state, recipe, count, date, size, weight }) {
  const comp = recipe.composition || labelComposition(state, recipe.id);
  const made = new Date(date + 'T12:00');
  const until = recipe.shelfLifeDays ? new Date(made.getTime() + recipe.shelfLifeDays * 86400000) : null;
  const one = (k) => (
    <div key={k} className={'label label-' + size}>
      <div className="lb-head"><b>{state.settings.brandName}</b><span>{recipe.name}</span></div>
      {comp && <div className="lb-comp"><b>Склад:</b> {comp}.</div>}
      {recipe.allergens && <div className="lb-all"><b>Алергени:</b> {recipe.allergens}</div>}
      <div className="lb-row">
        {weight > 0 && <span>Маса нетто: {num(weight)} г</span>}
        <span>Виготовлено: {fmtDate(made)}</span>
        {until && <span>Вжити до: {fmtDate(until)}</span>}
      </div>
      {recipe.storage && <div className="lb-small">{recipe.storage}</div>}
      {state.settings.producer && <div className="lb-small">Виробник: {state.settings.producer}</div>}
    </div>
  );
  return <div className={'label-sheet sheet-' + size}>{Array.from({ length: count }, (_, k) => one(k))}</div>;
}
