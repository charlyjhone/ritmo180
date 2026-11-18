import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

export type Sample = { t: number } & Record<string, number>;

export interface StepperConfig<S> {
  /** Estado inicial (chamado no início e a cada reinício). */
  create: () => S;
  /** Avança o estado em h segundos de simulação. Pode ler parâmetros atuais por closure. */
  step: (s: S, h: number, t: number) => S;
  /** Grandezas registradas no histórico (gráficos e exportação). */
  sample: (s: S, t: number) => Record<string, number>;
  /** Instante final exato (a simulação para nele). */
  tEnd?: number;
  /** Para a simulação quando retorna true. */
  until?: (s: S, t: number) => boolean;
  /** Passo interno de integração (s). */
  dt?: number;
  /** Intervalo de amostragem do histórico (s). */
  sampleEvery?: number;
  /** Segundos de simulação por segundo real, em 1×. */
  timeScale?: number;
  /** Máximo de amostras guardadas. */
  maxSamples?: number;
  /** Quando qualquer valor muda, a simulação reinicia (condições iniciais). */
  resetKey: unknown[];
  /** Começa tocando. */
  autoplay?: boolean;
}

/**
 * Laço de simulação com passo fixo, independente da taxa de quadros (requestAnimationFrame ≈ 60 fps).
 * Guarda estado e histórico em refs e força uma renderização por quadro.
 */
export function useStepper<S>(cfg: StepperConfig<S>) {
  const fns = useRef(cfg);
  fns.current = cfg;
  const dt = cfg.dt ?? 1 / 240;

  const state = useRef<S>(cfg.create());
  const time = useRef(0);
  const history = useRef<Sample[]>([]);
  const nextSample = useRef(0);
  const finished = useRef(false);
  const [playing, setPlaying] = useState(cfg.autoplay ?? false);
  const [speed, setSpeed] = useState(1);
  const [frame, tick] = useReducer((x: number) => x + 1, 0);

  const record = () => {
    const sampleEvery = fns.current.sampleEvery ?? 1 / 30;
    const maxSamples = fns.current.maxSamples ?? 20000;
    while (time.current >= nextSample.current - 1e-9) {
      history.current.push({ t: time.current, ...fns.current.sample(state.current, time.current) } as Sample);
      nextSample.current += sampleEvery;
      if (history.current.length > maxSamples) history.current.splice(0, history.current.length - maxSamples);
    }
  };

  const reset = useCallback(() => {
    state.current = fns.current.create();
    time.current = 0;
    history.current = [];
    nextSample.current = 0;
    finished.current = false;
    record();
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reinicia quando as condições iniciais mudam
  const keyStr = JSON.stringify(cfg.resetKey);
  useEffect(() => {
    reset();
  }, [keyStr, reset]);

  const advance = useCallback(
    (simDt: number) => {
      let rem = simDt;
      while (rem > 1e-12) {
        const tEnd = fns.current.tEnd;
        if (fns.current.until?.(state.current, time.current) || (tEnd !== undefined && time.current >= tEnd - 1e-12)) {
          finished.current = true;
          setPlaying(false);
          break;
        }
        // o passo termina exatamente no próximo instante de amostragem (séries sem jitter)
        const toSample = nextSample.current - time.current;
        const h = Math.min(fns.current.dt ?? 1 / 240, rem, tEnd !== undefined ? tEnd - time.current : Infinity, toSample > 1e-12 ? toSample : Infinity);
        state.current = fns.current.step(state.current, h, time.current);
        time.current += h;
        rem -= h;
        record();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dt],
  );

  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const real = Math.min((now - last) / 1000, 0.05);
      last = now;
      advance(real * speedRef.current * (fns.current.timeScale ?? 1));
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, advance]);

  const toggle = useCallback(() => {
    if (finished.current) {
      reset();
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [reset]);

  const stepFrame = useCallback(() => {
    setPlaying(false);
    if (finished.current) return;
    advance((1 / 60) * (fns.current.timeScale ?? 1));
    tick();
  }, [advance]);

  return {
    state: state.current,
    t: time.current,
    history: history.current,
    frame,
    playing,
    finished: finished.current,
    setPlaying,
    toggle,
    stepFrame,
    reset,
    speed,
    setSpeed,
  };
}

export type Stepper<S> = ReturnType<typeof useStepper<S>>;

/** RK4 genérico para vetores de estado. */
export function rk4(y: number[], h: number, f: (y: number[]) => number[]): number[] {
  const n = y.length;
  const add = (a: number[], b: number[], m: number) => a.map((v, i) => v + b[i] * m);
  const k1 = f(y);
  const k2 = f(add(y, k1, h / 2));
  const k3 = f(add(y, k2, h / 2));
  const k4 = f(add(y, k3, h));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

/** Instantes em que a série cruza zero subindo (interpolação linear). */
export function upwardZeroCrossings(hist: Sample[], key: string): number[] {
  const out: number[] = [];
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1][key];
    const b = hist[i][key];
    if (a < 0 && b >= 0) out.push(hist[i - 1].t + ((0 - a) / (b - a)) * (hist[i].t - hist[i - 1].t));
  }
  return out;
}

/** Período médio a partir dos cruzamentos por zero. */
export function measuredPeriod(hist: Sample[], key: string): number | null {
  const z = upwardZeroCrossings(hist, key);
  if (z.length < 2) return null;
  return (z[z.length - 1] - z[0]) / (z.length - 1);
}
