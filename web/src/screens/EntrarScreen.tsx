// /entrar (docs/07-pantallas-y-flujos.md §4): entra quien ya tiene cuenta.
// El registro no vive acá: se hace desde el link de invitación.
import { useEffect, useState } from 'react';
import { entrar, pedirClaveNueva } from '../api/auth';
import { messageOf } from '../api/errors';
import { useCity } from '../store/city';
import { navigate } from '../router';
import { Notice } from '../App';

export function EntrarScreen() {
  const session = useCity((s) => s.session);
  const [olvide, setOlvide] = useState(false);

  // Con sesión no hay nada que hacer acá.
  useEffect(() => {
    if (session) navigate('/city', true);
  }, [session]);

  if (session) return <Notice>Cargando…</Notice>;

  return (
    <div className="entrada">
      {olvide ? <OlvideCard onBack={() => setOlvide(false)} /> : <LoginCard onOlvide={() => setOlvide(true)} />}
    </div>
  );
}

function LoginCard({ onOlvide }: { onOlvide: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await entrar(email.trim(), password);
      // Con la sesión arriba, EntrarScreen redirige a /city.
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>Entrar a Ciudad Común</h1>
      <label htmlFor="email">Tu email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label htmlFor="clave">Tu contraseña</label>
      <input
        id="clave"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy}>
          Entrar
        </button>
      </div>
      <p>
        <button type="button" className="link" onClick={onOlvide}>
          Olvidé mi contraseña
        </button>
      </p>
      <p className="muted">¿Te invitaron y todavía no tenés lote? Abrí el link que te pasaron.</p>
    </form>
  );
}

function OlvideCard({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await pedirClaveNueva(email.trim());
      setState('sent');
    } catch (err) {
      setError(messageOf(err));
      setState('idle');
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>Contraseña nueva</h1>
      {state === 'sent' ? (
        <>
          <p>Revisá tu email. Te mandamos un link para elegir una contraseña nueva.</p>
          <div className="row">
            <button type="button" className="secondary" onClick={onBack}>
              Volver
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Te mandamos un link para elegir otra.</p>
          <label htmlFor="email">Tu email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="button" className="secondary" onClick={onBack} disabled={state === 'sending'}>
              Volver
            </button>
            <button className="primary" disabled={state === 'sending'}>
              Mandame el link
            </button>
          </div>
        </>
      )}
    </form>
  );
}
