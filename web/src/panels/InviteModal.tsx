// Modal "Invitar" (docs/07-pantallas-y-flujos.md): genera el token y lo deja listo para mandar.
import { useEffect, useRef, useState } from 'react';
import { createInvitation } from '../api/actions';
import { messageOf } from '../api/errors';

const TEXTO = 'Te guardé un lote al lado del mío en Ciudad Común: ';

export function InviteModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const asked = useRef(false); // en StrictMode el efecto corre dos veces: un token alcanza

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    createInvitation()
      .then((token) => setUrl(`${window.location.origin}/join/${token}`))
      .catch((e) => setError(messageOf(e)));
  }, []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false); // sin permiso de portapapeles queda el campo para copiar a mano
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Invitar" onClick={(e) => e.stopPropagation()}>
        <h2>Invitar a alguien</h2>
        <p className="muted">
          Cada link sirve una sola vez. Quien lo abra puede fundar su lote cerca del tuyo.
        </p>

        {error && <p className="error">{error}</p>}
        {!url && !error && <p>Generando el link…</p>}

        {url && (
          <>
            <input className="invite-url" readOnly value={url} onFocus={(e) => e.target.select()} />
            {copied && <p className="muted">Copiado.</p>}
            <div className="row">
              <button type="button" className="secondary" onClick={copy}>
                Copiar
              </button>
              <a
                className="primary as-button"
                href={`https://wa.me/?text=${encodeURIComponent(TEXTO + url)}`}
                target="_blank"
                rel="noreferrer"
              >
                Mandar por WhatsApp
              </a>
            </div>
          </>
        )}

        <div className="row">
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
