import { useRef, useState } from "react";
import { Sparkles, Send, Mic, ChevronDown, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useSpeech, joinTranscript } from "@/lib/useSpeech";
import { useVoiceLang } from "@/lib/voiceLang";
import { VoiceLangToggle } from "@/components/shared/VoiceLangToggle";

type Turn = { role: "user" | "assistant"; content: string; source?: string; streaming?: boolean };

const GOV_SUGGESTIONS = [
  "Where's the biggest gap and why?",
  "Which entities are in surplus?",
  "What's the Emiratization rate?",
  "What does the projection show?",
];
const ENTITY_SUGGESTIONS = [
  "Which department has the biggest gap?",
  "Are any departments in surplus?",
  "What's our Emiratization rate?",
  "What does the projection show?",
];

/** Ask-the-data chat over the government-wide OR one entity's position. Every answer is grounded
 *  server-side in a snapshot of the same figures this page renders — the model never sees anything
 *  else, so it can't invent a number. Answers stream token-by-token. Ask by typing or by voice. */
export function AskDataPanel({ scope = "gov", entityId, scenario = "base" }: {
  scope?: "gov" | "entity"; entityId?: number; scenario?: string;
}) {
  const [open, setOpen] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const baseRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestions = scope === "entity" ? ENTITY_SUGGESTIONS : GOV_SUGGESTIONS;

  const speech = useSpeech({
    onTranscript: (fin, interim) => {
      if (fin) baseRef.current = joinTranscript(baseRef.current, fin);
      setText(interim ? joinTranscript(baseRef.current, interim) : baseRef.current);
    },
    onError: (err) => toast.error(err === "not-allowed" ? "Microphone access was blocked." : `Voice capture failed (${err}).`),
    lang: useVoiceLang((s) => s.lang),
  });
  const mic = () => {
    if (!speech.supported) return toast.error("Voice isn't supported in this browser.");
    if (speech.listening) return speech.stop();
    baseRef.current = text;
    speech.start();
  };

  const toBottom = (smooth = false) =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" }));

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    if (speech.listening) speech.stop();
    // Send the prior transcript as context so follow-ups ("…and which is worst?") resolve.
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((ts) => [...ts, { role: "user", content: q }, { role: "assistant", content: "", streaming: true }]);
    setText(""); baseRef.current = "";
    setBusy(true);
    toBottom();
    try {
      const { source } = await api.aiAskStream(
        { question: q, scope, entity_id: entityId, scenario, history },
        (delta) => {
          setTurns((ts) => {
            const copy = ts.slice();
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + delta };
            return copy;
          });
          toBottom();
        },
      );
      setTurns((ts) => {
        const copy = ts.slice();
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = {
            ...last, streaming: false, source,
            content: last.content || "I couldn't find that in the submitted data.",
          };
        }
        return copy;
      });
    } catch (e) {
      setTurns((ts) => {
        const copy = ts.slice();
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong." };
        return copy;
      });
    } finally {
      setBusy(false);
      toBottom(true);
    }
  };

  const title = scope === "entity" ? "Ask about your workforce" : "Ask the data";

  return (
    <Card className="mb-4 border-dashed border-teal/50 bg-teal-bg/30 p-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <MessageCircleQuestion size={16} className="text-teal" />
        <span className="text-sm font-bold text-text1">{title}</span>
        <span className="text-xs text-text3">Answers grounded in this page's figures</span>
        <ChevronDown size={16} className={`ml-auto text-text3 transition-transform duration-fast ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <div className="border-t border-teal/20 p-4">
          {turns.length > 0 && (
            <div ref={scrollRef} className="mb-3 max-h-80 space-y-3 overflow-y-auto pr-1">
              {turns.map((t, i) => (
                t.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-white">{t.content}</div>
                  </div>
                ) : (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="max-w-[92%] rounded-xl rounded-bl-sm border border-border bg-card px-3 py-2 text-sm leading-relaxed text-text2">
                      {t.content || (t.streaming ? <span className="inline-flex items-center gap-1.5 text-text3"><Sparkles size={12} className="animate-pulse text-teal" /> Reading the data…</span> : null)}
                      {t.streaming && t.content && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-teal align-text-bottom" />}
                    </div>
                    {!t.streaming && t.source && (
                      <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold text-text3">
                        <Sparkles size={10} className="text-teal" /> {t.source === "ai" ? "live model" : "offline"}
                      </span>
                    )}
                  </div>
                )
              ))}
            </div>
          )}

          {turns.length === 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-text2 transition-colors duration-fast hover:border-teal hover:text-teal">
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ask(text); }}
              placeholder="Ask about gaps, Emiratization, cost, the projection…" className="flex-1" />
            <VoiceLangToggle />
            <Button variant="secondary" size="sm" onClick={mic} aria-label="Ask by voice"
              className={speech.listening ? "!border-danger/40 !text-danger" : ""}>
              <Mic size={15} className={speech.listening ? "animate-pulse" : ""} />
            </Button>
            <Button size="sm" onClick={() => ask(text)} disabled={busy || !text.trim()}><Send size={15} /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}
