import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Speech API surface — not in lib.dom.d.ts, so declared here.
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface SpeechErrorEvent { error: string }
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;
declare global {
  interface Window { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
}

/** Append a transcript chunk with sane spacing. */
export function joinTranscript(base: string, chunk: string): string {
  const b = base.trimEnd();
  const c = chunk.trim();
  if (!c) return base;
  return b ? `${b} ${c}` : c;
}

export type UseSpeech = {
  /** Browser has the Web Speech API (Chrome/Edge). */
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
};

/** Live speech-to-text via the browser's built-in Web Speech API — no backend, no deps.
 *  `onTranscript(finalChunk, interim)` streams results: `finalChunk` is newly finalized text
 *  (append it), `interim` is the live unconfirmed tail (display it, don't keep it). */
export function useSpeech(opts: {
  onTranscript: (finalChunk: string, interim: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  lang?: string;
}): UseSpeech {
  const Ctor = typeof window !== "undefined" ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;
  const supported = !!Ctor;
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  // Callbacks live in a ref so recognition handlers never go stale between renders.
  const cbRef = useRef(opts);
  cbRef.current = opts;

  const stop = useCallback(() => { recRef.current?.stop(); }, []);

  const start = useCallback(() => {
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = cbRef.current.lang ?? navigator.language ?? "en-US";
    rec.onresult = (e) => {
      let finalChunk = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalChunk += t;
        else interim += t;
      }
      cbRef.current.onTranscript(finalChunk, interim);
    };
    rec.onerror = (e) => {
      // "no-speech"/"aborted" are routine ends, not failures worth surfacing.
      if (e.error !== "no-speech" && e.error !== "aborted") cbRef.current.onError?.(e.error);
    };
    rec.onend = () => { recRef.current = null; setListening(false); cbRef.current.onEnd?.(); };
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [Ctor]);

  // Kill the mic if the component unmounts mid-dictation.
  useEffect(() => () => { recRef.current?.abort(); }, []);

  return { supported, listening, start, stop };
}
