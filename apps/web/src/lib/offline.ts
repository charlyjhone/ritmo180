// Treino sem internet: o pacote fica no aparelho e as respostas aguardam numa fila até voltarem a ser enviadas.
import type { AttemptInput, CardReview, LessonBundle, MissReasonInput, PracticeSessionPack, SyncResult } from "@ritmo/contracts";
import { api } from "./api.ts";

const DB = "ritmo-offline";
const OUTBOX = "outbox";
const STATE = "state";
const PACK_KEY = "pack";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OUTBOX, { keyPath: "id" });
      request.result.createObjectStore(STATE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store<T>(name: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = work(tx.objectStore(name));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export interface SavedPack {
  /** Dono do pacote: num aparelho compartilhado, um aluno não vê o treino do outro. */
  owner: string;
  pack: PracticeSessionPack;
  /** Questões já respondidas neste pacote. */
  done: number;
}

export const savePack = (saved: SavedPack) => store(STATE, "readwrite", (s) => s.put(saved, PACK_KEY));
export async function loadPack(owner: string): Promise<SavedPack | undefined> {
  const saved = await store<SavedPack | undefined>(STATE, "readonly", (s) => s.get(PACK_KEY));
  return saved?.owner === owner ? saved : undefined;
}
export const clearPack = () => store(STATE, "readwrite", (s) => s.delete(PACK_KEY));
export const pendingCount = () => store(OUTBOX, "readonly", (s) => s.count());

const listeners = new Set<() => void>();
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => listeners.forEach((l) => l());

export async function queueAttempt(attempt: AttemptInput): Promise<void> {
  await store(OUTBOX, "readwrite", (s) => s.put(attempt));
  notify();
  void flushQueue();
}

// Motivos de erro e respostas aos cartões também esperam a internet voltar. Ficam no aparelho só até serem enviados.
const MISS_KEY = "miss-outbox";
const CARD_KEY = "card-outbox";
const LESSONS_KEY = "lessons";

async function append<T>(key: string, entry: T): Promise<void> {
  const list = (await store<T[] | undefined>(STATE, "readonly", (s) => s.get(key))) ?? [];
  await store(STATE, "readwrite", (s) => s.put([...list, entry], key));
}

export async function queueMissReason(input: MissReasonInput): Promise<void> {
  await append(MISS_KEY, input);
  void flushQueue();
}

export async function queueCardReview(review: CardReview): Promise<void> {
  await append(CARD_KEY, review);
}

/** Envia o que está guardado em `key` e tira da fila só o que foi aceito. */
async function flushList<T>(key: string, send: (list: T[]) => Promise<unknown>): Promise<void> {
  const list = (await store<T[] | undefined>(STATE, "readonly", (s) => s.get(key))) ?? [];
  if (!list.length) return;
  await send(list);
  const now = (await store<T[] | undefined>(STATE, "readonly", (s) => s.get(key))) ?? [];
  await store(STATE, "readwrite", (s) => s.put(now.slice(list.length), key));
}

export const flushCardReviews = () => flushList<CardReview>(CARD_KEY, async (reviews) => {
  for (let i = 0; i < reviews.length; i += 300) await api.post("/api/study/cards", { reviews: reviews.slice(i, i + 300) });
});

/** Aulas guardadas para ler sem internet. Não têm dado de aluno. */
export const saveLessons = (bundle: LessonBundle & { savedAt: number }) => store(STATE, "readwrite", (s) => s.put(bundle, LESSONS_KEY));
export const loadLessons = () => store<(LessonBundle & { savedAt: number }) | undefined>(STATE, "readonly", (s) => s.get(LESSONS_KEY));

let flushing = false;

/** Envia a fila em lotes. O servidor ignora repetições, então reenviar é seguro. */
export async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    // A tentativa vai antes do motivo do erro, que se refere a ela.
    const attempts = await store<AttemptInput[]>(OUTBOX, "readonly", (s) => s.getAll());
    for (let i = 0; i < attempts.length; i += 100) {
      const batch = attempts.slice(i, i + 100);
      const result = await api.post<SyncResult>("/api/practice/sync", { attempts: batch });
      for (const id of [...result.accepted, ...result.duplicates, ...result.rejected.map((r) => r.id)]) {
        await store(OUTBOX, "readwrite", (s) => s.delete(id));
      }
      notify();
    }
    await flushList<MissReasonInput>(MISS_KEY, async (list) => {
      for (const input of list) await api.post("/api/study/miss-reason", input);
    });
    await flushCardReviews();
  } catch {
    // Continua na fila para a próxima tentativa.
  } finally {
    flushing = false;
  }
}

const RETRY_MS = 60_000;

export function startSync(): void {
  window.addEventListener("online", () => void flushQueue());
  // O evento "online" não dispara quando a rede volta sem o aparelho ter percebido a queda.
  setInterval(() => void flushQueue(), RETRY_MS);
  void flushQueue();
}
