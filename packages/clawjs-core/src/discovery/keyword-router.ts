import data from "./keyword-router.json" with { type: "json" };

export const KEYWORD_ROUTER_SCHEMA_VERSION = 1;

export interface KeywordRouterConcept {
  id: string;
  keywords: string[];
  primaryCommand: string;
  summary: string;
  useWhen: string;
  exampleInvocation: string;
  relatedConcepts: string[];
  antiPattern: string;
  family: string;
}

export interface KeywordRouterDocument {
  schemaVersion: number;
  summary: string;
  concepts: KeywordRouterConcept[];
}

const DOCUMENT = data as KeywordRouterDocument;

if (DOCUMENT.schemaVersion !== KEYWORD_ROUTER_SCHEMA_VERSION) {
  throw new Error(
    `Unsupported keyword-router schemaVersion ${DOCUMENT.schemaVersion}; expected ${KEYWORD_ROUTER_SCHEMA_VERSION}.`,
  );
}

export function loadKeywordRouter(): KeywordRouterDocument {
  return DOCUMENT;
}

export function listKeywordRouterConcepts(): KeywordRouterConcept[] {
  return DOCUMENT.concepts;
}

export function findKeywordRouterConcept(id: string): KeywordRouterConcept | undefined {
  return DOCUMENT.concepts.find((concept) => concept.id === id);
}

export function findKeywordRouterConceptByCommand(commandName: string): KeywordRouterConcept | undefined {
  return DOCUMENT.concepts.find((concept) => concept.primaryCommand === commandName);
}

export interface KeywordRouterMatch {
  concept: KeywordRouterConcept;
  score: number;
  matchedKeywords: string[];
  matchedInputs: string[];
}

const DIACRITIC_PATTERN = /[̀-ͯ]/g;

export function normalizeKeyword(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(DIACRITIC_PATTERN, "")
    .toLowerCase()
    .trim();
}

function scoreKeywordPair(input: string, keyword: string): number {
  const normInput = normalizeKeyword(input);
  const normKeyword = normalizeKeyword(keyword);
  if (!normInput || !normKeyword) return 0;
  if (normInput === normKeyword) return 100;
  if (normInput.length >= 3 && normKeyword.startsWith(normInput)) return 70;
  if (normKeyword.length >= 3 && normInput.startsWith(normKeyword)) return 65;
  if (normInput.length >= 4 && normKeyword.includes(normInput)) return 50;
  if (normKeyword.length >= 4 && normInput.includes(normKeyword)) return 45;
  return 0;
}

function scoreConceptAgainstInputs(concept: KeywordRouterConcept, inputs: string[]): {
  score: number;
  matchedKeywords: string[];
  matchedInputs: string[];
} {
  let score = 0;
  const matchedKeywordSet = new Set<string>();
  const matchedInputSet = new Set<string>();
  for (const input of inputs) {
    let bestForInput = 0;
    let bestKeyword: string | null = null;
    for (const keyword of concept.keywords) {
      const pair = scoreKeywordPair(input, keyword);
      if (pair > bestForInput) {
        bestForInput = pair;
        bestKeyword = keyword;
      }
    }
    if (bestForInput > 0 && bestKeyword) {
      score += bestForInput;
      matchedKeywordSet.add(bestKeyword);
      matchedInputSet.add(input);
    }
  }
  if (matchedInputSet.size > 1) {
    score += (matchedInputSet.size - 1) * 25;
  }
  return {
    score,
    matchedKeywords: Array.from(matchedKeywordSet),
    matchedInputs: Array.from(matchedInputSet),
  };
}

export interface RouteKeywordsOptions {
  limit?: number;
  minScore?: number;
}

export function routeKeywords(inputs: string[], options: RouteKeywordsOptions = {}): KeywordRouterMatch[] {
  const cleanInputs = inputs.map((value) => normalizeKeyword(value)).filter((value) => value.length > 0);
  if (cleanInputs.length === 0) return [];
  const limit = options.limit ?? 6;
  const minScore = options.minScore ?? 1;
  const matches: KeywordRouterMatch[] = [];
  for (const concept of DOCUMENT.concepts) {
    const scored = scoreConceptAgainstInputs(concept, cleanInputs);
    if (scored.score >= minScore) {
      matches.push({
        concept,
        score: scored.score,
        matchedKeywords: scored.matchedKeywords,
        matchedInputs: scored.matchedInputs,
      });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.concept.id.localeCompare(b.concept.id));
  return matches.slice(0, limit);
}

export interface KeywordRouterSuggestion {
  conceptId: string;
  primaryCommand: string;
  summary: string;
  useWhen: string;
  exampleInvocation: string;
  score: number;
}

export function relatedKeywordSuggestions(phrase: string, options: { limit?: number } = {}): KeywordRouterSuggestion[] {
  const tokens = phrase.split(/[\s,/_.-]+/).filter((token) => token.length > 0);
  const matches = routeKeywords(tokens.length > 0 ? tokens : [phrase], { limit: options.limit ?? 3 });
  return matches.map((match) => ({
    conceptId: match.concept.id,
    primaryCommand: match.concept.primaryCommand,
    summary: match.concept.summary,
    useWhen: match.concept.useWhen,
    exampleInvocation: match.concept.exampleInvocation,
    score: match.score,
  }));
}

export function listKeywordRouterCommands(): string[] {
  return Array.from(new Set(DOCUMENT.concepts.map((concept) => concept.primaryCommand))).sort();
}
