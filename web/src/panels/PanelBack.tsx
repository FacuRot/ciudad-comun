// Vuelta al panel de mi lote desde cualquier otro panel.
import { t } from '../i18n';

export function PanelBack({ onBack, label = t.common.myLot }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" className="back" onClick={onBack}>
      ← {label}
    </button>
  );
}
