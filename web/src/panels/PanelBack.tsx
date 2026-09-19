// Vuelta al panel de mi lote desde cualquier otro panel.
export function PanelBack({ onBack, label = 'Mi lote' }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" className="back" onClick={onBack}>
      ← {label}
    </button>
  );
}
