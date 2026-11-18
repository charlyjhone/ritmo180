import { useCallback, useEffect, useRef, useState } from 'react';
import { simulate, type LaunchParams, type TrajectoryResult } from './simulate';
import { SHOT_COLORS } from '../../core/format';

export interface Shot {
  id: number;
  color: string;
  result: TrajectoryResult;
  /** Tempo de simulação já decorrido para este disparo (s) */
  t: number;
}

export const FRAME_STEP = 1 / 60; // s — avanço de um quadro no modo passo a passo
const MAX_SHOTS = 8;

export const inFlight = (s: Shot) => s.t < s.result.summary.flightTime;

export function useSimulation() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const nextId = useRef(1);
  const colorIdx = useRef(0);

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const anyInFlight = shots.some(inFlight);

  // Laço de animação (requestAnimationFrame ≈ 60 fps)
  useEffect(() => {
    if (!playing || !anyInFlight) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) * speedRef.current;
      last = now;
      setShots((prev) =>
        prev.map((s) => (inFlight(s) ? { ...s, t: Math.min(s.result.summary.flightTime, s.t + dt) } : s)),
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, anyInFlight]);

  const fire = useCallback((params: LaunchParams, paused = false) => {
    const result = simulate(params);
    const id = nextId.current++;
    const color = SHOT_COLORS[colorIdx.current++ % SHOT_COLORS.length];
    setShots((prev) => [...prev, { id, color, result, t: 0 }].slice(-MAX_SHOTS));
    setSelectedId(id);
    setPlaying(!paused);
    return id;
  }, []);

  const step = useCallback(
    (params: LaunchParams) => {
      setPlaying(false);
      if (!shots.some(inFlight)) {
        fire(params, true);
        return;
      }
      setShots((prev) =>
        prev.map((s) => (inFlight(s) ? { ...s, t: Math.min(s.result.summary.flightTime, s.t + FRAME_STEP) } : s)),
      );
    },
    [shots, fire],
  );

  const clear = useCallback(() => {
    setShots([]);
    setSelectedId(null);
    colorIdx.current = 0;
  }, []);

  const remove = useCallback((id: number) => {
    setShots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setSelectedId((sel) => (sel === id ? (next.at(-1)?.id ?? null) : sel));
      return next;
    });
  }, []);

  const selected = shots.find((s) => s.id === selectedId) ?? null;

  return {
    shots,
    selected,
    selectedId,
    setSelectedId,
    playing,
    setPlaying,
    speed,
    setSpeed,
    anyInFlight,
    fire,
    step,
    clear,
    remove,
  };
}
