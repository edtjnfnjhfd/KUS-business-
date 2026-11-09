import { useState } from 'react';
import { DEBT, ORDER_STATUSES, nextOrderNumber, paymentLabel } from '../store.js';
import { dayKey, fmtDateTime, money, num, saleTotals, toLocalInput, uid } from '../calc.js';
import { buildSale, priceFor } from '../checkout.js';
import { Badge, CustomerPicker, Empty, Field, Modal, Num, PageHead, Seg, Toast, confirmDelete, useToast } from '../components/ui.jsx';

const FILTERS = [
  { id: 'active', label: 'Активні' },
  { id: 'today', label: 'Сьогодні' },
  { id: 'tomorrow', label: 'Завтра' },
  { id: 'done', label: 'Видані' },
  { id: 'cancelled', label: 'Скасовані' },
  { id: 'all', label: 'Усі' },
];
const FLOW = ['new', 'confirmed', 'baking', 'ready'];

export function orderTotal(o) {
  return saleTotals({ items: o.items, discount: o.discount }).revenue;
}

export default function Orders({ state, update, costs, user }) {
  const cur = state.settings.currency;
  const [filter, setFilter] = useState('active');
  const [editId, setEditId] = useState(null);
  const [issueId, setIssueId] = useState(null);
  const [toast, showToast] = useToast();
  const now = new Date();
  const tKey = dayKey(now);
  const tmKey = dayKey(new Date(now.getTime() + 86400000));

  const list = state.orders.filter((o) => {
    const active = !['done', 'cancelled'].includes(o.status);
    switch (filter) {
      case 'active': return active;
      case 'today': return active && o.dueAt && dayKey(o.dueAt) <= tKey;
      case 'tomorrow': return active && o.dueAt && dayKey(o.dueAt) === tmKey;
      case 'done': return o.status === 'done';
      case 'cancelled': return o.status === 'cancelled';
      default: return true;
    }
  }).sort((a, b) => (['done', 'cancelled'].includes(filter) ? new Date(b.dueAt) - new Date(a.dueAt) : new Date(a.dueAt) - new Date(b.dueAt)));

  const create = () => {
    const id = uid();
    const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(12, 0, 0, 0);
    update((d) => {
      d.orders.push({ id, number: nextOrderNumber(d), createdAt: new Date().toISOString(), dueAt: due.toISOString(), status: 'new', customerId: '', channel: 'Instagram', delivery: 'pickup', address: '', items: [], discount: 0, prepaid: 0, prepaidAccount: '', note: '' });
    });
    setEditId(id);
  };
  const setStatus = (id, status) => update((d) => { d.orders.find((o) => o.id === id).status = status; });
  const cancel = (o) => {
    if (!window.confirm(`Скасувати замовлення №${o.number}?`)) return;
    const refund = Number(o.prepaid) > 0 && window.confirm(`Повернути клієнту передоплату ${money(o.prepaid, cur)}? (OK — повернули, Скасувати — гроші лишаються)`);
    update((d) => { const x = d.orders.find((y) => y.id === o.id); x.status = 'cancelled'; x.prepaidRefunded = refund; });
  };

  return (
    <section>
      <PageHead title="Замовлення" sub="Передзамовлення з Instagram, Telegram, бокси до свят. Видане замовлення автоматично стає продажем.">
        <button className="btn primary" onClick={create}>+ Нове замовлення</button>
      </PageHead>
      <Seg value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, label: f.label + (f.id === 'active' ? ` (${state.orders.filter((o) => !['done', 'cancelled'].includes(o.status)).length})` : '') }))} />

      {list.length === 0 ? <Empty icon="📦" title="Замовлень немає">Створіть замовлення тут або з каси кнопкою «Оформити як замовлення».</Empty> : (
        <div className="order-list">
          {list.map((o) => {
            const c = state.customers.find((x) => x.id === o.customerId);
            const total = orderTotal(o);
            const overdue = !['done', 'cancelled'].includes(o.status) && new Date(o.dueAt) < now;
            const st = ORDER_STATUSES[o.status] || ORDER_STATUSES.new;
            const nextSt = FLOW[FLOW.indexOf(o.status) + 1];
            return (
              <article key={o.id} className={'card order-card' + (overdue ? ' overdue' : '')}>
                <div className="oc-head">
                  <b className="oc-num">№{o.number}</b>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className={'oc-due' + (overdue ? ' neg' : '')}>🗓 {fmtDateTime(o.dueAt)}</span>
                </div>
                <div className="oc-body" onClick={() => setEditId(o.id)} role="button" tabIndex={0}>
                  <div className="oc-cust">{c ? <><b>{c.name}</b> <span className="muted">{c.phone}</span></> : <span className="muted">Без клієнта</span>}</div>
                  <div className="oc-items">{o.items.length ? o.items.map((i) => `${i.name} × ${num(i.qty)}`).join(', ') : <span className="muted">Немає позицій</span>}</div>
                  <div className="oc-meta muted small">
                    {o.delivery === 'delivery' ? `🚗 Доставка${o.address ? ': ' + o.address : ''}` : '🏠 Самовивіз'}{o.channel ? ` · ${o.channel}` : ''}{o.note ? ` · ${o.note}` : ''}
                  </div>
                </div>
                <div className="oc-foot">
                  <div className="oc-sum">
                    <b>{money(total, cur)}</b>
                    {Number(o.prepaid) > 0 && <span className="muted small">передоплата {money(o.prepaid, cur)}</span>}
                  </div>
                  <div className="oc-actions">
                    {nextSt && <button className="btn small ghost" onClick={() => setStatus(o.id, nextSt)}>→ {ORDER_STATUSES[nextSt].label}</button>}
                    {!['done', 'cancelled'].includes(o.status) && <button className="btn small primary" onClick={() => setIssueId(o.id)} disabled={!o.items.length}>Видати</button>}
                    {!['done', 'cancelled'].includes(o.status) && <button className="btn small ghost danger" onClick={() => cancel(o)}>Скасувати</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editId && <OrderModal id={editId} state={state} update={update} onClose={() => setEditId(null)} />}
      {issueId && <IssueModal id={issueId} state={state} update={update} costs={costs} user={user} onDone={(m) => { setIssueId(null); showToast(m); }} onClose={() => setIssueId(null)} />}
      <Toast text={toast} />
    </section>
  );
}

function OrderModal({ id, state, update, onClose }) {
  const o = state.orders.find((x) => x.id === id);
  const [addId, setAddId] = useState('');
  if (!o) return null;
  const cur = state.settings.currency;
  const customer = state.customers.find((c) => c.id === o.customerId);
  const set = (fn) => update((d) => fn(d.orders.find((x) => x.id === id)));
  const total = orderTotal(o);
  const locked = o.status === 'done';

  const addItem = (rid) => {
    const r = state.recipes.find((x) => x.id === rid);
    if (!r) return;
    set((x) => {
      const ex = x.items.find((i) => i.recipeId === rid);
      if (ex) ex.qty += 1; else x.items.push({ recipeId: r.id, name: r.name, qty: 1, price: priceFor(r, customer) });
    });
    setAddId('');
  };
  const remove = () => {
    if (!confirmDelete(`замовлення №${o.number}`)) return;
    update((d) => { d.orders = d.orders.filter((x) => x.id !== id); });
    onClose();
  };

  return (
    <Modal title={`Замовлення №${o.number}`} onClose={onClose} wide
      footer={<>{!locked && <button className="btn danger ghost" onClick={remove}>Видалити</button>}<span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      {locked && <div className="alert info">Замовлення вже видане — зміни сюди не впливають на продаж. Редагуйте продаж у розділі «Чеки».</div>}
      <div className="grid2">
        <Field label="Клієнт">
          <CustomerPicker customers={state.customers} value={o.customerId} onChange={(v) => set((x) => { x.customerId = v; })}
            onCreate={(name) => { const cid = uid(); update((d) => { d.customers.push({ id: cid, name, phone: '', type: 'retail', discountPct: 0 }); }); return cid; }} />
        </Field>
        <Field label="Дата й час видачі"><input type="datetime-local" value={toLocalInput(o.dueAt)} onChange={(e) => e.target.value && set((x) => { x.dueAt = new Date(e.target.value).toISOString(); })} /></Field>
        <Field label="Отримання">
          <select value={o.delivery} onChange={(e) => set((x) => { x.delivery = e.target.value; })}>
            <option value="pickup">Самовивіз</option>
            <option value="delivery">Доставка</option>
          </select>
        </Field>
        <Field label="Канал">
          <select value={o.channel || ''} onChange={(e) => set((x) => { x.channel = e.target.value; })}>
            <option value="">—</option>
            {state.settings.channels.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        {o.delivery === 'delivery' && <Field label="Адреса доставки" className="span2"><input value={o.address || ''} onChange={(e) => set((x) => { x.address = e.target.value; })} /></Field>}
        <Field label="Статус">
          <select value={o.status} onChange={(e) => set((x) => { x.status = e.target.value; })} disabled={locked}>
            {Object.entries(ORDER_STATUSES).filter(([k]) => k !== 'done' || locked).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>

      <h4>Позиції</h4>
      <div className="line-list">
        {o.items.map((i, k) => (
          <div key={k} className="line-row">
            <span className="grow ellipsis">{i.name}</span>
            <Num className="qty" value={i.qty} onChange={(v) => set((x) => { x.items[k].qty = v; })} aria-label="Кількість" />
            <span className="muted">×</span>
            <Num className="price-in" value={i.price} onChange={(v) => set((x) => { x.items[k].price = v; })} aria-label="Ціна" />
            <b className="line-sum">{money(i.qty * i.price, cur)}</b>
            <button className="icon-btn" onClick={() => set((x) => { x.items.splice(k, 1); })} aria-label="Прибрати">✕</button>
          </div>
        ))}
      </div>
      <select className="full" value={addId} onChange={(e) => addItem(e.target.value)} aria-label="Додати товар">
        <option value="">+ Додати товар…</option>
        {state.recipes.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.name} — {money(priceFor(r, customer), cur)}</option>)}
      </select>

      <div className="grid3" style={{ marginTop: 12 }}>
        <Field label={`Знижка, ${cur}`}><Num value={o.discount} onChange={(v) => set((x) => { x.discount = v; })} /></Field>
        <Field label={`Передоплата, ${cur}`}><Num value={o.prepaid} onChange={(v) => set((x) => { x.prepaid = v; if (!x.prepaidAt) x.prepaidAt = new Date().toISOString(); if (!x.prepaidAccount) x.prepaidAccount = state.accounts[1]?.id || 'cash'; })} /></Field>
        <Field label="Куди надійшла">
          <select value={o.prepaidAccount || ''} onChange={(e) => set((x) => { x.prepaidAccount = e.target.value; })}>
            <option value="">—</option>
            {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Коментар (побажання, напис на коробці…)"><textarea rows={2} value={o.note || ''} onChange={(e) => set((x) => { x.note = e.target.value; })} /></Field>
      <p className="row between"><span>Разом: <b>{money(total, cur)}</b></span><span>До оплати при видачі: <b>{money(total - (Number(o.prepaid) || 0), cur)}</b></span></p>
    </Modal>
  );
}

function IssueModal({ id, state, update, costs, user, onClose, onDone }) {
  const o = state.orders.find((x) => x.id === id);
  const cur = state.settings.currency;
  const [payment, setPayment] = useState(o.customerId ? 'cash' : 'cash');
  const total = orderTotal(o);
  const rest = total - (Number(o.prepaid) || 0);
  const issue = () => {
    const sale = buildSale(state, costs, {
      items: o.items, discount: o.discount, payment, customerId: o.customerId, channel: o.channel,
      note: `Замовлення №${o.number}${o.note ? ': ' + o.note : ''}`, prepaid: o.prepaid, orderId: o.id, employeeId: user?.id,
    });
    update((d) => {
      d.sales.push(sale);
      const x = d.orders.find((y) => y.id === id);
      x.status = 'done'; x.saleId = sale.id; x.doneAt = sale.date;
    });
    onDone(`Замовлення №${o.number} видано, продаж ${money(total, cur)} записано`);
  };
  const opts = [...state.accounts.map((a) => ({ id: a.id, label: a.name })), ...(o.customerId ? [{ id: DEBT, label: 'В борг' }] : [])];
  return (
    <Modal title={`Видати замовлення №${o.number}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Скасувати</button><span className="grow" /><button className="btn primary" onClick={issue}>Видати і записати продаж</button></>}>
      <p>Сума замовлення: <b>{money(total, cur)}</b>{Number(o.prepaid) > 0 && <> · передоплата {money(o.prepaid, cur)} ({paymentLabel(state, o.prepaidAccount)})</>}</p>
      <p>Доплата при видачі: <b className="big-num">{money(rest, cur)}</b></p>
      {rest > 0 && (
        <Field label="Як оплачує доплату">
          <div className="chips">{opts.map((p) => <button key={p.id} className={'chip' + (payment === p.id ? ' on' : '')} onClick={() => setPayment(p.id)}>{p.label}</button>)}</div>
        </Field>
      )}
      <p className="muted small">Склад спишеться за техкартами, собівартість зафіксується на момент видачі.</p>
    </Modal>
  );
}
