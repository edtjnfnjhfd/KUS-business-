import { useState } from 'react';
import { fmtDateTime, money, shiftCash, uid } from '../calc.js';
import { sendTelegram, shiftText } from '../telegram.js';
import { checkboxCloseShift, checkboxOpenShift, explainFiscalError } from '../fiscal.js';
import { Empty, Field, Num, PageHead, Stat, Toast, useToast } from '../components/ui.jsx';

export default function Shifts({ state, update, user, can }) {
  const cur = state.settings.currency;
  const open = state.shifts.find((s) => !s.closedAt);
  const last = [...state.shifts].filter((s) => s.closedAt).sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))[0];
  const [opening, setOpening] = useState(last ? Number(last.countedCash) || 0 : 0);
  const [counted, setCounted] = useState(0);
  const [note, setNote] = useState('');
  const [mv, setMv] = useState({ type: 'withdraw', amount: 0, note: '' });
  const [toast, showToast] = useToast();
  const [busy, setBusy] = useState(false);
  const empName = (id) => state.employees.find((e) => e.id === id)?.name || '—';
  const cb = state.settings.checkbox;

  const openShift = async () => {
    update((d) => { d.shifts.push({ id: uid(), openedAt: new Date().toISOString(), employeeId: user?.id || '', openingCash: Number(opening) || 0 }); });
    showToast('Зміну відкрито');
    if (cb.enabled) {
      try { await checkboxOpenShift(cb); showToast('Зміну відкрито (і в Checkbox)'); } catch (e) { showToast('Checkbox: ' + explainFiscalError(e)); }
    }
  };
  const closeShift = async () => {
    const c = shiftCash(state, open);
    const diff = (Number(counted) || 0) - c.expected;
    if (Math.abs(diff) >= 0.01 && !window.confirm(`${diff < 0 ? 'Нестача' : 'Надлишок'} ${money(Math.abs(diff), cur)}. Закрити зміну?`)) return;
    const closed = { ...open, closedAt: new Date().toISOString(), countedCash: Number(counted) || 0, expectedCash: c.expected, note };
    update((d) => { Object.assign(d.shifts.find((s) => s.id === open.id), closed); });
    setNote(''); setCounted(0); setOpening(Number(counted) || 0);
    setBusy(true);
    const msgs = ['Зміну закрито'];
    if (cb.enabled) {
      try { const r = await checkboxCloseShift(cb); if (r) msgs.push('Z-звіт Checkbox ✓'); } catch (e) { msgs.push('Checkbox: ' + explainFiscalError(e)); }
    }
    const tg = state.settings.telegram;
    if (tg.onShiftClose && tg.token && tg.chatId) {
      try { await sendTelegram(tg, shiftText(state, closed, empName(closed.employeeId))); msgs.push('звіт у Telegram ✓'); } catch (e) { msgs.push(e.message); }
    }
    setBusy(false);
    showToast(msgs.join(' · '));
  };
  const addMove = () => {
    if (!mv.amount) return;
    const sign = mv.type === 'withdraw' ? -1 : 1;
    update((d) => { d.moneyMoves.push({ id: uid(), date: new Date().toISOString(), type: mv.type, accountId: 'cash', amount: sign * Math.abs(Number(mv.amount)), note: mv.note, employeeId: user?.id || '' }); });
    setMv({ ...mv, amount: 0, note: '' });
    showToast(mv.type === 'withdraw' ? 'Вилучення записано' : 'Внесення записано');
  };

  const history = [...state.shifts].filter((s) => s.closedAt).sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt)).slice(0, 60);
  const c = open ? shiftCash(state, open) : null;

  return (
    <section>
      <PageHead title="Касові зміни" sub="Відкрили зміну з сумою в касі → протягом дня продажі → закрили, порахувавши готівку. Програма покаже нестачу чи надлишок." />
      {!open ? (
        <div className="card pad narrow">
          <h3>Відкрити зміну</h3>
          <Field label={`Готівка в касі на початок, ${cur}`}><Num value={opening} onChange={setOpening} /></Field>
          <button className="btn primary" onClick={openShift}>Відкрити зміну</button>
        </div>
      ) : (
        <>
          <div className="stats">
            <Stat label="Зміна відкрита" value={new Date(open.openedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })} sub={`${empName(open.employeeId)} · ${new Date(open.openedAt).toLocaleDateString('uk-UA')}`} />
            <Stat label="Продажі за зміну" value={money(c.sales, cur)} sub={`${c.checks} чеків · безготівково ${money(c.cardSales, cur)}`} />
            <Stat label="Готівки має бути" value={money(c.expected, cur)} sub={`початок ${money(open.openingCash, cur)} + надх. ${money(c.income, cur)} − видачі ${money(Math.abs(c.out), cur)}`} />
          </div>
          <div className="grid2 top">
            <div className="card pad">
              <h3>Закрити зміну</h3>
              <Field label={`Пораховано готівки в касі, ${cur}`}><Num value={counted} onChange={setCounted} /></Field>
              {Number(counted) > 0 && (
                <p>Різниця: <b className={Number(counted) - c.expected < 0 ? 'neg' : 'pos'}>{money(Number(counted) - c.expected, cur)}</b></p>
              )}
              <Field label="Коментар"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <button className="btn primary" disabled={busy} onClick={closeShift}>Закрити зміну</button>
            </div>
            <div className="card pad">
              <h3>Внесення / вилучення готівки</h3>
              <div className="chips">
                <button className={'chip' + (mv.type === 'withdraw' ? ' on' : '')} onClick={() => setMv({ ...mv, type: 'withdraw' })}>Вилучення / інкасація</button>
                <button className={'chip' + (mv.type === 'deposit' ? ' on' : '')} onClick={() => setMv({ ...mv, type: 'deposit' })}>Внесення (розмін)</button>
              </div>
              <div className="form-grid">
                <Field label={`Сума, ${cur}`}><Num value={mv.amount} onChange={(v) => setMv({ ...mv, amount: v })} /></Field>
                <Field label="Коментар"><input value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} /></Field>
              </div>
              <button className="btn" onClick={addMove}>Записати</button>
            </div>
          </div>
        </>
      )}

      <h3 className="group-title">Історія змін</h3>
      {history.length === 0 ? <Empty icon="🕐" title="Закритих змін ще немає" /> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Зміна</th><th>Касир</th><th className="r">Продажі</th><th className="r">Очікувано</th><th className="r">Пораховано</th><th className="r">Різниця</th></tr></thead>
            <tbody>
              {history.map((s) => {
                const sc = shiftCash(state, s);
                const diff = (Number(s.countedCash) || 0) - (s.expectedCash ?? sc.expected);
                return (
                  <tr key={s.id}>
                    <td data-label="Зміна">{fmtDateTime(s.openedAt)} — {new Date(s.closedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}{s.note && <div className="muted small">{s.note}</div>}</td>
                    <td data-label="Касир">{empName(s.employeeId)}</td>
                    <td data-label="Продажі" className="r">{money(sc.sales, cur)}</td>
                    <td data-label="Очікувано" className="r">{money(s.expectedCash ?? sc.expected, cur)}</td>
                    <td data-label="Пораховано" className="r">{money(s.countedCash, cur)}</td>
                    <td data-label="Різниця" className={'r strong ' + (diff < -0.009 ? 'neg' : diff > 0.009 ? 'pos' : '')}>{money(diff, cur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!can('finance') && <p className="muted small">Детальний рух грошей бачить власник у розділі «Гроші й рахунки».</p>}
      <Toast text={toast} />
    </section>
  );
}
