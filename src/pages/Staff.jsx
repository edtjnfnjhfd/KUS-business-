import { useState } from 'react';
import { ROLES } from '../store.js';
import { PERIODS, money, payroll, periodRange, uid } from '../calc.js';
import { Field, Modal, Num, PageHead, PeriodPicker, Toast, confirmDelete, useToast } from '../components/ui.jsx';

const ROLE_HINT = {
  owner: 'усе, включно з налаштуваннями',
  manager: 'усе, крім налаштувань і персоналу',
  cashier: 'каса, замовлення, чеки, зміни, клієнти, план, етикетки — без собівартості й прибутку',
  baker: 'план випічки, техкарти, етикетки, склад',
};

export default function Staff({ state, update }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [editId, setEditId] = useState(null);
  const [toast, showToast] = useToast();
  const range = periodRange(period, new Date(), custom);
  const rows = payroll(state, range);

  const add = () => {
    const id = uid();
    update((d) => { d.employees.push({ id, name: 'Новий працівник', role: 'cashier', pin: '', ratePerShift: 0, salesPct: 0, active: true }); });
    setEditId(id);
  };
  const pay = (r) => {
    const v = window.prompt(`Виплатити ${r.employee.name}, ${cur}:`, String(Math.max(0, Math.round(r.due))));
    const amount = Number(String(v || '').replace(',', '.'));
    if (!amount) return;
    update((d) => { d.moneyMoves.push({ id: uid(), date: new Date().toISOString(), type: 'salary', accountId: 'cash', employeeId: r.employee.id, amount: -Math.abs(amount), note: r.employee.name }); });
    showToast(`Виплату ${money(amount, cur)} записано (з каси)`);
  };
  const pinOn = state.settings.requirePin;

  return (
    <section>
      <PageHead title="Персонал і зарплата" sub="Працівники, ролі й PIN-коди для входу; нарахування: ставка за зміну + % від продажів.">
        <button className="btn primary" onClick={add}>+ Працівник</button>
      </PageHead>

      <div className="card pad">
        <label className="check">
          <input type="checkbox" checked={!!pinOn} onChange={(e) => {
            if (e.target.checked && !state.employees.some((x) => x.pin && x.role === 'owner')) { window.alert('Спершу задайте PIN власнику — інакше ви не зможете зайти в налаштування.'); return; }
            update((d) => { d.settings.requirePin = e.target.checked; });
          }} />
          Вхід за PIN-кодом (кожен працівник бачить лише свої розділи)
        </label>
        <p className="muted small">PIN захищає від випадкового доступу на спільному планшеті чи телефоні каси. Це не банківський рівень захисту.</p>
      </div>

      <div className="emp-grid">
        {state.employees.map((e) => (
          <button key={e.id} className={'card emp-card' + (e.active === false ? ' dim' : '')} onClick={() => setEditId(e.id)}>
            <span className="avatar">{e.name.slice(0, 1).toUpperCase()}</span>
            <span className="emp-txt"><b>{e.name}</b><span className="muted small">{ROLES[e.role]}{e.pin ? ' · PIN ✓' : ''}{e.active === false ? ' · неактивний' : ''}</span></span>
          </button>
        ))}
      </div>

      <h3 className="group-title">Зарплата</h3>
      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />
      <div className="table-wrap">
        <table className="table stack">
          <thead><tr><th>Працівник</th><th className="r">Змін</th><th className="r">Продажі</th><th className="r">Нараховано</th><th className="r">Виплачено</th><th className="r">До виплати</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee.id}>
                <td data-label="Працівник">{r.employee.name}<div className="muted small">{money(r.employee.ratePerShift || 0, cur)}/зміна{r.employee.salesPct ? ` + ${r.employee.salesPct}%` : ''}</div></td>
                <td data-label="Змін" className="r">{r.shifts}</td>
                <td data-label="Продажі" className="r nowrap">{money(r.revenue, cur)}</td>
                <td data-label="Нараховано" className="r nowrap">{money(r.accrued, cur)}</td>
                <td data-label="Виплачено" className="r nowrap">{money(r.paid, cur)}</td>
                <td data-label="До виплати" className={'r nowrap strong ' + (r.due > 0.009 ? 'neg' : '')}>{money(r.due, cur)}</td>
                <td><button className="btn small ghost" onClick={() => pay(r)}>Виплатити</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Зміни рахуються з «Касових змін» (хто відкрив), продажі — за працівником, який був у системі. Виплати потрапляють у витрати «Зарплата».</p>
      {editId && <EmployeeModal id={editId} state={state} update={update} onClose={() => setEditId(null)} />}
      <Toast text={toast} />
    </section>
  );
}

function EmployeeModal({ id, state, update, onClose }) {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return null;
  const set = (patch) => update((d) => Object.assign(d.employees.find((x) => x.id === id), patch));
  const owners = state.employees.filter((x) => x.role === 'owner' && x.active !== false);
  const remove = () => {
    if (e.role === 'owner' && owners.length <= 1) { window.alert('Не можна видалити єдиного власника.'); return; }
    if (!confirmDelete(`працівника «${e.name}»`)) return;
    update((d) => { d.employees = d.employees.filter((x) => x.id !== id); });
    onClose();
  };
  return (
    <Modal title="Працівник" onClose={onClose}
      footer={<><button className="btn danger ghost" onClick={remove}>Видалити</button><span className="grow" /><button className="btn primary" onClick={onClose}>Готово</button></>}>
      <Field label="Ім’я"><input value={e.name} onChange={(ev) => set({ name: ev.target.value })} /></Field>
      <Field label="Роль" hint={ROLE_HINT[e.role]}>
        <select value={e.role} onChange={(ev) => { if (e.role === 'owner' && owners.length <= 1 && ev.target.value !== 'owner') { window.alert('Має залишитися хоча б один власник.'); return; } set({ role: ev.target.value }); }}>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="PIN-код (4–6 цифр)"><input inputMode="numeric" maxLength={6} value={e.pin || ''} onChange={(ev) => set({ pin: ev.target.value.replace(/\D/g, '') })} /></Field>
      <div className="form-grid">
        <Field label={`Ставка за зміну, ${state.settings.currency}`}><Num value={e.ratePerShift || 0} onChange={(v) => set({ ratePerShift: v })} /></Field>
        <Field label="% від продажів"><Num value={e.salesPct || 0} onChange={(v) => set({ salesPct: v })} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={e.active !== false} onChange={(ev) => set({ active: ev.target.checked })} /> Працює зараз</label>
    </Modal>
  );
}
