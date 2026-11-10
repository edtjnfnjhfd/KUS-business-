import { useState } from 'react';
import { PERIODS, plural, TRANSPORT_CATEGORIES, TRANSPORT_KINDS, buildReport, dayKey, fmtDate, inRange, money, periodRange, uid } from '../calc.js';
import { Empty, Field, Modal, Num, PageHead, PeriodPicker, Stat, Toast, confirmDelete, useToast } from '../components/ui.jsx';

/** Витрата на поїздку (таксі, водій…). Зберігається як витрата категорії «Транспорт». */
export function TransportForm({ state, update, orderId = '', onDone, compact }) {
  const cur = state.settings.currency;
  const [f, setF] = useState({ date: dayKey(new Date()), kind: TRANSPORT_KINDS[0], amount: 0, accountId: 'cash', orderId, note: '' });
  const recentOrders = state.orders
    .filter((o) => o.delivery === 'delivery' && o.status !== 'cancelled')
    .sort((a, b) => new Date(b.dueAt) - new Date(a.dueAt))
    .slice(0, 40);
  const cust = (o) => state.customers.find((c) => c.id === o.customerId)?.name || '';

  const save = (e) => {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) return;
    update((d) => {
      d.expenses.push({ id: uid(), date: new Date(f.date + 'T12:00').toISOString(), category: 'Транспорт', kind: f.kind, amount: Number(f.amount), accountId: f.accountId, orderId: f.orderId, note: f.note });
    });
    setF({ ...f, amount: 0, note: '', orderId: compact ? orderId : '' });
    onDone?.(`Поїздку на ${money(f.amount, cur)} записано`);
  };

  return (
    <form onSubmit={save}>
      <div className="form-grid">
        <Field label="Дата"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value || dayKey(new Date()) })} /></Field>
        <Field label="Що саме">
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{TRANSPORT_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </Field>
        <Field label={`Сума, ${cur}`}><Num value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Оплачено з">
          <select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
            {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="">Не з рахунків бізнесу</option>
          </select>
        </Field>
        {!compact && (
          <Field label="До замовлення" hint="необов’язково">
            <select value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })}>
              <option value="">—</option>
              {recentOrders.map((o) => <option key={o.id} value={o.id}>№{o.number} · {fmtDate(o.dueAt)}{cust(o) ? ` · ${cust(o)}` : ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Коментар" className={compact ? '' : 'span2'}><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Uklon, Bolt, куди їхали…" /></Field>
      </div>
      <button className="btn primary" type="submit">+ Записати поїздку</button>
    </form>
  );
}

export default function Transport({ state, update }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [toast, showToast] = useToast();
  const [editId, setEditId] = useState(null);
  const range = periodRange(period, new Date(), custom);
  const rep = buildReport(state, range);
  const list = state.expenses
    .filter((e) => TRANSPORT_CATEGORIES.includes(e.category) && inRange(e.date, range))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const avgTrip = list.length ? rep.transport / list.length : 0;
  const fee = Number(state.settings.deliveryFee) || 0;
  const orderNo = (id) => state.orders.find((o) => o.id === id)?.number;

  return (
    <section>
      <PageHead title="Транспорт і доставка" sub={`Скільки клієнти заплатили за доставку і скільки пішло на таксі/водія. Ціна доставки для клієнта зараз: ${money(fee, cur)} (змінюється в Налаштуваннях → Облік).`} />
      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />

      <div className="stats stats-3">
        <Stat label="Зібрано за доставку" value={money(rep.delivery, cur)} sub={plural(rep.deliveries, ['доставка', 'доставки', 'доставок'])} />
        <Stat label="Витрати на транспорт" value={money(rep.transport, cur)} sub={`${plural(list.length, ['поїздка', 'поїздки', 'поїздок'])} · сер. ${money(avgTrip, cur)}`} />
        <Stat label="Результат доставки" value={money(rep.deliveryResult, cur)} tone={rep.deliveryResult < 0 ? 'neg' : 'pos'} sub={rep.deliveryResult < 0 ? 'доставка в мінусі' : 'доставка окупається'} />
      </div>
      {list.length > 2 && fee > 0 && avgTrip > fee && (
        <div className="alert warn">Середня поїздка ({money(avgTrip, cur)}) дорожча за ціну доставки для клієнта ({money(fee, cur)}). Варто підняти ціну доставки, об’єднувати кілька замовлень в одну поїздку або ставити мінімальну суму замовлення.</div>
      )}

      <div className="card pad">
        <h3>Нова поїздка</h3>
        <TransportForm state={state} update={update} onDone={showToast} />
      </div>

      {list.length === 0 ? <Empty icon="🚗" title="Поїздок за цей період немає" /> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Дата</th><th>Що</th><th>Замовлення</th><th>Коментар</th><th className="r">Сума</th><th /></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setEditId(e.id)}>
                  <td data-label="Дата" className="nowrap">{fmtDate(e.date)}</td>
                  <td data-label="Що">{e.kind || e.category}</td>
                  <td data-label="Замовлення">{e.orderId && orderNo(e.orderId) ? `№${orderNo(e.orderId)}` : <span className="muted">—</span>}</td>
                  <td data-label="Коментар">{e.note || <span className="muted">—</span>}</td>
                  <td data-label="Сума" className="r strong nowrap">{money(e.amount, cur)}</td>
                  <td><button className="icon-btn" onClick={(ev) => { ev.stopPropagation(); if (confirmDelete('поїздку')) update((d) => { d.expenses = d.expenses.filter((x) => x.id !== e.id); }); }} aria-label="Видалити">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Поїздки — це звичайні витрати (категорія «Транспорт»), тож вони вже віднімаються в «Звітах» від чистого прибутку. Гроші, які клієнт платить за доставку, йдуть окремим рядком чеку і не змішуються з виручкою від печива.</p>
      {editId && <EditTrip id={editId} state={state} update={update} onClose={() => setEditId(null)} />}
      <Toast text={toast} />
    </section>
  );
}

function EditTrip({ id, state, update, onClose }) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return null;
  const cur = state.settings.currency;
  const set = (patch) => update((d) => { Object.assign(d.expenses.find((x) => x.id === id), patch); });
  return (
    <Modal title="Поїздка" onClose={onClose} footer={<><span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      <div className="form-grid">
        <Field label="Дата"><input type="date" value={dayKey(e.date)} onChange={(ev) => ev.target.value && set({ date: new Date(ev.target.value + 'T12:00').toISOString() })} /></Field>
        <Field label="Що саме"><select value={e.kind || TRANSPORT_KINDS[0]} onChange={(ev) => set({ kind: ev.target.value })}>{TRANSPORT_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label={`Сума, ${cur}`}><Num value={e.amount} onChange={(v) => set({ amount: v })} /></Field>
        <Field label="Оплачено з">
          <select value={e.accountId || ''} onChange={(ev) => set({ accountId: ev.target.value })}>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="">—</option></select>
        </Field>
      </div>
      <Field label="Коментар"><input value={e.note || ''} onChange={(ev) => set({ note: ev.target.value })} /></Field>
    </Modal>
  );
}
