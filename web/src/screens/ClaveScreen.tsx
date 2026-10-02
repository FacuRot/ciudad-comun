// /clave (docs/07-pantallas-y-flujos.md §4): adonde cae el link de recuperación.
// supabase-js levanta la sesión del hash del link antes de que se dibuje esto.
import { useState } from 'react';
import { cambiarClave } from '../api/auth';
import { GameError, messageOf } from '../api/errors';
import { useCity } from '../store/city';
import { navigate } from '../router';
import { t } from '../i18n';

const MIN = 8;

export function ClaveScreen() {
  const session = useCity((s) => s.session);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin sesión el link venció, se usó dos veces, o alguien abrió /clave de la nada.
  if (!session) {
    return (
      <div className="entrada">
        <div className="card">
          <h1>{t.password.title}</h1>
          <p>{new GameError('BAD_RECOVERY').message}</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => navigate('/entrar', true)}>
              {t.password.askAnother}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await cambiarClave(password);
      navigate('/city', true);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <div className="entrada">
      <form className="card" onSubmit={submit}>
        <h1>{t.password.choose}</h1>
        <label htmlFor="clave">{t.password.newLabel(MIN)}</label>
        <input
          id="clave"
          type="password"
          required
          minLength={MIN}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="primary" disabled={busy || password.length < MIN}>
            {t.common.save}
          </button>
        </div>
      </form>
    </div>
  );
}
