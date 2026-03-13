import { useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminEvent, type AdminDashboard } from '../lib/api';

type Styles = { [k: string]: React.CSSProperties };

export default function Dashboard() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<number | undefined>(undefined);
  const [data, setData] = useState<AdminDashboard | null>(null);

  const load = async (id: number) => {
    const res = await adminApi.dashboard(id);
    setData(res);
  };

  useEffect(() => {
    adminApi.listEvents().then(list => {
      setEvents(list);
      if (list.length) {
        setEventId(list[0].id);
        load(list[0].id);
      }
    });
  }, []);
  useEffect(() => { if (eventId != null) load(eventId); }, [eventId]);

  const entregaTotal = useMemo(() => data?.premios.reduce((a, p) => a + p.entregados, 0) ?? 0, [data]);

  return (
    <div style={s.container}>
      <h1 style={s.h1}>Dashboard</h1>

      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <select style={s.input} value={eventId ?? ''} onChange={(e) => setEventId(Number(e.target.value))}>
          {events.map(e => <option key={e.id} value={e.id}>{`#${e.id} — ${e.nombre}`}</option>)}
        </select>
      </div>

      {/* KPI cards */}
      <div style={s.kpis}>
        <div style={s.kpi}><div style={s.kpiLabel}>Registrados</div><div style={s.kpiValue}>{data?.totalUsuarios ?? '—'}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Jugadas</div><div style={s.kpiValue}>{data?.jugadasTotales ?? '—'}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Ganadores</div><div style={s.kpiValue}>{data?.ganadores ?? '—'}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Perdedores</div><div style={s.kpiValue}>{data?.perdedores ?? '—'}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Stock restante</div><div style={s.kpiValue}>{data?.stockRestante ?? '—'}</div></div>
      </div>

      {/* Barras por premio */}
      <div style={s.card}>
        <h2 style={{ marginTop:0 }}>Distribución por premio</h2>
        {data?.premios.filter(p => !p.esPerdedor).map(p => {
          const total = (p.entregados + p.stockActual) || 1;
          const pctEnt = Math.round((p.entregados / total) * 100);
          return (
            <div key={p.premioId} style={{ marginBottom: 12 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <div><b>{p.nombre}</b> <span style={{opacity:.7}}>(peso {p.peso})</span></div>
                <div style={{opacity:.9}}>Entregados {p.entregados} / Stock {p.stockActual}</div>
              </div>
              <div style={{ background:'#1f2937', borderRadius:8, overflow:'hidden', height:12, marginTop:6 }}>
                <div style={{ width:`${pctEnt}%`, height:'100%', background:'#06b6d4' }} />
              </div>
            </div>
          );
        })}
        <div style={{opacity:.8, marginTop:8}}>Total entregados: {entregaTotal}</div>
      </div>
    </div>
  );
}

const s: Styles = {
  container: { minHeight: '100svh', background: '#0f172a', color: '#e2e8f0', padding: 16, fontFamily: 'Inter, system-ui, Arial' },
  h1: { margin: '0 0 12px 0' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#0b1220', color: '#e2e8f0' },
  kpis: { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:12 },
  kpi: { background:'#111827', borderRadius:12, padding:16, boxShadow:'0 8px 24px rgba(0,0,0,.25)' },
  kpiLabel: { fontSize:14, opacity:.85 },
  kpiValue: { fontSize:28, fontWeight:800 },
  card: { background:'#111827', padding:16, borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,.25)' }
};
