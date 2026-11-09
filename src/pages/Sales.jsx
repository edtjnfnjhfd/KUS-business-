import { useMemo, useState } from 'react';
import { DEBT, paymentLabel } from '../store.js';
import { PERIODS, consumptionFor, fmtDateTime, inRange, money, num, periodRange, round2, saleTotals, toLocalInput } from '../calc.js';
import { buildReturn } from '../checkout.js';
import { fiscalize, explainFiscalError } from '../fiscal.js';
import { Badge, Empty, Field, Modal, Num, PageHead, PeriodPicker, Toast, confirmDelete, useToast } from '../components/ui.jsx';
import { printDoc } from '../components/Print.jsx';
import { InvoiceDoc, ReceiptDoc } from '../components/Docs.jsx';

export default function Sales({ state, update, costs, can }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState({});
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [toast, showToast] = useToast();

  const range = periodRange(period, new Date(), custom);
  const custName = useMemo(() => new Map(state.customers.map((c) => [c.id, c.name])), [state.customers]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.sales
      .filter((x) => inRange(x.date, range))
      .filter((x) => !s || x.items.some((i) => i.name.toLowerCase().includes(s)) || (custName.get(x.customerId) || '').toLowerCase().includes(s) || (x.note || '').toLowerCase().includes(s))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state.sales, period, custom, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = list.reduce((acc, s) => { const t = saleTotals(s); acc.revenue += t.revenue; acc.profit += t.profit; acc.qty += t.qty; return acc; }, { revenue: 0, profit: 0, qty: 0 });

  return (
    <section>
      <PageHead title="Чеки" sub={`${list.length} чеків · ${num(totals.qty)} шт · ${money(totals.revenue, cur)}${can('costs') ? ` · прибуток ${money(totals.profit, cur)}` : ''}`} />
      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />
      <div className="toolbar"><input className="search" placeholder="Пошук: товар, клієнт, коментар…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      {list.length === 0 ? <Empty icon="🧮" title="Чеків за цей період немає" /> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Дата</th><th>Позиції</th><th>Клієнт / канал</th><th>Оплата</th><th className="r">Сума</th>{can('costs') && <th className="r">Прибуток</th>}</tr></thead>
            <tbody>
              {list.map((s) => {
                const t = saleTotals(s);
                return (
                  <tr key={s.id} className="clickable" onClick={() => setOpenId(s.id)}>
                    <td data-label="Дата" className="nowrap">{fmtDateTime(s.date)}{s.type === 'return' && <> <Badge tone="red">повернення</Badge></>}</td>
                    <td data-label="Позиції">{s.items.map((i) => `${i.name} × ${num(Math.abs(i.qty))}`).join(', ')}{s.note && <div className="muted small">{s.note}</div>}</td>
                    <td data-label="Клієнт">{custName.get(s.customerId) || <span className="muted">—</span>}{s.channel && <div className="muted small">{s.channel}</div>}</td>
                    <td data-label="Оплата">{paymentLabel(state, s.payment)}{s.fiscal && <div className="small">{s.fiscal.fiscalCode ? <Badge tone="green">ПРРО ✓</Badge> : s.fiscal.status === 'error' ? <Badge tone="red">ПРРО ✕</Badge> : <Badge tone="amber">ПРРО…</Badge>}</div>}</td>
                    <td data-label="Сума" className="r strong nowrap">{money(t.revenue, cur)}{t.discount > 0 && <div className="muted small">знижка {money(t.discount, cur)}</div>}</td>
                    {can('costs') && <td data-label="Прибуток" className={'r nowrap ' + (t.profit < 0 ? 'neg' : '')}>{money(t.profit, cur)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {openId && <SaleModal id={openId} state={state} update={update} costs={costs} can={can} toast={showToast} onClose={() => setOpenId(null)} />}
      <Toast text={toast} />
    </section>
  );
}

function SaleModal({ id, state, update, costs, can, toast, onClose }) {
  const s = state.sales.find((x) => x.id === id);
  const [ret, setRet] = useState(null); // кількості для повернення
  const [busy, setBusy] = useState(false);
  if (!s) return null;
  const cur = state.settings.currency;
  const editable = can('editSales');
  const set = (fn) => update((d) => fn(d.sales.find((x) => x.id === id)));
  const t = saleTotals(s);
  const cust = state.customers.find((c) => c.id === s.customerId);
  const returned = state.sales.filter((x) => x.returnOf === s.id);

  const remove = () => {
    if (!confirmDelete('цей чек (склад і звіти перерахуються)')) return;
    update((d) => { d.sales = d.sales.filter((x) => x.id !== id); const o = d.orders.find((x) => x.saleId === id); if (o) { o.status = 'ready'; o.saleId = ''; } });
    onClose();
  };
  const refreshCost = () => set((x) => {
    for (const i of x.items) { const c = costs.get(i.recipeId); if (c) i.cost = round2(c.perPiece); }
    if (x.type !== 'return') x.consumption = consumptionFor(state, x.items);
  });
  const doReturn = () => {
    const lines = s.items.map((i, k) => ({ ...i, qty: Number(ret[k]) || 0 })).filter((l) => l.qty > 0);
    if (!lines.length) return;
    const r = buildReturn(state, costs, s, lines);
    update((d) => { d.sales.push(r); });
    setRet(null);
    toast(`Повернення на ${money(Math.abs(saleTotals(r).revenue), cur)} оформлено`);
  };
  const retryFiscal = async () => {
    setBusy(true);
    try {
      const f = await fiscalize(state, s);
      set((x) => { x.fiscal = f; });
      toast('Фіскальний чек створено ✓');
    } catch (e) {
      set((x) => { x.fiscal = { status: 'error', error: explainFiscalError(e) }; });
      toast('⚠️ ' + explainFiscalError(e));
    } finally { setBusy(false); }
  };

  return (
    <Modal title={s.type === 'return' ? 'Повернення' : 'Чек'} onClose={onClose} wide
      footer={<>
        {editable && <button className="btn danger ghost" onClick={remove}>Видалити</button>}
        <span className="grow" />
        <button className="btn ghost" onClick={() => printDoc(<ReceiptDoc state={state} sale={s} />, { page: '58mm auto', margin: '2mm' })}>🖨 Чек</button>
        <button className="btn ghost" onClick={() => printDoc(<InvoiceDoc state={state} sale={s} />)}>📄 Накладна</button>
        <button className="btn primary" onClick={onClose}>Готово</button>
      </>}>
      <div className="grid2">
        <Field label="Дата й час"><input type="datetime-local" disabled={!editable} value={toLocalInput(s.date)} onChange={(e) => e.target.value && set((x) => { x.date = new Date(e.target.value).toISOString(); })} /></Field>
        <Field label="Оплата">
          <select value={s.payment} disabled={!editable} onChange={(e) => set((x) => { x.payment = e.target.value; })}>
            {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value={DEBT}>В борг</option>
            {s.payment === 'other' && <option value="other">Інше</option>}
          </select>
        </Field>
        <Field label="Канал">
          <select value={s.channel || ''} disabled={!editable} onChange={(e) => set((x) => { x.channel = e.target.value; })}>
            <option value="">—</option>
            {state.settings.channels.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Клієнт"><div className="readout">{cust ? `${cust.name} ${cust.phone || ''}` : '—'}</div></Field>
      </div>

      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>Товар</th><th className="r">К-сть</th><th className="r">Ціна</th>{can('costs') && <th className="r">Собів./шт</th>}{ret && <th className="r">Повернути</th>}</tr></thead>
          <tbody>
            {s.items.map((i, k) => (
              <tr key={k}>
                <td>{i.name}</td>
                <td className="r">{editable ? <Num className="qty" value={i.qty} onChange={(v) => set((x) => { x.items[k].qty = v; if (x.type !== 'return') x.consumption = consumptionFor(state, x.items); })} /> : num(i.qty)}</td>
                <td className="r">{editable ? <Num className="price-in" value={i.price} onChange={(v) => set((x) => { x.items[k].price = v; })} /> : money(i.price, cur)}</td>
                {can('costs') && <td className="r">{editable ? <Num className="price-in" value={i.cost} onChange={(v) => set((x) => { x.items[k].cost = v; })} /> : money(i.cost, cur)}</td>}
                {ret && <td className="r"><Num className="qty" value={ret[k] || 0} onChange={(v) => setRet({ ...ret, [k]: Math.min(Math.abs(i.qty), Math.max(0, v)) })} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && can('costs') && <button className="btn small ghost" onClick={refreshCost}>↻ Підставити поточну собівартість</button>}
      <div className="grid2" style={{ marginTop: 12 }}>
        <Field label={`Знижка, ${cur}`}><Num value={s.discount} disabled={!editable} onChange={(v) => set((x) => { x.discount = v; })} /></Field>
        <Field label="Коментар"><input value={s.note || ''} disabled={!editable} onChange={(e) => set((x) => { x.note = e.target.value; })} /></Field>
      </div>
      <p><b>Разом: {money(t.revenue, cur)}</b>{Number(s.prepaid) > 0 && <> · з них передоплата {money(s.prepaid, cur)}</>}{can('costs') && <> · прибуток {money(t.profit, cur)}</>}</p>
      {Number(s.bonusEarned) !== 0 && <p className="muted small">Бонуси: нараховано {money(s.bonusEarned, cur)}{s.bonusUsed ? `, списано ${money(s.bonusUsed, cur)}` : ''}</p>}

      {s.fiscal && (
        <div className={'alert ' + (s.fiscal.fiscalCode ? 'ok' : s.fiscal.status === 'error' ? 'err' : 'info')}>
          {s.fiscal.fiscalCode ? <>Фіскальний чек № {s.fiscal.fiscalCode} {s.fiscal.url && <a href={s.fiscal.url} target="_blank" rel="noreferrer">відкрити</a>}</> : s.fiscal.status === 'error' ? <>ПРРО: {s.fiscal.error}</> : <>ПРРО: {s.fiscal.status}</>}
          {!s.fiscal.fiscalCode && state.settings.checkbox.enabled && <button className="btn small" disabled={busy} onClick={retryFiscal}>{busy ? '…' : 'Повторити'}</button>}
        </div>
      )}
      {!s.fiscal && state.settings.checkbox.enabled && s.payment !== DEBT && (
        <button className="btn small ghost" disabled={busy} onClick={retryFiscal}>{busy ? 'Фіскалізую…' : '🧾 Видати фіскальний чек'}</button>
      )}

      {s.type !== 'return' && (
        <div className="return-box">
          {returned.length > 0 && <p className="muted small">Вже повернуто: {returned.map((r) => money(Math.abs(saleTotals(r).revenue), cur)).join(', ')}</p>}
          {!ret ? <button className="btn ghost small" onClick={() => setRet({})}>↩ Оформити повернення</button> : (
            <div className="row gap wrap">
              <span className="small">Вкажіть кількість у колонці «Повернути». Гроші повертаються тим самим способом оплати.</span>
              <button className="btn small primary" onClick={doReturn}>Підтвердити повернення</button>
              <button className="btn small ghost" onClick={() => setRet(null)}>Скасувати</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
