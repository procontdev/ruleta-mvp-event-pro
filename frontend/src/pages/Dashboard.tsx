import { useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminEvent, type AdminDashboard } from '../lib/api';

type Styles = { [k: string]: React.CSSProperties };

// Intervalo de actualización (puedes setear VITE_DASHBOARD_REFRESH_MS en docker-compose)
const REFRESH_MS = Number((import.meta as any).env?.VITE_DASHBOARD_REFRESH_MS ?? 5000);

// Un “dashboard” vacío para consolidado cuando no hay datos aún
const EMPTY_DASH: AdminDashboard = {
  totalUsuarios: 0, jugadasTotales: 0, ganadores: 0, perdedores: 0, stockRestante: 0,
  premios: []
};

export default function Dashboard() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [mode, setMode] = useState<'ALL' | 'ONE'>('ALL'); // modo consolidado o por evento
  const [eventId, setEventId] = useState<number | undefined>(undefined);

  const [dataSingle, setDataSingle] = useState<AdminDashboard | null>(null);
  const [dataAll, setDataAll] = useState<AdminDashboard | null>(null);

  const [live, setLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  // ===== cargas =====
  const loadOne = async (id: number) => {
    setLoading(true);
    try {
      const res = await adminApi.dashboard(id);
      setDataSingle(res);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  const loadAll = async () => {
    if (!events.length) return;
    setLoading(true);
    try {
      const dashboards = await Promise.all(events.map(e => adminApi.dashboard(e.id)));
      const merged = mergeDashboards(dashboards);
      setDataAll(merged);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  // ===== init =====
  useEffect(() => {
    adminApi.listEvents().then(list => {
      setEvents(list);
      if (list.length) {
        // por defecto: consolidado
        setMode('ALL');
        setEventId(list[0].id);
        // Cargas iniciales
        loadAll();
        loadOne(list[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando cambie el evento seleccionado en modo ONE
  useEffect(() => {
    if (mode === 'ONE' && eventId != null) loadOne(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, eventId]);

  // Polling en vivo
  useEffect(() => {
    if (!live) return;
    let t: number | undefined;

    async function doTick() {
      if (mode === 'ALL') await loadAll();
      else if (mode === 'ONE' && eventId != null) await loadOne(eventId);
      t = window.setTimeout(doTick, REFRESH_MS);
    }

    doTick();
    return () => { if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, mode, eventId, events.length]);

  // ===== datos para la vista =====
  const viewData: AdminDashboard = useMemo(() => {
    if (mode === 'ALL') return dataAll ?? EMPTY_DASH;
    return dataSingle ?? EMPTY_DASH;
  }, [mode, dataAll, dataSingle]);

  // Para consolidado, agrupamos premios por nombre (excluyendo “perdedor”)
  const premiosParaBarras = useMemo(() => {
    if (!viewData) return [];
    return viewData.premios.filter(p => !p.esPerdedor);
  }, [viewData]);

  const entregaTotal = useMemo(
    () => premiosParaBarras.reduce((a, p) => a + p.entregados, 0),
    [premiosParaBarras]
  );

  return (
    <div style={s.container}>
      <h1 style={s.h1}>Dashboard</h1>

      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
        <select
          style={s.input}
          value={mode}
          onChange={(e) => setMode(e.target.value as 'ALL' | 'ONE')}
        >
          <option value="ALL">Todos (consolidado)</option>
          <option value="ONE">Por evento</option>
        </select>

        <select
          style={{ ...s.input, opacity: mode === 'ONE' ? 1 : 0.6 }}
          disabled={mode !== 'ONE'}
          value={String(eventId ?? '')}
          onChange={(e) => setEventId(Number(e.target.value))}
        >
          {events.map(e => <option key={e.id} value={e.id}>{`#${e.id} — ${e.nombre}`}</option>)}
        </select>

        <label style={s.switch}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span>&nbsp;En vivo {live ? '✅' : '⏸️'}</span>
        </label>

        <button
          style={s.small}
          onClick={() => mode === 'ALL' ? loadAll() : (eventId && loadOne(eventId))}
          disabled={loading}
        >
          {loading ? 'Actualizando…' : 'Actualizar ahora'}
        </button>

        <span style={{ opacity:.85, fontSize:13 }}>
          {lastUpdated ? `Última actualización: ${lastUpdated.toLocaleTimeString()}` : ''}
        </span>
      </div>

      {/* KPI cards */}
      <div style={s.kpis}>
        <div style={s.kpi}><div style={s.kpiLabel}>Registrados</div><div style={s.kpiValue}>{viewData.totalUsuarios}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Jugadas</div><div style={s.kpiValue}>{viewData.jugadasTotales}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Ganadores</div><div style={s.kpiValue}>{viewData.ganadores}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Perdedores</div><div style={s.kpiValue}>{viewData.perdedores}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Stock restante</div><div style={s.kpiValue}>{viewData.stockRestante}</div></div>
      </div>

      {/* Barras por premio (agregado o individual) */}
      <div style={s.card}>
        <h2 style={{ marginTop:0 }}>
          {mode === 'ALL' ? 'Distribución por premio (consolidado)' : 'Distribución por premio'}
        </h2>
        {premiosParaBarras.map(p => {
          const total = (p.entregados + p.stockActual) || 1;
          const pctEnt = Math.round((p.entregados / total) * 100);
          return (
            <div key={`${p.nombre}`} style={{ marginBottom: 12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                <div><b>{p.nombre}</b>{mode === 'ONE' ? <span style={{opacity:.7}}>&nbsp;(peso {p.peso})</span> : null}</div>
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

/**
 * Une múltiples AdminDashboard en uno solo.
 * - Suma KPIs.
 * - Agrupa premios por NOMBRE (excluye “perdedor” en la vista), sumando entregados y stockActual.
 *   Nota: el “peso” no es comparable entre eventos; en consolidado lo calculamos como promedio ponderado por (entregados+stock).
 */
function mergeDashboards(list: AdminDashboard[]): AdminDashboard {
  const acc: AdminDashboard = {
    totalUsuarios: 0, jugadasTotales: 0, ganadores: 0, perdedores: 0, stockRestante: 0,
    premios: []
  };

  // Sumas de KPIs
  for (const d of list) {
    acc.totalUsuarios += d.totalUsuarios;
    acc.jugadasTotales += d.jugadasTotales;
    acc.ganadores += d.ganadores;
    acc.perdedores += d.perdedores;
    acc.stockRestante += d.stockRestante;
  }

  // Agrupar premios por nombre (incluimos perdedores para mantener consistencia, aunque no se grafican)
  type Agg = { nombre: string; esPerdedor: boolean; entregados: number; stockActual: number; pesoAcum: number; pesoBase: number };
  const byName = new Map<string, Agg>();

  for (const d of list) {
    for (const p of d.premios) {
      const k = p.nombre.trim().toLowerCase();
      const base = byName.get(k) ?? {
        nombre: p.nombre,
        esPerdedor: p.esPerdedor,
        entregados: 0,
        stockActual: 0,
        pesoAcum: 0,
        pesoBase: 0
      };
      base.entregados += p.entregados;
      base.stockActual += p.stockActual;

      // para un “peso” consolidado aproximado, usamos promedio ponderado por total disponible (entregados+stock)
      const total = p.entregados + p.stockActual;
      if (total > 0) {
        base.pesoAcum += p.peso * total;
        base.pesoBase += total;
      }
      byName.set(k, base);
    }
  }

  acc.premios = Array.from(byName.values()).map(v => ({
    premioId: 0, // no aplica en consolidado
    nombre: v.nombre,
    esPerdedor: v.esPerdedor,
    peso: v.pesoBase > 0 ? Math.round(v.pesoAcum / v.pesoBase) : 0,
    stockActual: v.stockActual,
    entregados: v.entregados
  }));

  // Orden: premios primero, perdedores al final
  acc.premios.sort((a, b) => Number(a.esPerdedor) - Number(b.esPerdedor) || a.nombre.localeCompare(b.nombre));
  return acc;
}

const s: Styles = {
  container: { minHeight: '100svh', background: '#0f172a', color: '#e2e8f0', padding: 16, fontFamily: 'Inter, system-ui, Arial' },
  h1: { margin: '0 0 12px 0' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#0b1220', color: '#e2e8f0' },
  kpis: { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:12 },
  kpi: { background:'#111827', borderRadius:12, padding:16, boxShadow:'0 8px 24px rgba(0,0,0,.25)' },
  kpiLabel: { fontSize:14, opacity:.85 },
  kpiValue: { fontSize:28, fontWeight:800 },
  card: { background:'#111827', padding:16, borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,.25)' },
  small: { padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' },
  switch: { display:'flex', alignItems:'center', gap:4, fontSize:14 }
};
