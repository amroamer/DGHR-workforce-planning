import { Languages } from "lucide-react";
import { useVoiceLang, type VoiceLang } from "@/lib/voiceLang";

const OPTIONS: { key: VoiceLang; label: string }[] = [
  { key: "en-AE", label: "EN" },
  { key: "ar-AE", label: "AR" },
];

/** Compact EN/AR pill that sets the shared dictation language for every mic in the app. */
export function VoiceLangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useVoiceLang();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-card p-0.5 ${className}`}
      title="Dictation language">
      <Languages size={12} className="ml-1 text-text3" />
      {OPTIONS.map((o) => (
        <button key={o.key} onClick={() => setLang(o.key)} aria-pressed={lang === o.key}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors duration-fast ${
            lang === o.key ? "bg-primary text-white" : "text-text3 hover:text-text1"}`}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
