// Modal "Invitar" (docs/07-pantallas-y-flujos.md): genera el token y lo deja listo para mandar.
import { useEffect, useRef, useState } from 'react';
import { createInvitation } from '../api/actions';
import { messageOf } from '../api/errors';
import { t } from '../i18n';

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
      <div className="modal" role="dialog" aria-modal="true" aria-label={t.invite.label} onClick={(e) => e.stopPropagation()}>
        <h2>{t.invite.title}</h2>
        <p className="muted">{t.invite.info}</p>

        {error && <p className="error">{error}</p>}
        {!url && !error && <p>{t.invite.generating}</p>}

        {url && (
          <>
            <input className="invite-url" readOnly value={url} onFocus={(e) => e.target.select()} />
            {copied && <p className="muted">{t.invite.copied}</p>}
            <div className="row">
              <button type="button" className="secondary" onClick={copy}>
                {t.invite.copy}
              </button>
              <a
                className="primary as-button"
                href={`https://wa.me/?text=${encodeURIComponent(t.invite.message + url)}`}
                target="_blank"
                rel="noreferrer"
              >
                {t.invite.whatsapp}
              </a>
            </div>
          </>
        )}

        <div className="row">
          <button type="button" className="secondary" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
