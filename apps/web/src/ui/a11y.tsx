// Acessibilidade: tamanho do texto escolhido pelo aluno e leitura em voz alta pelo próprio navegador.
import { useEffect, useState } from "react";

export const TEXT_SIZES = [{ value: 1, label: "Normal" }, { value: 1.15, label: "Grande" }, { value: 1.3, label: "Muito grande" }] as const;
const SIZE_KEY = "ritmo-text-size";

export function loadTextSize(): number {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY));
    return TEXT_SIZES.some((s) => s.value === saved) ? saved : 1;
  } catch {
    return 1;
  }
}

/** O zoom escala também os tamanhos fixos em pixels do layout, que um font-size na raiz não alcançaria. */
export function applyTextSize(size: number): void {
  document.body.style.setProperty("zoom", size === 1 ? "" : String(size));
  try {
    localStorage.setItem(SIZE_KEY, String(size));
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
}

const plain = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim();
};

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Lê o texto em português do Brasil. Clicar de novo para. */
export function ReadAloud({ html, label = "Ouvir" }: { html: string; label?: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => {
    if (canSpeak()) window.speechSynthesis.cancel();
  }, []);
  if (!canSpeak()) return null;
  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(plain(html));
    utterance.lang = "pt-BR";
    const voice = synth.getVoices().find((v) => v.lang === "pt-BR") ?? synth.getVoices().find((v) => v.lang.startsWith("pt"));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.speak(utterance);
    setSpeaking(true);
  }
  return (
    <button className="btn soft slim" type="button" aria-pressed={speaking} onClick={toggle}>
      {speaking ? "Parar leitura" : label}
    </button>
  );
}

export function TextSizeSetting() {
  const [size, setSize] = useState(loadTextSize);
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label-caps" style={{ padding: 0 }}>TAMANHO DO TEXTO</legend>
      <div className="btn-row">
        {TEXT_SIZES.map((s) => (
          <button key={s.value} className={`btn ${size === s.value ? "" : "soft"}`} type="button" aria-pressed={size === s.value} onClick={() => { applyTextSize(s.value); setSize(s.value); }}>{s.label}</button>
        ))}
      </div>
    </fieldset>
  );
}
