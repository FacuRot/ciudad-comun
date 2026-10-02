// Panel de obra pública (docs/07-pantallas-y-flujos.md): barras, aporte y placa.
import { useEffect, useState } from 'react';
import { contribute } from '../api/actions';
import { GameError, messageOf } from '../api/errors';
import { loadContributions } from '../api/reads';
import { useCity } from '../store/city';
import { workAmounts } from '../game/geo';
import { MATERIAL_LABEL, formatPercent } from '../game/format';
import { configOf, type Material, type PublicWork, type WorkAmounts } from '../types/game';
import { PanelBack } from './PanelBack';
import { t } from '../i18n';

const MATERIALS: Material[] = ['ladrillo', 'madera', 'energia'];

export function WorkPanel({ work, onBack }: { work: PublicWork; onBack: () => void }) {
  const snapshot = useCity((s) => s.snapshot)!;
  const me = useCity((s) => s.me)!;
  const inventory = useCity((s) => s.inventory);
  const cfg = configOf(snapshot.city);
  const barrio = snapshot.barrios.find((b) => b.id === work.barrio_id);
  const cost = workAmounts(work.cost);
  const progress = workAmounts(work.progress);
  const done = work.status === 'completada';
  const missing = (k: keyof WorkAmounts) => Math.max(0, cost[k] - progress[k]);

  return (
    <aside className="panel">
      <section>
        <PanelBack onBack={onBack} />
        <h2>{work.name}</h2>
        <p className="muted">
          {barrio?.name ?? t.work.theCity} ·{' '}
          {done
            ? t.work.doneBonus(formatPercent(cfg.production.public_work_bonus))
            : t.work.pendingBonus(formatPercent(cfg.production.public_work_bonus))}
        </p>
      </section>

      <section>
        {(['ladrillo', 'madera', 'energia', 'jornadas'] as const).map((k) => (
          <WorkBar
            key={k}
            label={k === 'jornadas' ? t.work.jornadas : MATERIAL_LABEL[k]}
            value={progress[k]}
            total={cost[k]}
            missing={missing(k)}
          />
        ))}
      </section>

      {!done && (
        <ContributeForm
          work={work}
          missing={{ ladrillo: missing('ladrillo'), madera: missing('madera'), energia: missing('energia') }}
          have={(m) => inventory?.[m] ?? 0}
          jornadas={me.jornadas}
          jornadasDone={missing('jornadas') === 0}
        />
      )}

      <Placa work={work} done={done} meId={me.id} />
    </aside>
  );
}

function WorkBar({ label, value, total, missing }: { label: string; value: number; total: number; missing: number }) {
  return (
    <div className="workbar">
      <p className="workbar-head">
        <span>{label}</span>
        <span className="muted">
          {value} / {total}
          {missing > 0 && t.work.missing(missing)}
        </span>
      </p>
      <div className="bar">
        <span style={{ width: `${total > 0 ? Math.min(100, (value / total) * 100) : 100}%` }} />
      </div>
    </div>
  );
}

// Tres campos prellenados con lo que tengo o lo que falta, lo que sea menor.
// Mientras falten jornadas se puede aportar con los tres en cero: la jornada sola cuenta.
// Con las jornadas completas el aporte tiene que llevar algún material (docs/05 §5).
function ContributeForm(props: {
  work: PublicWork;
  missing: Record<Material, number>;
  have: (m: Material) => number;
  jornadas: number;
  jornadasDone: boolean;
}) {
  const { work, missing, have, jornadas, jornadasDone } = props;
  const [draft, setDraft] = useState<Record<Material, number> | null>(null); // null: usar los valores sugeridos
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = (m: Material) => Math.min(have(m), missing[m]);
  const suggested = { ladrillo: cap('ladrillo'), madera: cap('madera'), energia: cap('energia') };
  const amounts = draft ?? suggested;
  const needsMaterials = jornadasDone && amounts.ladrillo + amounts.madera + amounts.energia === 0;

  // Al cambiar de obra vuelven los valores sugeridos de esa obra.
  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [work.id]);

  const set = (m: Material, raw: string) => {
    const n = Math.max(0, Math.min(cap(m), Math.floor(Number(raw) || 0)));
    setDraft({ ...amounts, [m]: n });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await contribute(work.id, amounts);
      setDraft(null); // se vuelve a prellenar con lo que falta ahora
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>{t.work.contribute}</h3>
      <div className="give">
        {MATERIALS.map((m) => (
          <label key={m}>
            <span>{MATERIAL_LABEL[m]}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={cap(m)}
              value={amounts[m]}
              disabled={busy || cap(m) === 0}
              onChange={(e) => set(m, e.target.value)}
            />
            <small className="muted">{t.work.ofHave(have(m))}</small>
          </label>
        ))}
      </div>
      {needsMaterials ? (
        <p className="muted">{new GameError('WORK_NEEDS_MATERIALS').message}</p>
      ) : (
        jornadas < 1 && <p className="error">{new GameError('NO_JORNADAS').message}</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy || jornadas < 1 || needsMaterials} onClick={submit}>
          {t.work.contributeButton}
        </button>
      </div>
    </section>
  );
}

// Placa: quiénes aportaron, ordenados por cantidad de aportes. Al completarse queda fija.
function Placa({ work, done, meId }: { work: PublicWork; done: boolean; meId: string }) {
  const players = useCity((s) => s.snapshot!.players);
  const [rows, setRows] = useState<{ player_id: string; ladrillo: number; madera: number; energia: number }[] | null>(
    null,
  );

  // Cada aporte mueve el progreso de la obra: con eso alcanza para saber cuándo releer.
  useEffect(() => {
    let cancelled = false;
    loadContributions(work.id)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [work.id, work.progress]);

  if (!rows) return null;

  const byPlayer = new Map<string, number>();
  for (const r of rows) byPlayer.set(r.player_id, (byPlayer.get(r.player_id) ?? 0) + 1);
  const names = new Map(players.map((p) => [p.id, p.display_name]));
  const list = [...byPlayer.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section>
      <h3>{done ? t.work.builtBy : t.work.contributors}</h3>
      {list.length === 0 ? (
        <p className="muted">{t.work.noContributors}</p>
      ) : (
        <ul className="placa">
          {list.map(([id, count]) => (
            <li key={id} className={id === meId ? 'me' : undefined}>
              <span>{names.get(id) ?? t.common.someoneLower}</span>
              <span className="muted">{t.work.contributions(count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
