import { useMemo, useState } from 'react';
import { PERIODS, abc, breakdowns, buildReport, money, num, pct, periodRange } from '../calc.js';
import { Badge, Empty, PageHead, PeriodPicker, Seg } from '../components/ui.jsx';
import BarChart from '../components/BarChart.jsx';

const ONE = [{ key: 'revenue', label: 'Виручка', color: 'var(--series-1)' }];

function HBars({ rows, cur, total }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="hb-top"><span className="ellipsis">{r.label}</span><b>{money(r.revenue, cur)}</b></div>
          <div className="hb-track"><i style={{ width: `${Math.max(0, (r.revenue / max) * 100)}%` }} /></div>
          <div className="muted small">{pct(total ? (r.revenue / total) * 100 : 0)} · прибуток {money(r.profit, cur)}{r.checks != null ? ` · ${r.checks} чеків` : ''}</div>
        </li>
      ))}
    </ul>
  );
}

export default function Analytics({ state }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('30d');
  const [custom, setCustom] = useState({});
  const [by, setBy] = useState('profit');
  const range = periodRange(period, new Date(), custom);
  const rep = useMemo(() => buildReport(state, range), [state, period, custom]); // eslint-disable-line react-hooks/exhaustive-deps
  const br = useMemo(() => breakdowns(state, rep.salesList), [state, rep]);
  const abcRows = useMemo(() => abc(rep.products, by), [rep, by]);
  const hours = br.byHour.filter((h, i) => br.byHour.slice(i).some((x) => x.revenue) && br.byHour.slice(0, i + 1).some((x) => x.revenue));

  return (
    <section>
      <PageHead title="Аналітика" sub="ABC-аналіз меню, найкращі дні й години, канали продажів, категорії та працівники." />
      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />
      {rep.checks === 0 ? <Empty icon="📈" title="За цей період немає продажів" /> : (
        <>
          <div className="card pad">
            <div className="row between wrap gap">
              <h3>ABC-аналіз меню</h3>
              <Seg value={by} onChange={setBy} className="no-mb" options={[{ id: 'profit', label: 'за прибутком' }, { id: 'revenue', label: 'за виручкою' }, { id: 'qty', label: 'за кількістю' }]} />
            </div>
            <p className="muted small"><b>A</b> — дають 80% результату (тримайте завжди в наявності), <b>B</b> — наступні 15%, <b>C</b> — останні 5% (кандидати на заміну або промо).</p>
            <div className="table-wrap">
              <table className="table compact stack">
                <thead><tr><th>Клас</th><th>Товар</th><th className="r">Шт</th><th className="r">Виручка</th><th className="r">Прибуток</th><th className="r">Частка</th></tr></thead>
                <tbody>
                  {abcRows.map((p) => (
                    <tr key={p.name}>
                      <td data-label="Клас"><Badge tone={p.cls === 'A' ? 'green' : p.cls === 'B' ? 'amber' : 'red'}>{p.cls}</Badge></td>
                      <td data-label="Товар">{p.name}</td>
                      <td data-label="Шт" className="r">{num(p.qty)}</td>
                      <td data-label="Виручка" className="r nowrap">{money(p.revenue, cur)}</td>
                      <td data-label="Прибуток" className="r nowrap">{money(p.profit, cur)}</td>
                      <td data-label="Частка" className="r">{pct(p.share * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid2 top">
            <div className="card pad"><BarChart title="Виручка за днями тижня" data={br.byWeekday} series={ONE} currency={cur} xLabel={(d) => d.label} height={200} /></div>
            <div className="card pad"><BarChart title="Виручка за годинами" data={hours.length ? hours : br.byHour} series={ONE} currency={cur} xLabel={(d) => d.label} height={200} /></div>
          </div>

          <div className="grid3 top">
            <div className="card pad"><h3>Канали продажів</h3><HBars rows={br.byChannel} cur={cur} total={rep.revenue} /></div>
            <div className="card pad"><h3>Категорії</h3><HBars rows={br.byCategory} cur={cur} total={rep.revenue} /></div>
            <div className="card pad"><h3>Працівники</h3><HBars rows={br.byEmployee} cur={cur} total={rep.revenue} /></div>
          </div>
        </>
      )}
    </section>
  );
}
