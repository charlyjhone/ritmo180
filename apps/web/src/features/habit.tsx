// Lembrete diário e atalho na tela inicial: o que traz o aluno de volta todo dia.
import { useEffect, useState } from "react";
import { canInstall, downloadReminder, install, isInstalled, isIos, onInstallChange, STUDY_REMINDER } from "../lib/habit.ts";

export function HabitTools({ compact = false }: { compact?: boolean }) {
  const [time, setTime] = useState("19:00");
  const [installable, setInstallable] = useState(canInstall());
  const [saved, setSaved] = useState(false);
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  const installed = isInstalled();
  return (
    <div className={`habit ${compact ? "compact" : ""}`}>
      <div className="habit-item">
        <div className="grow">
          <div className="row-title">Lembrete todo dia</div>
          <div className="row-sub">Entra na agenda do seu celular e avisa na hora escolhida.</div>
        </div>
        <label className="field-sm habit-time">Horário
          <input type="time" value={time} onChange={(e) => setTime(e.target.value || "19:00")} />
        </label>
        <button className="btn soft slim" type="button" onClick={() => { downloadReminder(STUDY_REMINDER(time)); setSaved(true); }}>Pôr na agenda</button>
      </div>
      {saved ? <p className="sub habit-note" role="status">Abra o arquivo baixado e confirme “Adicionar” na agenda.</p> : null}
      {installed ? null : (
        <div className="habit-item">
          <div className="grow">
            <div className="row-title">Ritmo 180 na tela inicial</div>
            <div className="row-sub">
              {installable ? "Abre como aplicativo e funciona sem internet no treino." : isIos() ? "No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”." : "No menu do navegador, escolha “Instalar aplicativo” ou “Adicionar à tela inicial”."}
            </div>
          </div>
          {installable ? <button className="btn soft slim" type="button" onClick={() => void install()}>Instalar</button> : null}
        </div>
      )}
    </div>
  );
}
