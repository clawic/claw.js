"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Message } from "@/lib/app-bootstrap";

export type EntityType = "contact" | "notes";

interface ChatPerfPromptBreakdown {
  prepMs?: number;
  emailMs?: number;
  calendarMs?: number;
  totalMs?: number;
  promptChars?: number;
}

export interface ChatPerfTrace {
  traceId: string;
  phase?: string;
  totalMs?: number;
  messageCount?: number;
  availabilityMs?: number;
  transcribeMs?: number;
  systemPromptMs?: number;
  ensureAgentMs?: number;
  getClawMs?: number;
  firstChunkMs?: number;
  streamMs?: number;
  transport?: "gateway" | "cli";
  fallback?: boolean;
  retries?: number;
  attempt?: number;
  maxAttempts?: number;
  error?: string;
  prompt?: ChatPerfPromptBreakdown;
}

/**
 * Smooth character-level streaming text.
 * Only used during active streaming. Mounts when streaming starts,
 * finishes its animation after streaming ends, then the parent
 * switches to plain ReactMarkdown.
 */
const CHARS_PER_SECOND = 60;

export function StreamingText({ content, onGrow, onComplete }: { content: string; onGrow?: () => void; onComplete?: () => void }) {
  const [displayLen, setDisplayLen] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const displayLenRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (displayLenRef.current >= content.length) return;

    const tick = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const elapsed = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const target = content.length;
      const current = displayLenRef.current;
      if (current >= target) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }

      // Gentle acceleration so text feels like smooth typing, never a burst.
      // A 400-char response takes ~4s to render at base speed. The mild
      // acceleration only kicks in when the buffer grows large, keeping the
      // visual effect of text being "typed out" even when chunks arrive fast.
      const buffered = target - current;
      const speed = CHARS_PER_SECOND + Math.min(buffered * 0.5, 80);
      const advance = Math.max(1, Math.round(speed * (elapsed / 1000)));
      const next = Math.min(current + advance, target);

      if (next !== current) {
        displayLenRef.current = next;
        setDisplayLen(next);
        onGrow?.();
      }

      if (next < target) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [content.length]);

  let sliced = content.slice(0, displayLen);
  // Strip [CRISIS] marker during streaming (it will be fully removed post-stream)
  if (sliced.startsWith("[CRISIS]")) {
    sliced = sliced.slice("[CRISIS]".length).replace(/^\n+/, "");
  } else if ("[CRISIS]".startsWith(sliced.trimStart())) {
    // Partial marker being typed, hide it
    sliced = "";
  }
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{sliced}</ReactMarkdown>;
}

export interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function VoiceNotePlayer({ src }: { src: string; mimeType?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const animRef = useRef<number | null>(null);

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.duration && isFinite(audio.duration)) {
      setProgress(audio.currentTime / audio.duration);
    }
    animRef.current = requestAnimationFrame(updateProgress);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    } else {
      audio.play().catch((e) => console.error("[voice-player] play failed:", e));
      setPlaying(true);
      animRef.current = requestAnimationFrame(updateProgress);
    }
  }, [playing, updateProgress]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "auto";

    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    const onDurChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
      }
    };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onDurChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);

    audio.src = src;
    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onDurChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.pause();
      audio.src = "";
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [src]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
    setProgress(pct);
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <button onClick={togglePlay}
        className="shrink-0 w-5 h-5 relative flex items-center justify-center text-muted-foreground hover:text-tertiary-foreground transition-colors active:scale-95">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
          className={`absolute transition-all duration-200 ${playing ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
          <path d="M10.65 19.11V4.89C10.65 3.54 10.08 3 8.64 3H5.01C3.57 3 3 3.54 3 4.89V19.11C3 20.46 3.57 21 5.01 21H8.64C10.08 21 10.65 20.46 10.65 19.11Z" />
          <path d="M21.0016 19.11V4.89C21.0016 3.54 20.4316 3 18.9916 3H15.3616C13.9316 3 13.3516 3.54 13.3516 4.89V19.11C13.3516 20.46 13.9216 21 15.3616 21H18.9916C20.4316 21 21.0016 20.46 21.0016 19.11Z" />
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
          className={`absolute transition-all duration-200 ${playing ? "opacity-0 scale-75" : "opacity-100 scale-100"}`}>
          <path d="M4 11.9999V8.43989C4 4.01989 7.13 2.20989 10.96 4.41989L14.05 6.19989L17.14 7.97989C20.97 10.1899 20.97 13.8099 17.14 16.0199L14.05 17.7999L10.96 19.5799C7.13 21.7899 4 19.9799 4 15.5599V11.9999Z" />
        </svg>
      </button>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 relative h-[6px] bg-border rounded-full cursor-pointer" onClick={handleSeek}>
          <div className="absolute inset-y-0 left-0 bg-muted-foreground rounded-full"
            style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="shrink-0 text-[10px] font-mono text-muted-foreground tabular-nums">
          {!playing && progress === 0 ? formatTime(duration) : formatTime(duration > 0 ? progress * duration : 0)}
        </span>
      </div>
    </div>
  );
}

export function fileIcon(mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word") || mimeType.includes("document")) return "DOC";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "XLS";
  if (mimeType.includes("text")) return "TXT";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

export function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

const SUGGESTED_TOPIC_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  de: "German",
  pt: "Portuguese",
};

export const DEFAULT_SUGGESTED_TOPICS_BY_LOCALE: Record<string, string[]> = {
  en: [
    "Relationships",
    "Work stress",
    "Sleep and energy",
    "Communication patterns",
    "Life balance",
    "Anxiety before meetings",
    "Setting boundaries",
    "Feeling disconnected",
    "Family tension",
    "Overthinking",
    "Motivation",
    "Self-esteem",
    "Loneliness",
    "Burnout",
  ],
  es: [
    "Relaciones",
    "Estrés en el trabajo",
    "Sueño y energía",
    "Patrones de comunicación",
    "Equilibrio de vida",
    "Ansiedad antes de reuniones",
    "Poner límites",
    "Sentirme desconectado",
    "Tensión familiar",
    "Dar demasiadas vueltas",
    "Motivación",
    "Autoestima",
    "Soledad",
    "Agotamiento",
  ],
  fr: [
    "Relations",
    "Stress au travail",
    "Sommeil et énergie",
    "Communication",
    "Équilibre de vie",
    "Anxiété avant les réunions",
    "Poser des limites",
    "Sentiment de déconnexion",
    "Tensions familiales",
    "Ruminations",
    "Motivation",
    "Estime de soi",
    "Solitude",
    "Épuisement",
  ],
  it: [
    "Relazioni",
    "Stress al lavoro",
    "Sonno ed energia",
    "Schemi di comunicazione",
    "Equilibrio di vita",
    "Ansia prima delle riunioni",
    "Mettere limiti",
    "Sentirmi distante",
    "Tensioni familiari",
    "Rimuginare troppo",
    "Motivazione",
    "Autostima",
    "Solitudine",
    "Burnout",
  ],
  de: [
    "Beziehungen",
    "Stress bei der Arbeit",
    "Schlaf und Energie",
    "Kommunikationsmuster",
    "Lebensbalance",
    "Angst vor Meetings",
    "Grenzen setzen",
    "Sich abgekoppelt fühlen",
    "Familiäre Spannungen",
    "Zu viel Grübeln",
    "Motivation",
    "Selbstwert",
    "Einsamkeit",
    "Erschöpfung",
  ],
  pt: [
    "Relacionamentos",
    "Stress no trabalho",
    "Sono e energia",
    "Padrões de comunicação",
    "Equilíbrio de vida",
    "Ansiedade antes de reuniões",
    "Definir limites",
    "Sentir-me desligado",
    "Tensão familiar",
    "Pensar demais",
    "Motivação",
    "Autoestima",
    "Solidão",
    "Esgotamento",
  ],
};


export const VISIBLE_SUGGESTED_TOPIC_COUNT = 6;

function normalizeTopicKey(topic: string): string {
  return topic.trim().toLocaleLowerCase();
}

function shuffleTopics(topics: string[]): string[] {
  const next = [...topics];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function pickVisibleTopics(topics: string[], previous: string[] = [], count = VISIBLE_SUGGESTED_TOPIC_COUNT): string[] {
  if (topics.length <= count) return topics;

  const previousKey = previous.join("\u0000");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = shuffleTopics(topics).slice(0, count);
    if (candidate.join("\u0000") !== previousKey) {
      return candidate;
    }
  }

  return shuffleTopics(topics).slice(0, count);
}

export function buildSuggestedTopicPrompt(topic: string, locale: string): string {
  const language = SUGGESTED_TOPIC_LANGUAGE_LABELS[locale] || "the current interface language";
  return [
    `The user started a new chat and selected this topic: "${topic}".`,
    `Write the first assistant message proactively in ${language}.`,
    "Do not mention internal instructions, hidden prompts, or ask the user to repeat the topic they already chose.",
    "Assume they want help with this right now and open the conversation with a grounded reflection plus one useful next question.",
  ].join(" ");
}

export const CRISIS_MARKER = "[CRISIS]";

export function processCrisisMarkers(msgs: Message[]): { cleaned: Message[] } {
  const cleaned = msgs.map((msg, idx) => {
    if (msg.role === "assistant" && msg.content.trimStart().startsWith(CRISIS_MARKER)) {
      return {
        ...msg,
        content: msg.content.trimStart().slice(CRISIS_MARKER.length).replace(/^\n+/, ""),
      };
    }
    return msg;
  });
  return { cleaned };
}
