import { useEffect, useRef, useState } from 'react';
import type { Cell } from '../game/geo';
import { cellAt, computeLayout, type Layout } from './layout';
import { drawScene, type Scene } from './draw';

type Props = {
  scene: Scene;
  onCellClick?: (cell: Cell) => void;
  tooltip?: (cell: Cell) => string | null;
};

// ~15 cuadros por segundo: alcanza para el pulso de los lotes sugeridos y el paso del día.
const FRAME_MS = 66;

export function CityCanvas({ scene, onCellClick, tooltip }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  const layoutRef = useRef<Layout | null>(null);
  const hoverRef = useRef<Cell | null>(null);
  const [hover, setHover] = useState<{ cell: Cell; px: number; py: number } | null>(null);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  // Redibujo total en cada cuadro.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (time - last < FRAME_MS) return;
      last = time;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !wrap || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = sceneRef.current;
      const layout = computeLayout(w, h, s.cols, s.rows);
      layoutRef.current = layout;
      drawScene(ctx, layout, { ...s, hovered: hoverRef.current }, Date.now());
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  function locate(e: React.PointerEvent | React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cell = layoutRef.current ? cellAt(layoutRef.current, px, py) : null;
    return { cell, px, py };
  }

  const tip = hover && tooltip ? tooltip(hover.cell) : null;

  // Con el dedo no hay hover: tocar una celda la deja marcada hasta tocar otra.
  const track = (e: React.PointerEvent) => {
    const { cell, px, py } = locate(e);
    hoverRef.current = cell;
    setHover(cell ? { cell, px, py } : null);
  };

  return (
    <div ref={wrapRef} className="city-canvas">
      <canvas
        ref={canvasRef}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch') return;
          hoverRef.current = null;
          setHover(null);
        }}
        onClick={(e) => {
          const { cell } = locate(e);
          if (cell) onCellClick?.(cell);
        }}
        style={{ cursor: onCellClick ? 'pointer' : 'default' }}
      />
      {tip && hover && (
        <div className="tooltip" style={{ left: hover.px + 12, top: hover.py + 12 }}>
          {tip}
        </div>
      )}
    </div>
  );
}
