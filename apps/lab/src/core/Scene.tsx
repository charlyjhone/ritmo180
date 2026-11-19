import { useEffect, useRef } from 'react';
import { useCanvas, type DrawFn } from './canvas';

/** Canvas principal de um módulo. `draw` é chamado a cada quadro; `onPointer` recebe a posição do cursor em px. */
export default function Scene({ draw, label, onPointer }: { draw: DrawFn; label: string; onPointer?: (p: { x: number; y: number } | null) => void }) {
  const { wrapRef, canvasRef } = useCanvas(draw);
  const cb = useRef(onPointer);
  cb.current = onPointer;
  useEffect(() => {
    const c = canvasRef.current!;
    const move = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      cb.current?.({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const leave = () => cb.current?.(null);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerleave', leave);
    return () => {
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerleave', leave);
    };
  }, [canvasRef]);
  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block touch-none" role="img" aria-label={label} />
    </div>
  );
}
