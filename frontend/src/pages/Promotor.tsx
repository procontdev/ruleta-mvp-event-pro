import { useState } from 'react';
import { adminApi } from '../lib/api';

type Styles = { [k: string]: React.CSSProperties };

export default function Promotor() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');

  const parseJugadaId = (txt: string): number | null => {
    const t = (txt || '').trim().toUpperCase();
    const m = t.match(/^J-(\d+)$/) || t.match(/^(\d+)$/);
    return m ? Number(m[1]) : null;
  };

  const doVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo(null);
    const id = parseJugadaId(code);
    if (!id) { setError('Código inválido. Formato: J-123'); return; }
    try {
      setLoading(true);
      const res = await adminApi.verify(id);
      setInfo(res);
    } catch (err: any) {
      setError(err?.body?.error || err?.message || 'No se pudo verificar.');
    } finally {
      setLoading(false);
    }
  };

  const doFulfill = async (entregado: boolean) => {
    if (!info) return;
    try {
      setLoading(true);
      const res = await adminApi.fulfill(info.id, entregado);
      setInfo({ ...info, entregado: res.entregado, entregadoEn: res.entregadoEn || null });
    } catch (err: any) {
      setError(err?.body?.error || err?.message || 'No se pudo actualizar entrega.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.container}>
      <h1 style={s.h1}>Promotor — Verificación y Canje</h1>

      <form onSubmit={doVerify} style={s.card}>
        <label style={s.label}>Código de canje</label>
        <input
          style={s.input}
          placeholder="J-123"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <div style={s.error}>{error}</div>}
        <button style={s.button} type="submit" disabled={loading}>
          {loading ? 'Buscando…' : 'Verificar'}
        </button>
      </form>

      {info && (
        <div style={s.card}>
          <h2 style={s.h2}>Detalle</h2>
          <div style={s.row}><b>JugadaId:</b> {info.id}</div>
          <div style={s.row}><b>EventoId:</b> {info.eventoId}</div>
          <div style={s.row}><b>UsuarioId:</b> {info.usuarioId}</div>
          <div style={s.row}><b>Resultado:</b> {info.resultado}</div>
          <div style={s.row}><b>Premio:</b> {info.premio ?? '—'}</div>
          <div style={s.row}><b>Entregado:</b> {info.entregado ? 'Sí' : 'No'}</div>
          <div style={s.row}><b>EntregadoEn:</b> {info.entregadoEn ?? '—'}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={s.button} onClick={() => doFulfill(true)} disabled={loading || info.entregado === true}>
              Marcar ENTREGADO
            </button>
            <button style={s.secondary} onClick={() => doFulfill(false)} disabled={loading || info.entregado === false}>
              Marcar NO entregado
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Styles = {
  container: { minHeight: '100svh', background: '#0f172a', color: '#e2e8f0', padding: 16 },
  h1: { margin: '0 0 12px 0' },
  h2: { margin: '0 0 8px 0' },
  card: { maxWidth: 640, margin: '0 auto 12px', background: '#111827', borderRadius: 12, padding: 16, boxShadow: '0 6px 18px rgba(0,0,0,0.35)' },
  label: { fontSize: 13, marginBottom: 6, display: 'block' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#0b1220', color: '#e2e8f0' },
  button: { marginTop: 12, padding: '10px 16px', borderRadius: 10, border: 'none', background: '#06b6d4', color: '#0b1220', fontWeight: 700, cursor: 'pointer' },
  secondary: { marginTop: 12, padding: '10px 16px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' },
  error: { marginTop: 10, color: '#fecaca', background: '#7f1d1d', padding: 8, borderRadius: 8 },
  row: { margin: '4px 0' },
};
