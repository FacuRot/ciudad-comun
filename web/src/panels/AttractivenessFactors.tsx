// Los cuatro factores del atractivo como barras, con el que más resta marcado, y el motivo
// principal en una línea (docs/05 §16.2). Lo usan el panel del barrio y el del residencial.
import type { Attractiveness } from '../game/citizens';
import { FACTOR_KEYS } from '../game/citizens';
import { FACTOR_LABEL, formatPercent, reasonText } from '../game/format';

export function AttractivenessFactors({ attractiveness, workName }: { attractiveness: Attractiveness; workName?: string }) {
  const reason = attractiveness.mainReason;
  return (
    <>
      <ul className="factors">
        {FACTOR_KEYS.map((key) => {
          const value = attractiveness.factors[key];
          return (
            <li key={key} className={key === reason ? 'worst' : undefined}>
              <span>{key === 'obra' && workName ? workName : FACTOR_LABEL[key]}</span>
              <span>{formatPercent(value)}</span>
              <div className="bar">
                <span style={{ width: `${value * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p>
        {reason ? (
          <>
            Lo que más resta: <strong>{reasonText(reason, workName)}</strong>.
          </>
        ) : (
          'No le falta nada.'
        )}
      </p>
    </>
  );
}
