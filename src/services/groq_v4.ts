// src/services/groq.ts
// Generation pipeline with DeepSeek R1 + Nerdamer verification
// Architecture:
//   Math topics    → DeepSeek R1 generates → Nerdamer verifies → accept/regenerate
//   Logic/RC       → DeepSeek R1 generates → no verification
//   NR/Stats       → Real question bank only
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  verifyQuestion,
  checkConstraintConsistency,
  VERIFIABLE_TOPICS,
  MOCK_ONLY_TOPICS,
  MathExtraction,
} from './mathVerifier';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ─── MODEL CONFIG ─────────────────────────────────────────────────────────────
const MODELS = {
  // Math generation + verification — DeepSeek R1 thinks before answering
  math_primary:     { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'deepseek-r1-distill-llama-70b', key: () => GROQ_API_KEY },
  // Language/RC/CT generation — Kimi K2.5 for better stylistic quality
  language_primary: { url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'moonshotai/kimi-k2-instruct-0905', key: () => NVIDIA_API_KEY },
  language_fallback:{ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', key: () => GROQ_API_KEY },
  // Mistake analysis — Qwen3 thinking mode
  analysis:         { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'qwen/qwen3-32b', key: () => GROQ_API_KEY },
  analysis_fallback:{ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', key: () => GROQ_API_KEY },
  // Chatbot
  chatbot:          { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', key: () => GROQ_API_KEY },
};

// Language/logic topics — no math verification needed
const LANGUAGE_TOPICS = new Set([
  'Critical thinking', 'Reading comprehension',
  'Probability', 'Discrete Mathematics',
]);

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface ChartDataPoint { label: string; value?: number; x?: number; y?: number; }
export interface ChartSeries { name: string; data: ChartDataPoint[]; }
export interface TableData { headers: string[]; rows: string[][]; }
export interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'table';
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  series?: ChartSeries[];
  tableData?: TableData;
}

export interface GeneratedQuestion {
  topic: string;
  subtopic: string;
  question: string;
  options: string[];
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation: string;
  chartData?: ChartData | null;
  source?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  styleAnalysis?: string;
  syllabusAlignment?: string;
  math_extraction?: MathExtraction;
}

export interface MistakeAnalysis {
  analysis: string;
  advice: string;
  recommendations: string[];
}

export interface QuestionRequest {
  topic: string;
  difficulty: string;
}

// ─── ANTI-JEE + FORMATTING FRAMING ────────────────────────────────────────────

const BOCCONI_FRAMING = `CRITICAL — READ BEFORE GENERATING:
This is a Bocconi University entrance test. NOT a competitive exam like JEE.
Bocconi difficulty = familiar structure + evil answer choices + time pressure.
Hard means: easy/medium problem + options engineered to trap specific mistakes.
The correct answer must be solvable in under 2 minutes.

ANSWER OPTION RULES:
- Never round answers. Use exact forms: fractions, surds, log expressions.
- Wrong: 3.14, 2.71, 1.41 — these are rounded approximations.
- Correct: π/2, √2, 2/3, log₂3 — exact forms always.
- Every wrong option must correspond to a specific traceable student mistake.

EXPLANATION FORMAT RULES:
- Always use numbered steps: Step 1: ... Step 2: ...
- Each step on its own line with a blank line between steps.
- Show all working with LaTeX.
- Final line: "Therefore, the answer is [letter]) [value]."
- Never write the explanation as a single paragraph.`;

// ─── CORE API CALL WITH SILENT FALLBACK ───────────────────────────────────────

async function callModel(
  modelChain: (keyof typeof MODELS)[],
  messages: { role: string; content: string }[],
  temperature = 0.6
): Promise<string> {
  for (const modelKey of modelChain) {
    const m = MODELS[modelKey];
    try {
      const res = await fetch(m.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${m.key()}` },
        body: JSON.stringify({ model: m.model, messages, temperature, max_tokens: 4096 }),
      });
      if (res.status === 429 || res.status === 503) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      if (!res.ok) { const e = await res.text(); console.warn(`${modelKey} error: ${e}`); continue; }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) { console.warn(`${modelKey} returned empty content`); continue; }
      return content;
    } catch (e) {
      console.warn(`${modelKey} failed`, e);
    }
  }
  throw new Error('All models in chain failed');
}

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────

async function getTopicProfile(topic: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('topic_profiles')
    .select('generation_fingerprint')
    .eq('topic', topic)
    .single();
  return data?.generation_fingerprint || null;
}

async function getSimilarExamples(topic: string, difficulty: string, count = 3): Promise<GeneratedQuestion[]> {
  if (!supabase) return [];
  let { data } = await supabase
    .from('mock_questions')
    .select('topic, subtopic, question, options, correct_answer, explanation, difficulty')
    .eq('topic', topic)
    .eq('difficulty', difficulty)
    .limit(count);

  if (!data || data.length === 0) {
    const fallback = await supabase
      .from('mock_questions')
      .select('topic, subtopic, question, options, correct_answer, explanation, difficulty')
      .eq('topic', topic)
      .limit(count);
    data = fallback.data;
  }

  return (data || []).map(q => ({
    topic: q.topic, subtopic: q.subtopic, question: q.question,
    options: q.options, correctAnswer: q.correct_answer as 'A'|'B'|'C'|'D'|'E',
    explanation: q.explanation, difficulty: q.difficulty,
  }));
}

async function getMockQuestion(topic: string, difficulty: string, usedQuestions: Set<string>): Promise<GeneratedQuestion | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('mock_questions')
    .select('topic, subtopic, question, options, correct_answer, explanation, difficulty, source')
    .eq('topic', topic)
    .limit(50);

  if (!data || data.length === 0) return null;

  const pool = data.filter(q => !usedQuestions.has(q.question.substring(0, 60)));
  const source = pool.length > 0 ? pool : data;
  const picked = source[Math.floor(Math.random() * source.length)];

  return {
    topic: picked.topic, subtopic: picked.subtopic, question: picked.question,
    options: picked.options, correctAnswer: picked.correct_answer as 'A'|'B'|'C'|'D'|'E',
    explanation: picked.explanation, difficulty: picked.difficulty,
    source: `Mock Test (${picked.source || 'Real'})`,
  };
}

// ─── NORMALISE correctAnswer ───────────────────────────────────────────────────

function normaliseQuestion(q: GeneratedQuestion): GeneratedQuestion {
  let answer = (q.correctAnswer || '').toString().trim().toUpperCase().replace(/[^A-E]/g, '');
  if (!answer || !'ABCDE'.includes(answer)) answer = 'A';

  const options = q.options || [];
  const matchingOption = options.find(o => o.charAt(0).toUpperCase() === answer);
  if (!matchingOption && options.length > 0) {
    answer = options[0]?.charAt(0).toUpperCase() || 'A';
  }

  const normOptions = options.map((o, i) => {
    const letter = String.fromCharCode(65 + i);
    if (/^[A-E][).]\s/.test(o)) return o;
    return `${letter}) ${o.replace(/^[A-E][).:]?\s*/, '').trim()}`;
  });

  return { ...q, correctAnswer: answer as 'A'|'B'|'C'|'D'|'E', options: normOptions };
}

// ─── MATH GENERATION PROMPT (DeepSeek R1) ─────────────────────────────────────

function buildMathPrompt(
  topic: string,
  difficulty: string,
  fingerprint: string,
  examples: GeneratedQuestion[]
): string {
  const examplesText = examples.length > 0
    ? `REAL BOCCONI EXAMPLES — match this style:\n` +
      examples.map((e, i) => `[Example ${i+1} - ${e.difficulty}]\n${e.question.substring(0, 250)}\nCorrect: ${e.correctAnswer}\n`).join('\n')
    : '';

  return `${BOCCONI_FRAMING}

${fingerprint}

${examplesText}

TASK: Generate one ${topic} question at ${difficulty} difficulty.

IMPORTANT: Think through the math BEFORE writing options.
First solve the problem yourself, then engineer options around the correct answer.

Return JSON with this EXACT structure:
{
  "topic": "${topic}",
  "subtopic": "specific subtopic",
  "question": "full question text with LaTeX $...$ for inline math",
  "options": ["A) exact_value", "B) exact_value", "C) exact_value", "D) exact_value", "E) exact_value"],
  "correctAnswer": "A",
  "explanation": "Step 1: ...\\n\\nStep 2: ...\\n\\nTherefore, the answer is A) value.",
  "math_extraction": {
    "equation": "nerdamer-compatible expression e.g. x^2 - 4*x - 5",
    "constraint": "e.g. x > 0  OR empty string if none",
    "variable": "x",
    "operation": "solve",
    "expected_form": "exact"
  }
}

math_extraction rules:
- equation: use * for multiplication, ^ for powers, no LaTeX
- operation: "solve" for equations/inequalities, "arithmetic" for pure calculation, "evaluate" for substitution, "simplify" for simplification
- expected_form: "exact" for surds/fractions, "integer" for counting problems, "decimal_2dp" only if question asks for decimal
- NO markdown, NO code fences — raw JSON only`;
}

// ─── LANGUAGE GENERATION PROMPT (Kimi K2.5) ───────────────────────────────────

function buildLanguagePrompt(
  topic: string,
  difficulty: string,
  fingerprint: string,
  examples: GeneratedQuestion[]
): string {
  const isTFC = topic === 'Critical thinking';
  const examplesText = examples.length > 0
    ? `REAL BOCCONI EXAMPLES:\n` +
      examples.map((e, i) => `[Example ${i+1}]\n${e.question.substring(0, 300)}\nCorrect: ${e.correctAnswer}\n`).join('\n')
    : '';

  return `${fingerprint}

${examplesText}

TASK: Generate one ${topic} question at ${difficulty} difficulty.

Return JSON:
{
  "topic": "${topic}",
  "subtopic": "specific subtopic",
  "question": "full question text",
  "options": ${isTFC ? '["A) True", "B) False", "C) Cannot be deduced from the text"]' : '["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."]'},
  "correctAnswer": "A",
  "explanation": "Step 1: ...\\n\\nStep 2: ...\\n\\nTherefore, the answer is A)."
}

${isTFC ? 'Exactly 3 options only. Cannot be deduced = logically undetermined, not just unmentioned.' : 'Exactly 5 options.'}
correctAnswer is ONLY the letter. Raw JSON, no markdown.`;
}

// ─── PARSE JSON FROM MODEL RESPONSE ───────────────────────────────────────────

function parseJSON<T>(raw: string): T {
  const clean = raw
    .replace(/^```json?\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')  // strip DeepSeek R1 thinking blocks
    .trim();
  return JSON.parse(clean) as T;
}

// ─── GENERATE WITH VERIFICATION (math topics) ─────────────────────────────────

async function generateMathQuestion(
  topic: string,
  difficulty: string,
  fingerprint: string,
  examples: GeneratedQuestion[],
  maxAttempts = 3
): Promise<GeneratedQuestion> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const prompt = buildMathPrompt(topic, difficulty, fingerprint, examples);
      const raw = await callModel(['math_primary'], [{ role: 'user', content: prompt }], 0.5);
      const parsed = parseJSON<GeneratedQuestion>(raw);
      const normed = normaliseQuestion(parsed);

      // Run Nerdamer verification if we have math_extraction
      if (normed.math_extraction && VERIFIABLE_TOPICS.has(topic)) {
        // Gap #2 fix: programmatic constraint consistency check
        const consistency = checkConstraintConsistency(normed.question, normed.math_extraction);
        if (!consistency.consistent) {
          console.warn(`Attempt ${attempt}: Constraint inconsistency — ${consistency.reason}. Regenerating...`);
          continue;
        }

        const result = await verifyQuestion(
          normed.options,
          normed.math_extraction,
          normed.correctAnswer
        );

        if (result.valid && result.correct_answer_letter) {
          // Verification passed — update correctAnswer with verified value
          console.log(`Attempt ${attempt}: Verified. Nerdamer: ${result.nerdamer_solution}, letter: ${result.correct_answer_letter}`);
          return { ...normed, correctAnswer: result.correct_answer_letter as 'A'|'B'|'C'|'D'|'E' };
        } else {
          console.warn(`Attempt ${attempt}: Verification failed — ${result.error}. Regenerating...`);
          // Never return unverified math — loop will regenerate or fall through to bank
        }
      } else {
        // No math_extraction provided — treat as unverifiable, will fall back to bank
        console.warn(`Attempt ${attempt}: No math_extraction in response. Regenerating...`);
      }
    } catch (err) {
      console.error(`Math generation attempt ${attempt} failed:`, err);
      if (attempt === maxAttempts) throw err;
    }
  }
  // All attempts exhausted — fall back to real question bank (never return unverified math)
  console.warn(`All ${maxAttempts} verification attempts failed for ${topic}. Falling back to question bank.`);
  if (supabase) {
    const bankQ = await getMockQuestion(topic, difficulty, new Set());
    if (bankQ) return { ...bankQ, source: `Mock Test (verification fallback)` };
  }
  throw new Error(`Failed to generate verified ${topic} question and no bank fallback available`);
}

// ─── MAIN: GENERATE QUESTIONS ─────────────────────────────────────────────────

export async function generateQuestions(requests: QuestionRequest[]): Promise<GeneratedQuestion[]> {
  const results: GeneratedQuestion[] = [];
  const usedQuestions = new Set<string>();

  for (const request of requests) {
    const { topic, difficulty } = request;

    // NR and Statistics: always use real question bank
    if (MOCK_ONLY_TOPICS.has(topic)) {
      const mockQ = await getMockQuestion(topic, difficulty, usedQuestions);
      if (mockQ) {
        usedQuestions.add(mockQ.question.substring(0, 60));
        results.push(mockQ);
      }
      continue;
    }

    // Fetch profile and examples for all AI-generated topics
    const [fingerprint, examples] = await Promise.all([
      getTopicProfile(topic),
      getSimilarExamples(topic, difficulty),
    ]);
    const fp = fingerprint || `Generate authentic Bocconi ${topic} questions.`;

    if (LANGUAGE_TOPICS.has(topic)) {
      // RC and CT: use Kimi K2.5 with language prompt, no math verification
      try {
        const prompt = buildLanguagePrompt(topic, difficulty, fp, examples);
        const raw = await callModel(
          ['language_primary', 'language_fallback'],
          [{ role: 'user', content: prompt }],
          0.7
        );
        const parsed = parseJSON<GeneratedQuestion>(raw);
        results.push(normaliseQuestion(parsed));
      } catch (err) {
        console.error(`Language generation failed for ${topic}:`, err);
      }
    } else {
      // All math topics: DeepSeek R1 + Nerdamer verification
      try {
        const q = await generateMathQuestion(topic, difficulty, fp, examples);
        results.push(q);
      } catch (err) {
        console.error(`Math generation failed for ${topic}:`, err);
      }
    }
  }

  return results;
}

// ─── MISTAKE ANALYSIS ─────────────────────────────────────────────────────────

export async function analyzeMistake(
  question: string,
  correctAnswer: string,
  userAnswer: string,
  topic: string,
  subtopic: string,
  timeTaken: number
): Promise<MistakeAnalysis> {
  const expectedTimes: Record<string, number> = {
    'Reading comprehension': 75, 'Critical thinking': 70, 'Numerical reasoning': 90,
    'Algebra': 95, 'Problem solving': 110, 'Probability': 95, 'Functions': 100,
    'Analytical Geometry': 105, 'Logarithms/Exponentials': 95, 'Sets': 75,
    'Statistics': 85, 'Numbers': 80, 'Plane Geometry': 90, 'Discrete Mathematics': 90, 'Trigonometry': 100,
  };
  const expected = expectedTimes[topic] ?? 90;
  const timeFlag =
    timeTaken > expected * 1.4 ? `Took ${timeTaken}s — over ~${expected}s target.`
    : timeTaken < expected * 0.5 ? `Answered in ${timeTaken}s — possibly rushed.`
    : `Time (${timeTaken}s) within normal range (~${expected}s).`;

  const prompt = `You are an expert Bocconi entrance test tutor.

Topic: ${topic} / ${subtopic}
Question: ${question}
Correct answer: ${correctAnswer}
Student selected: ${userAnswer}
Time: ${timeFlag}

Return JSON only:
{
  "analysis": "exact conceptual or procedural error — be specific",
  "advice": "concrete technique to prevent this exact mistake",
  "recommendations": ["specific resource 1", "specific resource 2"]
}`;

  try {
    const raw = await callModel(['analysis', 'analysis_fallback'], [{ role: 'user', content: prompt }], 0.3);
    return parseJSON<MistakeAnalysis>(raw);
  } catch (err) {
    return {
      analysis: 'Analysis unavailable.',
      advice: 'Review the explanation above carefully.',
      recommendations: ['Practice similar questions', 'Review the relevant concept'],
    };
  }
}

// ─── CHATBOT ──────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> {
  const SYSTEM = `You are an elite tutor for the Bocconi Undergraduate Entrance Test.
Explain mistakes with surgical precision. Use markdown for structure.
Use LaTeX for math: $...$ inline, $$...$$ for display. Be direct and academic.`;

  const messages = [
    { role: 'system', content: SYSTEM },
    ...history.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
  ];

  return callModel(['chatbot'], messages, 0.7);
}
