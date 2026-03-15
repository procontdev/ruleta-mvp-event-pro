import { useEffect, useMemo, useState } from 'react';
import { api, API_BASE, type SpinResponse, type PrizePublic } from './lib/api';
import { resolveEventId } from './lib/eventId';
import { loadBrand, wheelColorsOf, type Brand } from './lib/theme';


type Styles = { [k: string]: React.CSSProperties };

type Segment = {
  id: number;
  label: string;
  fromDeg: number;
  toDeg: number;
  centerDeg: number;
  esPerdedor: boolean;
  color: string;
};

export default function App() {
  const [eventId] = useState<number>(() => resolveEventId());
  const [brand, setBrand] = useState<Brand | null>(null);

  const [step, setStep] = useState<'register' | 'play'>('register');
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<SpinResponse | null>(null);
  const [error, setError] = useState('');
  // const EVENT_ID = resolveEventId();
  const [usuarioId, setUsuarioId] = useState<number | null>(() => {
    const saved = localStorage.getItem('ruleta_usuarioId');
    return saved ? Number(saved) : null;
  });

  const [form, setForm] = useState({
    nombre: 'Ramiro Lopez',
    email: 'ramiro@example.com',
    telefono: '999999999',
    aceptoTerminos: true,
  });

  const [prizes, setPrizes] = useState<PrizePublic[]>([]);
  const [prizeStatus, setPrizeStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [rotation, setRotation] = useState(0);
  
  // Giro más largo y ease-out más suave
const SPIN_TURNS_MIN = 7;          // vueltas mínimas (7 = ~2–3s más de lo que tenías)
const SPIN_TURNS_MAX = 12;         // vueltas máximas (sube si quieres aún más show)
const SPIN_MS_MIN = 5200;          // duración mínima en ms
const SPIN_MS_MAX = 8200;          // duración máxima en ms
const SPIN_EASING = 'cubic-bezier(0.12, 0.9, 0.08, 1)'; // ease-out largo y progresivo

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const [spinMs, setSpinMs] = useState<number>(2200);


  // Cargar tema por evento
  useEffect(() => {
    loadBrand(eventId).then(setBrand).catch(() => setBrand(null));
  }, [eventId]);

  // Cargar premios por evento
  useEffect(() => {
    setPrizes([]);
    setPrizeStatus('loading');
    api.prizes(eventId)
      .then((data) => {
        setPrizes(data);
        setPrizeStatus(data.length > 0 ? 'ok' : 'empty');
      })
      .catch(() => {
        setPrizeStatus('error');
        setError('No se pudieron cargar los premios.');
      });
  }, [eventId]);

  useEffect(() => {
    if (usuarioId) setStep('play');
  }, [usuarioId]);

  const wheelPalette = useMemo(() => wheelColorsOf(brand || {}), [brand]);

  // Segmentar ruleta
  const segments = useMemo<Segment[]>(() => {
    if (!prizes || prizes.length === 0) return [];
    const totalPeso = prizes.reduce((a, p) => a + (p.peso > 0 ? p.peso : 0), 0) || prizes.length;
    let acc = 0;
    return prizes.map((p, idx) => {
      const peso = p.peso > 0 ? p.peso : 1;
      const span = (peso / totalPeso) * 360;
      const fromDeg = acc;
      const toDeg = acc + span;
      acc += span;
      const centerDeg = fromDeg + span / 2;
      const color = wheelPalette[idx % wheelPalette.length];
      return { id: p.id, label: p.nombre, fromDeg, toDeg, centerDeg, esPerdedor: p.esPerdedor, color };
    });
  }, [prizes, wheelPalette]);

  // Fondo ruleta
  const gradient = useMemo(() => {
    if (segments.length === 0) return '';
    const stops: string[] = [];
    for (const s of segments) stops.push(`${s.color} ${s.fromDeg}deg ${s.toDeg}deg`);
    return `conic-gradient(${stops.join(',')})`;
  }, [segments]);

  const onChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const doRegister: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.aceptoTerminos) {
      setError('Debes aceptar los términos para continuar.');
      return;
    }
    try {
      setLoading(true);
      const res = await api.register({
        eventId,
        nombre: form.nombre,
        email: form.email,
        telefono: form.telefono,
        aceptoTerminos: form.aceptoTerminos,
      });
      setUsuarioId(res.usuarioId);
      localStorage.setItem('ruleta_usuarioId', String(res.usuarioId));
      setStep('play');
    } catch (err: any) {
      setError(err?.body?.error ?? err?.message ?? 'Error en registro');
    } finally {
      setLoading(false);
    }
  };

  const findCenterDegByPrizeName = (name: string): number | null => {
    const s = segments.find((x) => x.label === name);
    return s ? s.centerDeg : null;
  };

  const doSpin = async () => {
  if (!usuarioId || segments.length === 0) return;
  setError('');
  setSpinResult(null);
  setSpinning(true);

  try {
    // 1) pide resultado real al backend
    const res = await api.spin({ eventId, usuarioId });

    // 2) calcula el centro del segmento objetivo
    let targetCenter = 0;
    if (res.resultado === 'WIN') {
      const c = findCenterDegByPrizeName(res.premio);
      targetCenter = c ?? 0;
    } else {
      const sLose = segments.find((s) => s.esPerdedor) ?? segments[0];
      targetCenter = sLose.centerDeg;
    }

    // 3) vueltas y duración aleatorias (más show)
    const turns = randInt(SPIN_TURNS_MIN, SPIN_TURNS_MAX) * 360;
    const duration = randInt(SPIN_MS_MIN, SPIN_MS_MAX);
    setSpinMs(duration);

    // 4) compensa para que el centro quede bajo el puntero (0deg)
    const current = rotation % 360;
    const deltaToPointer = (360 - (targetCenter % 360) + current) % 360;
    const newRotation = rotation + turns + deltaToPointer;

    setRotation(newRotation);

    // 5) espera el final de la animación para mostrar el resultado
    await new Promise((r) => setTimeout(r, duration + 150));
    setSpinResult(res);
  } catch (err: any) {
    setError(err?.body?.error ?? err?.message ?? 'Error en giro');
  } finally {
    setSpinning(false);
  }
};


  const reset = () => {
    localStorage.removeItem('ruleta_usuarioId');
    setUsuarioId(null);
    setSpinResult(null);
    setStep('register');
    setError('');
    setRotation(0);
  };
  
  // Tamaño/posiciones para etiquetas
const WHEEL_SIZE = 240;             // coincide con styles.wheelWrapper
const RADIUS = WHEEL_SIZE / 2;
const LABEL_R = RADIUS * 0.62;      // radio donde se ubican los textos

function labelPosStyle(centerDeg: number): React.CSSProperties {
  // Convertimos a radianes corrigiendo 90° porque 0° CSS apunta a la derecha
  const rad = (centerDeg - 90) * (Math.PI / 180);
  const x = RADIUS + LABEL_R * Math.cos(rad);
  const y = RADIUS + LABEL_R * Math.sin(rad);
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: 1
  };
}


  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <h1 style={styles.h1}>Registra tus Datos</h1>
        </div>
        <small>API: {API_BASE} &nbsp;|&nbsp; Evento: {eventId}</small>
      </header>

      {step === 'register' && (
        <form onSubmit={doRegister} style={styles.card}>
          {/* Contenido por encima (z-index 1) */}
          <div style={styles.cardContent}>
            <h2 style={styles.h2}>REGISTRO</h2>

            <label style={styles.label}>Nombre</label>
            <input style={styles.input} name="nombre" value={form.nombre} onChange={onChange} required />

            <label style={styles.label}>Email</label>
            <input style={styles.input} name="email" type="email" value={form.email} onChange={onChange} />

            <label style={styles.label}>Teléfono</label>
            <input style={styles.input} name="telefono" value={form.telefono} onChange={onChange} />

            <label style={{ ...styles.label, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" name="aceptoTerminos" checked={form.aceptoTerminos} onChange={onChange} />
              Acepto los términos y condiciones
            </label>

            {error && <div style={styles.error}>{error}</div>}

            <button style={styles.button} type="submit" disabled={loading}>
              {loading ? 'Registrando...' : 'Continuar'}
            </button>
          </div>

          {/* Decorativos por debajo */}
          <div style={styles.wave} aria-hidden="true" />
		  <img src={brand?.logo || '/brand/logo.svg'} alt="pacifico" style={styles.logofooter} />
          <img src="/brand/torito_clean.svg" alt="" aria-hidden="true" style={styles.torito} />
        </form>
      )}

      {step === 'play' && (
        <div style={styles.card}>
          <div style={styles.cardContent}>
            <h2 style={styles.h2}>¡Hora de girar!</h2>

      <div style={styles.wheelWrapper}>
  <div
    style={{
      ...styles.wheel,
       backgroundImage: gradient || undefined,
    transform: `rotate(${rotation}deg)`,
    transition: spinning ? `transform ${spinMs}ms ${SPIN_EASING}` : 'transform 0s',
    position: 'relative'
    }}
  >
    {segments.map((s) => (
      <div key={s.id} style={labelPosStyle(s.centerDeg)}>
        <span
          style={{
            ...styles.segmentPill,
            // opcional: si quieres diferenciar perdedores
            opacity: s.esPerdedor ? 0.9 : 1
          }}
          title={s.label}
        >
          {s.label}
        </span>
      </div>
    ))}
  </div>
  <div style={{ ...styles.pointer, zIndex: 2 }}>▼</div>
</div>

            <div style={{ minHeight: 60, marginTop: 8 }}>
              {prizeStatus === 'loading' && <span>Cargando premios…</span>}
              {prizeStatus === 'empty' && <span>No hay premios configurados para este evento.</span>}

              {!spinning && spinResult && (
                <div style={{ marginTop: 6 }}>
                  <strong>
                    {spinResult.resultado === 'WIN'
                      ? `🎉 Ganaste: ${(spinResult as any).premio}`
                      : '😅 Sigue intentando'}
                  </strong>
                  {spinResult.resultado === 'WIN' && (
                    <div style={{ marginTop: 6, fontSize: 14, opacity: 0.9 }}>
                      Código de canje: <code>J-{(spinResult as any).jugadaId}</code>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={styles.button} onClick={doSpin} disabled={spinning || segments.length === 0}>
                {spinning ? 'Girando...' : 'Girar'}
              </button>
              <button style={styles.secondary} onClick={reset} disabled={spinning}>
                Reiniciar registro
              </button>
            </div>
          </div>

          {/* Decorativos (si lo quieres también aquí) */}
          <div style={styles.wave} aria-hidden="true" />
		  <img src={brand?.logo || '/brand/logo.svg'} alt="pacifico" style={styles.logofooter} />
          <img src="/brand/torito_clean.svg" alt="" aria-hidden="true" style={styles.torito} />
        </div>
      )}
    </div>
  );
}

const styles: Styles = {
  container: {
    minHeight: '100svh',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'var(--font-family, Inter), system-ui, Arial',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 16
  },
  header: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '8px 0'
  },
  h1: { margin: 0, fontSize: 24 },
  h2: { margin: '0 0 12px 0', fontSize: 22, letterSpacing: 0.4 },

  // 1) Card: más espacio abajo
card: {
  width: '100%',
  maxWidth: 560,
  background: 'var(--card)',
  borderRadius: 16,
  padding: 16,
  paddingBottom: 140,                // ⬅️ antes 90
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  position: 'relative',
  overflow: 'hidden'
},

// 2) Curva blanca: recortada y pegada a la esquina
wave: {
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: '140%',                     // más ancha para una curva suave
  height: 180,
  background: '#FFFFFF',
  clipPath: 'ellipse(65% 48% at 0% 100%)', // ⬅️ forma elíptica anclada esquina izq/abajo
  zIndex: 0,
  boxShadow: '0 -2px 8px rgba(0,0,0,0.06)'
},

// 3) Botón: leve sombra para que no “desaparezca” si toca el blanco
button: {
  marginTop: 14,
  padding: '12px 16px',
  boxSizing: 'border-box',
  borderRadius: 12,
  border: 'none',
  background: 'var(--primary)',
  color: 'var(--button-text)',
  fontWeight: 800 as any,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0,0,0,0.18)'  // ⬅️ nuevo
},

// (opcional) baja un pelín el torito para que “apoye” sobre la curva
torito: {
  position: 'absolute',
  right: 8,
  bottom: 10,                         // ⬅️ antes 6
  width: 300,                         // ⬅️ antes 120, un poco más pequeño
  pointerEvents: 'none',
  zIndex: 1,
  filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.30))'
},

logofooter: {
  position: 'absolute',
  left: 8,
  bottom: 10,                         // ⬅️ antes 6
  width: 115,                         // ⬅️ antes 120, un poco más pequeño
  pointerEvents: 'none',
  zIndex: 1,
  filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.30))'
},

  label: { fontSize: 13, marginTop: 8, marginBottom: 6, display: 'block', color: 'var(--text)' },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: 12,
    border: '2px solid rgba(255,255,255,0.7)',
    background: 'var(--input-bg)',
    color: 'var(--input-text)',
    outline: 'none',
    display: 'block'
  },

  
  secondary: {
    marginTop: 14,
    padding: '12px 16px',
    boxSizing: 'border-box',
    borderRadius: 12,
    border: '2px solid rgba(255,255,255,0.7)',
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer'
  },
  
  segmentPill: {
  display: 'inline-block',
  maxWidth: 96,
  padding: '2px 6px',
  borderRadius: 10,
  lineHeight: 1.1,
  fontSize: 12,
  fontWeight: 800,
  textAlign: 'center' as const,
  color: '#ffffff',
  background: 'rgba(0, 0, 0, 0.45)',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
},


  error: { marginTop: 10, color: '#FFE4E6', background: 'rgba(127,29,29,0.8)', padding: 10, borderRadius: 10 },

  wheelWrapper: { position: 'relative', width: 260, height: 260, margin: '14px auto' },
  wheel: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    border: '8px solid rgba(255,255,255,0.8)',
    boxShadow: 'inset 0 0 30px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.15)'
  },
  pointer: {
    position: 'absolute',
    top: -10,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 22,
    color: '#fff'
  },
  cardContent: {
  position: 'relative',
  zIndex: 1
}
};
