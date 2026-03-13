import { useEffect, useMemo, useState } from "react";
import { adminApi, type AdminEvent, type AdminDashboard } from "../lib/api";
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
} from "recharts";

type Styles = { [k: string]: React.CSSProperties };

// Intervalo de actualización (puedes setear VITE_DASHBOARD_REFRESH_MS)
const REFRESH_MS = Number((import.meta as any).env?.VITE_DASHBOARD_REFRESH_MS ?? 5000);

type Row = {
  id: number;
  nombre: string;
  registrados: number;
  jugadas: number;
  ganadores: number;
  perdedores: number;
  entregados: number;     // suma premiados (no perdedor)
  stockRestante: number;
  canjePct: number;       // ganadores / jugadas
};

type SortKey = keyof Pick<Row, "registrados" | "jugadas" | "ganadores" | "perdedores" | "entregados" | "stockRestante" | "canjePct">;
type SortDir = "asc" | "desc";

// Paleta (10 eventos). Incluye el azul Pacífico (#0099CC)
const COLORS = ["#0099CC", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#A855F7", "#22D3EE", "#84CC16", "#F97316", "#64748B"];

export default function Compare() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [dashById, setDashById] = useState<Record<number, AdminDashboard>>({});
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("jugadas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Carga inicial de eventos
  useEffect(() => {
    adminApi.listEvents().then((list) => {
      setEvents(list);
      if (list.length) loadAll(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling
  useEffect(() => {
    if (!live || events.length === 0) return;
    let t: number | undefined;
    const tick = async () => {
      await loadAll(events);
      t = window.setTimeout(tick, REFRESH_MS);
    };
    tick();
    return () => { if (t) clearTimeout(t); };
  }, [live, events]);

  async function loadAll(list: AdminEvent[]) {
    setLoading(true);
    try {
      const dashboards = await Promise.all(list.map(e => adminApi.dashboard(e.id)));
      const map: Record<number, AdminDashboard> = {};
      dashboards.forEach((d, i) => { map[list[i].id] = d; });
      setDashById(map);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }

  const rows: Row[] = useMemo(() => {
    return events.map(e => {
      const d = dashById[e.id];
      const registrados = d?.totalUsuarios ?? 0;
      const jugadas = d?.jugadasTotales ?? 0;
      const ganadores = d?.ganadores ?? 0;
      const perdedores = d?.perdedores ?? 0;
      const stockRestante = d?.stockRestante ?? 0;
      const entregados = (d?.premios ?? [])
        .filter(p => !p.esPerdedor)
        .reduce((a, p) => a + p.entregados, 0);
      const canjePct = jugadas > 0 ? (ganadores / jugadas) : 0;

      return {
        id: e.id,
        nombre: e.nombre,
        registrados,
        jugadas,
        ganadores,
        perdedores,
        entregados,
        stockRestante,
        canjePct
      };
    });
  }, [events, dashById]);

  const totals: Row = useMemo(() => {
    const sum = (k: keyof Row) => rows.reduce((a, r) => a + (r[k] as number), 0);
    const jugadas = sum("jugadas");
    const ganadores = sum("ganadores");
    return {
      id: 0,
      nombre: "TOTAL",
      registrados: sum("registrados"),
      jugadas,
      ganadores,
      perdedores: sum("perdedores"),
      entregados: sum("entregados"),
      stockRestante: sum("stockRestante"),
      canjePct: jugadas > 0 ? (ganadores / jugadas) : 0
    };
  }, [rows]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const numA = typeof va === "number" ? va : 0;
      const numB = typeof vb === "number" ? vb : 0;
      const s = numA - numB;
      return sortDir === "asc" ? s : -s;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function fmtPct(x: number) {
    return `${(x * 100).toFixed(1)}%`;
  }

  function exportCSV() {
    const header = ["EventoId","Evento","Registrados","Jugadas","Ganadores","Perdedores","Entregados","StockRestante","TasaGanador(Jugadas)"];
    const lines = [header.join(",")];
    sorted.forEach(r => {
      lines.push([
        r.id,
        `"${r.nombre.replace(/"/g,'""')}"`,
        r.registrados,
        r.jugadas,
        r.ganadores,
        r.perdedores,
        r.entregados,
        r.stockRestante,
        (r.canjePct*100).toFixed(2)+"%"
      ].join(","));
    });
    // totales
    lines.push([
      "TOTAL",
      `"TOTAL"`,
      totals.registrados,
      totals.jugadas,
      totals.ganadores,
      totals.perdedores,
      totals.entregados,
      totals.stockRestante,
      (totals.canjePct*100).toFixed(2)+"%"
    ].join(","));

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comparativa_eventos_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Datos para los PIEs ----------
  const pieRegistrados = useMemo(
    () => rows.map((r, i) => ({ name: `#${r.id} ${shortName(r.nombre)}`, value: r.registrados, color: COLORS[i % COLORS.length] })),
    [rows]
  );
  const pieJugadas = useMemo(
    () => rows.map((r, i) => ({ name: `#${r.id} ${shortName(r.nombre)}`, value: r.jugadas, color: COLORS[i % COLORS.length] })),
    [rows]
  );
  const pieGanadores = useMemo(
    () => rows.map((r, i) => ({ name: `#${r.id} ${shortName(r.nombre)}`, value: r.ganadores, color: COLORS[i % COLORS.length] })),
    [rows]
  );

  // Para listado de “tasa de participación” (jugadas / registrados)
  const participation = useMemo(() =>
    [...rows]
      .map(r => ({ id: r.id, nombre: r.nombre, rate: r.registrados > 0 ? r.jugadas / r.registrados : 0 }))
      .sort((a,b) => b.rate - a.rate), [rows]);

  // máximos para barras embebidas
  const maxJugadas = Math.max(1, ...rows.map(r => r.jugadas));
  const maxGanadores = Math.max(1, ...rows.map(r => r.ganadores));

  return (
    <div style={s.container}>
      <h1 style={s.h1}>Comparativa de eventos</h1>

      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
        <label style={s.switch}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span>&nbsp;En vivo {live ? '✅' : '⏸️'}</span>
        </label>
        <button style={s.small} onClick={() => loadAll(events)} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
        <button style={s.small} onClick={exportCSV}>Exportar CSV</button>
        <span style={{ opacity:.85, fontSize:13 }}>
          {lastUpdated ? `Última actualización: ${lastUpdated.toLocaleTimeString()}` : ''}
        </span>
      </div>

      {/* ======= Tabla comparativa ======= */}
      <div style={s.card}>
        <div style={s.tableHeader}>
          <div style={{...s.th, textAlign:'left'}}>Evento</div>
          <div style={s.th} onClick={() => toggleSort("registrados")}>Registrados {chev(sortKey,"registrados",sortDir)}</div>
          <div style={s.th} onClick={() => toggleSort("jugadas")}>Jugadas {chev(sortKey,"jugadas",sortDir)}</div>
          <div style={s.th} onClick={() => toggleSort("ganadores")}>Ganadores {chev(sortKey,"ganadores",sortDir)}</div>
          <div style={s.th} onClick={() => toggleSort("perdedores")}>Perdedores {chev(sortKey,"perdedores",sortDir)}</div>
          <div style={s.th} onClick={() => toggleSort("entregados")}>Entregados {chev(sortKey,"entregados",sortDir)}</div>
          <div style={s.th} onClick={() => toggleSort("stockRestante")}>Stock restante {chev(sortKey,"stockRestante",sortDir)}</div>
          <div style={s.th} onClick={() => toggleSort("canjePct")}>Tasa ganador {chev(sortKey,"canjePct",sortDir)}</div>
        </div>

        {sorted.map((r) => (
          <div key={r.id} style={s.tr}>
            <div style={{...s.td, textAlign:'left'}}>
              <b>#{r.id}</b> — {r.nombre}
            </div>
            <div style={s.td}>{r.registrados}</div>
            <div style={s.td}>
              <Bar value={r.jugadas} max={maxJugadas} label={String(r.jugadas)} />
            </div>
            <div style={s.td}>
              <Bar value={r.ganadores} max={maxGanadores} label={String(r.ganadores)} tone="cyan" />
            </div>
            <div style={s.td}>{r.perdedores}</div>
            <div style={s.td}>{r.entregados}</div>
            <div style={s.td}>{r.stockRestante}</div>
            <div style={{...s.td, fontWeight:700, color: r.canjePct>=0.3 ? '#22c55e' : r.canjePct>=0.15 ? '#fbbf24' : '#f87171' }}>
              {fmtPct(r.canjePct)}
            </div>
          </div>
        ))}

        {/* Totales */}
        <div style={{...s.tr, background:'#0b1220', borderTop:'1px solid #1f2937', marginTop:8}}>
          <div style={{...s.td, textAlign:'left'}}><b>TOTAL</b></div>
          <div style={s.td}><b>{totals.registrados}</b></div>
          <div style={s.td}><b>{totals.jugadas}</b></div>
          <div style={s.td}><b>{totals.ganadores}</b></div>
          <div style={s.td}><b>{totals.perdedores}</b></div>
          <div style={s.td}><b>{totals.entregados}</b></div>
          <div style={s.td}><b>{totals.stockRestante}</b></div>
          <div style={s.td}><b>{fmtPct(totals.canjePct)}</b></div>
        </div>
      </div>

      {/* ======= Pies ======= */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginTop:12 }}>
        <PieCard title="Registrados por evento" data={pieRegistrados} />
        <PieCard title="Jugadas por evento" data={pieJugadas} />
        <PieCard title="Ganadores por evento" data={pieGanadores} />
      </div>

      {/* ======= Métrica adicional: Tasa de participación ======= */}
      <div style={{ ...s.card, marginTop:12 }}>
        <h3 style={{ marginTop:0 }}>Tasa de participación (Jugadas / Registrados)</h3>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8 }}>
          {participation.map(p => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:14, height:14, borderRadius:4, background: colorForEvent(p.id) }} />
              <div style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                <b>#{p.id}</b> — {p.nombre}
              </div>
              <div style={{ fontWeight:700 }}>{(p.rate*100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function chev(active: string, me: string, dir: "asc"|"desc") {
  if (active !== me) return "↕";
  return dir === "asc" ? "↑" : "↓";
}

function Bar({ value, max, label, tone = "blue" }: { value: number; max: number; label: string; tone?: "blue" | "cyan" }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const color = tone === "cyan" ? "#06b6d4" : "#3b82f6";
  return (
    <div style={{ background:'#1f2937', borderRadius:6, overflow:'hidden', height:12, position:'relative' }}>
      <div style={{ width:`${pct}%`, height:'100%', background: color }} />
      <span style={{ position:'absolute', top:-2, right:6, fontSize:12, opacity:.9 }}>{label}</span>
    </div>
  );
}

function shortName(name: string) {
  // Acorta nombres largos para leyenda
  return name.length > 22 ? name.slice(0, 21) + "…" : name;
}

function colorForEvent(eventId: number) {
  const idx = (eventId - 1) % COLORS.length;
  return COLORS[idx];
}

function PieCard({ title, data }: { title: string; data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((a,b)=> a + b.value, 0);
  return (
    <div style={s.card}>
      <h3 style={{ marginTop:0 }}>{title}</h3>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={1}
              isAnimationActive={true}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any, name: any) => {
              const val = Number(v) || 0;
              const pct = total > 0 ? ((val/total)*100).toFixed(1) + "%" : "0%";
              return [`${val} (${pct})`, name as string];
            }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ textAlign:'right', opacity:.8, fontSize:13 }}>Total: {total}</div>
    </div>
  );
}

const s: Styles = {
  container: { minHeight:'100svh', background:'#0f172a', color:'#e2e8f0', padding:16, fontFamily:'Inter, system-ui, Arial' },
  h1: { margin:'0 0 12px 0' },
  card: { background:'#111827', padding:16, borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,.25)' },

  tableHeader: { display:'grid', gridTemplateColumns:'2fr repeat(7, 1fr)', gap:8, padding:'8px 0', borderBottom:'1px solid #1f2937', fontWeight:700, userSelect:'none' },
  tr: { display:'grid', gridTemplateColumns:'2fr repeat(7, 1fr)', gap:8, padding:'8px 0', borderBottom:'1px solid #0b1220' },
  th: { textAlign:'center', cursor:'pointer' },
  td: { textAlign:'center' },

  small: { padding:'8px 12px', borderRadius:8, border:'1px solid #334155', background:'transparent', color:'#e2e8f0', cursor:'pointer' },
  switch: { display:'flex', alignItems:'center', gap:4, fontSize:14 }
};
