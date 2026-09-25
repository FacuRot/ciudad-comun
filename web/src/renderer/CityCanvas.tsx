import { useEffect, useRef, useState } from 'react';
import type { Cell } from '../game/geo';
import { cellAt, clampView, computeLayout, zoomAt, WHOLE_CITY, type Layout, type View } from './layout';
import { drawScene, type Scene } from './draw';
import { Traffic } from './traffic';

type Props = {
  scene: Scene;
  onCellClick?: (cell: Cell) => void;
  tooltip?: (cell: Cell) => string | null;
};

// ~30 cuadros por segundo: lo justo para que los autos y la gente se muevan parejo.
const FRAME_MS = 30;
// Un toque que se movió más que esto fue un arrastre, no un clic.
const DRAG_PX = 6;

export function CityCanvas({ scene, onCellClick, tooltip }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  const layoutRef = useRef<Layout | null>(null);
  const viewRef = useRef<View>(WHOLE_CITY);
  const hoverRef = useRef<Cell | null>(null);
  const trafficRef = useRef<Traffic | null>(null);
  const [hover, setHover] = useState<{ cell: Cell; px: number; py: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);

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
      // Al cambiar de tamaño la pantalla, el zoom guardado puede quedar fuera de rango.
      viewRef.current = clampView(viewRef.current, w, h, s.cols, s.rows);
      const layout = computeLayout(w, h, s.cols, s.rows, viewRef.current);
      layoutRef.current = layout;
      const traffic = (trafficRef.current ??= new Traffic());
      traffic.update(s, time);
      drawScene(ctx, layout, { ...s, hovered: hoverRef.current, traffic }, Date.now());
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- Zoom y arrastre -------------------------------------------------
  // Dedos (o mouse) apoyados sobre el canvas, en coordenadas del canvas.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<number | null>(null); // distancia entre los dos dedos del pellizco
  const movedRef = useRef(0); // cuánto se movió el gesto: separa el toque del arrastre

  const size = () => {
    const wrap = wrapRef.current;
    return { w: wrap?.clientWidth ?? 0, h: wrap?.clientHeight ?? 0 };
  };

  const setView = (view: View) => {
    const { w, h } = size();
    const s = sceneRef.current;
    viewRef.current = clampView(view, w, h, s.cols, s.rows);
    setZoomed(viewRef.current.zoom > 1);
  };

  const zoomBy = (factor: number, px: number, py: number) => {
    const { w, h } = size();
    const s = sceneRef.current;
    setView(zoomAt(viewRef.current, w, h, s.cols, s.rows, factor, px, py));
  };

  const resetView = () => setView(WHOLE_CITY);

  // La rueda del mouse acerca y aleja. Listener propio: el de React es pasivo y no deja
  // cancelar el desplazamiento de la página.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY / 400), e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // zoomBy lee todo de refs: no hace falta volver a suscribir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const mark = (cell: Cell | null, px: number, py: number) => {
    hoverRef.current = cell;
    setHover(cell ? { cell, px, py } : null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { cell, px, py } = locate(e);
    // Seguir el dedo aunque se salga del canvas. Si el navegador no deja, no importa.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura: el gesto funciona igual mientras no se salga */
    }
    pointers.current.set(e.pointerId, { x: px, y: py });
    if (pointers.current.size === 1) {
      movedRef.current = 0;
      mark(cell, px, py);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { cell, px, py } = locate(e);
    const previous = pointers.current.get(e.pointerId);
    if (!previous) {
      // Mouse sin botón apretado: solo mueve la celda marcada.
      mark(cell, px, py);
      return;
    }
    movedRef.current += Math.abs(px - previous.x) + Math.abs(py - previous.y);
    pointers.current.set(e.pointerId, { x: px, y: py });
    const touching = [...pointers.current.values()];

    if (touching.length >= 2) {
      // Pellizco: el zoom sigue cuánto se separaron los dedos, alrededor del punto medio.
      const [a, b] = touching;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchRef.current && distance > 0) {
        zoomBy(distance / pinchRef.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pinchRef.current = distance;
      setHover(null);
      hoverRef.current = null;
      return;
    }

    if (viewRef.current.zoom > 1) {
      const view = viewRef.current;
      setView({ ...view, panX: view.panX + (px - previous.x), panY: view.panY + (py - previous.y) });
      setHover(null);
      hoverRef.current = null;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  };

  return (
    <div ref={wrapRef} className="city-canvas">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch') return;
          hoverRef.current = null;
          setHover(null);
        }}
        onClick={(e) => {
          // Arrastrar el mapa o pellizcarlo no abre ningún panel.
          if (movedRef.current > DRAG_PX) return;
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
      {zoomed && (
        <button type="button" className="unzoom" onClick={resetView}>
          Ver toda la ciudad
        </button>
      )}
    </div>
  );
}
