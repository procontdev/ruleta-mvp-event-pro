import { useEffect, useState } from 'react';
import { adminApi, type AdminEvent, type AdminUsersPage } from '../lib/api';

type Styles = { [k: string]: React.CSSProperties };

export default function Users() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<number | undefined>(undefined);
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async (pid = page) => {
    const res = await adminApi.listUsers({ eventId, page: pid, pageSize, q });
    setData(res);
  };

  useEffect(() => {
    adminApi.listEvents().then(list => {
      setEvents(list);
      if (list.length) setEventId(list[0].id);
    });
  }, []);
  useEffect(() => { if (eventId != null) { setPage(1); load(1); } }, [eventId]);
  useEffect(() => { if (eventId != null) { setPage(1); load(1); } }, [q]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div style={s.container}>
      <h1 style={s.h1}>Usuarios registrados</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select style={s.input} value={eventId ?? ''} onChange={(e) => setEventId(Number(e.target.value))}>
          {events.map(e => <option key={e.id} value={e.id}>{`#${e.id} — ${e.nombre}`}</option>)}
        </select>
        <input style={s.input} placeholder="Buscar (nombre/email/teléfono)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div style={s.card}>
        <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 1fr 120px', gap:8, padding:'8px 0', borderBottom:'1px solid #1f2937' }}>
          <b>ID</b><b>Nombre</b><b>Email</b><b>Teléfono</b><b>Jugó</b>
        </div>
        {data?.items.map(u => (
          <div key={u.id} style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 1fr 120px', gap:8, padding:'8px 0', borderBottom:'1px solid #0b1220' }}>
            <span>#{u.id}</span>
            <span>{u.nombre}</span>
            <span>{u.email || '—'}</span>
            <span>{u.telefono || '—'}</span>
            <span style={{ color: u.jugo ? '#22c55e' : '#f87171', fontWeight:700 }}>{u.jugo ? 'Sí' : 'No'}</span>
          </div>
        ))}

        <div style={{ display:'flex', justifyContent:'space-between', marginTop: 10 }}>
          <button style={s.small} disabled={page <= 1} onClick={() => { const p=page-1; setPage(p); load(p); }}>Anterior</button>
          <div>Página {page} de {totalPages}</div>
          <button style={s.small} disabled={page >= totalPages} onClick={() => { const p=page+1; setPage(p); load(p); }}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}

const s: Styles = {
  container: { minHeight: '100svh', background: '#0f172a', color: '#e2e8f0', padding: 16, fontFamily: 'Inter, system-ui, Arial' },
  h1: { margin: '0 0 12px 0' },
  card: { background: '#111827', padding: 16, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.25)' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#0b1220', color: '#e2e8f0' },
  small: { padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' }
};
