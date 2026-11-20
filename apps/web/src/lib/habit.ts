// Hábito de estudo sem depender de servidor de notificação: um lembrete diário na agenda do celular
// e o atalho do aplicativo na tela inicial.

/** Preferências deste aparelho. Ler ou gravar pode falhar (janela anônima, armazenamento bloqueado). */
export function remember(key: string, value = "1"): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento, a dica só volta a aparecer.
  }
}

export function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const SAW_PLAN = "ritmo-viu-plano";
export const WELCOME_CLOSED = "ritmo-boas-vindas-fechada";

const pad = (n: number) => String(n).padStart(2, "0");

export interface Reminder {
  /** "19:00", hora local do aparelho. */
  time: string;
  /** Todo dia, ou uma vez por semana no domingo. */
  every: "day" | "sunday";
  title: string;
  text: string;
  link: string;
}

/**
 * Evento que se repete na agenda (Google Agenda, Calendário do iPhone), com aviso na hora marcada.
 * Hora local flutuante: o lembrete toca às 19h onde a pessoa estiver.
 */
export function reminderIcs(r: Reminder, today = new Date()): string {
  const [h = 19, m = 0] = r.time.split(":").map(Number);
  const first = new Date(today);
  if (r.every === "sunday") first.setDate(first.getDate() + ((7 - first.getDay()) % 7));
  const day = `${first.getFullYear()}${pad(first.getMonth() + 1)}${pad(first.getDate())}`;
  const endMinutes = Math.min(h * 60 + m + 30, 23 * 60 + 59);
  const stamp = today.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const escape = (text: string) => text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ritmo 180//Lembrete//PT",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:lembrete-${r.every}-${day}-${pad(h)}${pad(m)}@ritmo180`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${pad(h)}${pad(m)}00`,
    `DTEND:${day}T${pad(Math.floor(endMinutes / 60))}${pad(endMinutes % 60)}00`,
    r.every === "day" ? "RRULE:FREQ=DAILY" : "RRULE:FREQ=WEEKLY;BYDAY=SU",
    `SUMMARY:${escape(r.title)}`,
    `DESCRIPTION:${escape(`${r.text} ${r.link}`)}`,
    `URL:${r.link}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(r.title)}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export const STUDY_REMINDER = (time: string): Reminder => ({ time, every: "day", title: "Ritmo 180: passos de hoje", text: "Abra o Ritmo 180 e faça os passos de hoje.", link: location.origin });
export const FAMILY_REMINDER = (time: string): Reminder => ({ time, every: "sunday", title: "Ritmo 180: semana do estudante", text: "Veja no portal da família como foi a semana de estudo.", link: location.origin });

export function downloadReminder(reminder: Reminder): void {
  const blob = new Blob([reminderIcs(reminder)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reminder.every === "day" ? "lembrete-ritmo180.ics" : "resumo-semanal-ritmo180.ics";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Compartilha pelo menu do celular (WhatsApp, SMS...); sem esse menu, copia o texto. */
export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return "shared";
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** O navegador avisa uma vez que o site pode ser instalado; guardamos o aviso para o botão usar depois. */
export function listenForInstall(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export const canInstall = () => deferred !== null;
export const isInstalled = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function install(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((fn) => fn());
  return outcome === "accepted";
}
