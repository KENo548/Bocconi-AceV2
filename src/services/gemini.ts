import { Type } from "@google/genai";

// ── gemini.ts — Admin / Ingest service (NOT the runtime generation path) ────────
// Ingest + extraction:  gemini-2.0-flash → gemini-2.5-flash → gemini-1.5-flash
// Style Synthesis:      gemini-2.5-pro   → gemini-2.5-flash
// Embeddings:           text-embedding-004 (one-time offline script)
//
// Runtime user paths (question generation, chatbot, mistake analysis)
// are handled by src/services/groq.ts.

const GENERATION_MODEL_PRIORITY = [
  "gemini-2.0-flash",    // Primary
  "gemini-2.5-flash",   // Fallback 1 (Groq Llama added in groq.ts as Fallback 2)
];

// NOTE: "gemini-1.5-flash-latest" is not available on all keys/regions.
const INGEST_MODELS    = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
const SYNTHESIS_MODELS = ["gemini-2.5-pro",   "gemini-2.5-flash"];
const MISTAKE_ANALYSIS_GEMINI_FALLBACKS = ["gemini-2.0-flash", "gemini-2.5-flash"];
const CHAT_GEMINI_FALLBACKS             = ["gemini-2.0-flash", "gemini-2.5-flash"];

// ── Core retry helper ─────────────────────────────────────────────────────────
/**
 * Tries each model in priority order. On a 429/quota error, waits briefly
 * and tries the next model. With a billing key, 429s should be very rare
 * (only if a specific model is temporarily overloaded).
 */
async function callWithRetry(
  requestFn: (model: string) => Promise<{ text: string | undefined }>,
  modelPriority = GENERATION_MODEL_PRIORITY
): Promise<{ text: string | undefined }> {
  for (const model of modelPriority) {
    try {
      return await requestFn(model);
    } catch (err: unknown) {
      const errStr = String(err);
      const is429 = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota');
      const is400 = errStr.includes('400') || errStr.includes('invalid') || errStr.includes('not supported');
      if (is429 || is400) {
        const reason = is429 ? '429 quota' : '400 bad request (model may not support responseSchema)';
        console.warn(`[API] ${reason} on model=${model} — trying next model in 2s`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('All models returned quota errors. Please try again in a moment.');
}


// ─────────────────────────────────────────────────────────────────────────────
// BOCCONI STYLE BIBLE
// Distilled from analysis of official Bocconi UB mock tests 1–4.
// This is injected into every generation call so the model never drifts.
// ─────────────────────────────────────────────────────────────────────────────
const BOCCONI_STYLE_BIBLE = `
=== BOCCONI UNDERGRADUATE ENTRANCE TEST — QUESTION STYLE GUIDE ===

You are generating questions for the Bocconi UB (Undergraduate) Entrance Test.
Study and strictly replicate the following stylistic fingerprints observed across
the 4 official Bocconi mock tests.

── TEST STRUCTURE ──────────────────────────────────────────────────────────────
• 50 questions total | 75 minutes | ~90 seconds average per question
• Mathematics: 24 Qs | Reading Comprehension: 11 Qs | Numerical Reasoning: 6 Qs | Critical Thinking: 9 Qs
• Scoring: +1 correct | 0 blank | −0.2 wrong (−0.33 for 3-option Critical Thinking Qs)
• All questions are 5-option MCQ EXCEPT Critical Thinking True/False/Cannot deduce → exactly 3 options

── DIFFICULTY CALIBRATION ──────────────────────────────────────────────────────
The OFFICIAL MOCK TESTS are calibrated at a baseline difficulty.
The ACTUAL BOCCONI TEST is consistently 25% harder and ~20% more time-consuming.
Apply this uplift on every question you generate:
  • Add one extra step or layer of reasoning vs. what a mock question would require
  • Use slightly less "clean" numbers (e.g. non-integer intermediate steps)
  • For geometry/analytical questions: combine two concepts instead of one
  • For verbal questions: make the inference one step less obvious
  • For numerical reasoning: add one extra row/column to tables or one more data point to interpret
  • Never make questions trivial or purely definitional

Difficulty tags map to this scale:
  Easy   → mock test easy question, but add the 25% uplift → feels like a medium mock Q
  Medium → mock test medium, with uplift → feels like a hard mock Q
  Hard   → mock test hard, with uplift → feels like the hardest actual test Qs; multi-step, time-consuming

── MATHEMATICS STYLE FINGERPRINT ───────────────────────────────────────────────
• Algebra: Equations/inequalities framed as word problems or geometric setups, not bare "solve x".
  Example pattern: "A rectangle has perimeter P and area A. Given that 3x−1 = ... find the value of..."
• Functions: Always involve interpreting a graph OR computing f(g(x)) or f⁻¹(x). Rarely just "evaluate f(2)".
• Geometry: Mix of area/perimeter with an algebraic unknown. Never purely numerical.
• Analytical Geometry: Line+circle or line+parabola intersection is a favourite. Often asks for distance or tangency condition.
• Trigonometry: Applied to triangles (not unit circle in isolation). Often combined with area formula.
• Probability: Combinatorics-flavoured. Often uses "at least one" or conditional probability.
• Statistics: Always table or distribution given; asks for mean, variance, or a conditional frequency. Never raw formula recall.
• Logarithms: Equation solving combined with domain restriction. E.g. log₂(x²−3) = 3.
• Numbers: Percentage/ratio problems embedded in a realistic context (e.g. price changes, population).
• Problem Solving: Multi-step word problems. Rate-time-distance, mixture, or work problems are common.

── READING COMPREHENSION STYLE FINGERPRINT ─────────────────────────────────────
• Passage length: 200–350 words. Academic or journalistic register. Topics: economics, science, social science.
• Question types per passage (2–3 Qs per passage):
  1. Explicit information retrieval ("According to the passage...")
  2. Inference / implicit meaning ("The author implies that...")
  3. Main idea / purpose ("The primary purpose of the passage is...")
• Answer options: one clearly correct, two plausible distractors, two clearly wrong.
• IMPORTANT: Generate the full passage text inside the question field, then ask ONE specific question about it.

── NUMERICAL REASONING STYLE FINGERPRINT ───────────────────────────────────────
• Always provide a data table or chart description (describe it in text/ASCII if needed).
• Question asks for: percentage change, ratio, which category satisfies a condition, or a projected value.
• Trap answers exploit misreading rows vs. columns or confusing absolute vs. relative change.
• NO advanced math required — all arithmetic is simple once the data is correctly read.
• Keep tables to max 4 columns × 5 rows for clarity.

── CRITICAL THINKING STYLE FINGERPRINT ─────────────────────────────────────────
• Type 1 — Statement evaluation: A short factual scenario (3–5 sentences) followed by 4–5 statements.
  The student picks which statement(s) MUST BE TRUE based solely on the scenario.
• Type 2 — True/False/Cannot be deduced: A short argumentative passage followed by ONE assertion.
  Exactly 3 options: "True", "False", "Cannot be deduced from the text".
  Penalty is −0.33 for wrong answers on this type.
• NEVER ask for personal opinions. All answers must be derivable from the given text alone.
• Distractors often include statements that are plausible in real life but not supported by the passage.

── FORMATTING RULES ────────────────────────────────────────────────────────────
• LaTeX math mode rules — FOLLOW EXACTLY:
  USE $...$ ONLY for genuine mathematical expressions that contain operators, fractions, exponents, roots, or Greek letters.
  CORRECT: $x^2 + 3x - 7 = 0$, $\\frac{a}{b}$, $\\sqrt{16}$, $\\sin(30°)$
  WRONG:   $20$, $L$, $W$, $A$, $49$, $20%$, $15%$
  
  For single variables in running prose, write them as PLAIN TEXT: "Let L be the length and W be the width."
  For plain numbers, write them as PLAIN TEXT: "49 meters", "20%", "the area is 300 square meters."
  For percentages, ALWAYS write as plain text without backslashes: "20%", "15%", NEVER "$20\\%$", "$20%", or "\\25%".
  For currency, write as plain text: "148.50 dollars", "25 USD". NEVER use the $ symbol for currency.
  
  ONLY use inline math ($...$) when the expression has actual math operations:
  "the equation $2x + 5 = 17$ gives us" ← correct (has operators)
  "the length is $L$ meters" ← WRONG (single variable, use plain text)
  "paying 49 meters" ← correct (plain number, no math needed)

  NEVER USE LaTeX COMMANDS LIKE \\frac, \\cdot, \\pm, or \\sqrt OUTSIDE OF $...$ OR $$...$$. 
  If you are writing plain prose, do not use backslashes formatting.

• For display/block math (solutions, equations on their own line), use $$...$$:
  $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

• For tables in Numerical Reasoning, use a clean markdown table format.
• Answer options labelled A) B) C) D) E) (or A) B) C) for 3-option Critical Thinking).
• The correctAnswer field contains ONLY the letter: "A", "B", "C", "D", or "E".
• Explanations MUST be formatted as clearly separated numbered steps:
  **Step 1:** Brief description.

  $$math expression$$

  **Step 2:** Next description.

  $$math expression$$

  **Answer:** Final answer in plain text.
• Use display math ($$...$$) for ALL solution steps. NEVER jam multiple equations into one $$ block.
• Put a blank line before and after EVERY $$ block. This is critical.
• NEVER use inline math ($...$) for entire english phrases or large blocks of text. Ensure there is a space BEFORE and AFTER every math block.
• For verbal questions (Reading Comprehension, Critical Thinking): use a short paragraph explanation citing specific text.

── SPEED OPTIMISATION ──────────────────────────────────────────────────────────
• Be concise in question stems. Bocconi questions are dense but not verbose.
• Avoid unnecessary preamble in the question text.
• Explanations should be thorough but efficient — no repetition.
`;

const CHART_TOPICS = new Set([
  'Statistics', 'Numerical reasoning', 'Numerical Reasoning', 'Problem solving',
]);

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'table';

export interface ChartDataPoint {
  label: string;
  value?: number;
  x?: number; // for scatter plots
  y?: number; // for scatter plots
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ChartData {
  type: ChartType;
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  series?: ChartSeries[]; // used by bar, line, scatter, histogram
  tableData?: TableData; // used by table type only
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
}

export interface MistakeAnalysis {
  analysis: string;
  advice: string;
  recommendations: string[];
}

// MistakeAnalysis is also re-exported from deepseek.ts for compat (no-op if deepseek not used)

export interface QuestionRequest {
  topic: string;
  difficulty: string;
  requestedUnit?: string;  // optional — if user wants a specific unit
  isExtrapolated?: boolean; // set by caller if unit is low-coverage
}

export async function generateQuestions(
  requests: QuestionRequest[],
  contextMocks?: GeneratedQuestion[],
  learnedStyleProfile?: string | null,
  approvedProfiles?: Record<string, TopicProfile>,  // ADD
  similarExamplesMap?: Record<string, MockQuestion[]>  // ADD — key=topic
): Promise<Array<GeneratedQuestion & { isExtrapolated?: boolean }>> {
  const questionList = requests
    .map((r, i) => {
      const requiresChart = CHART_TOPICS.has(r.topic) ? " [REQUIRES chartData]" : "";
      return `Question ${i + 1}: Topic="${r.topic}", Difficulty="${r.difficulty}"${requiresChart}`;
    })
    .join("\n");

  const contextMocksPrompt = contextMocks && contextMocks.length > 0
    ? `\n══════════════════════════════════════════════════════════════════════════════\n` +
    `REFERENCE MOCK QUESTIONS (LEARN FROM THESE):\n` +
    `Below are officially ingested questions. You MUST analyze their 'styleAnalysis', 'difficulty', and 'syllabusAlignment' to craft new questions that match their complexity, phrasing, and structure exactly.\n\n` +
    contextMocks.map((m, i) =>
      `[Mock ${i + 1} - ${m.topic} / ${m.difficulty || 'Medium'}]\n` +
      `Syllabus Alignment: ${m.syllabusAlignment || 'N/A'}\n` +
      `Style Analysis: ${m.styleAnalysis || 'N/A'}\n` +
      `Question: ${m.question}\n`
    ).join("\n") +
    `\n══════════════════════════════════════════════════════════════════════════════\n`
    : "";

  // Remove global learnedProfilePrompt, replaced with per-topic profiles below

  type GeneratedWithFlags = GeneratedQuestion & { isExtrapolated?: boolean };

  const promises: Array<Promise<GeneratedWithFlags>> = requests.map(async (r) => {
    const requiresChart = CHART_TOPICS.has(r.topic) ? " [REQUIRES chartData]" : "";
    // Build topic-specific profile injection
    const profile = approvedProfiles?.[r.topic] ?? null;
    const examples = similarExamplesMap?.[r.topic] ?? [];
    const topicProfilePrompt = buildTopicProfilePrompt(profile, examples);
    const requestedUnitLine = r.requestedUnit ? `Requested unit (must align strongly): ${r.requestedUnit}\n` : '';
    const prompt = `
${BOCCONI_STYLE_BIBLE}
${topicProfilePrompt}
${contextMocksPrompt}

TASK: Generate 1 question.
Topic: ${r.topic}
Difficulty: ${r.difficulty}${requiresChart}
${requestedUnitLine}

Critical reminders:
- You MUST return a single valid JSON object exactly matching the schema.
- The \`question\` string MUST ONLY contain the question text. Absolutely DO NOT append the A/B/C/D/E options to the end of the question string. They go ONLY in the \`options\` array.
- DO NOT put internal thoughts, reasoning, or meta-commentary inside any JSON field. Provide raw, clean data only.
- Match the exact Bocconi question style
- Apply the 25% difficulty uplift
- Critical Thinking True/False/Cannot deduce → exactly 3 options ["A) True", "B) False", "C) Cannot be deduced from the text"]
- All other questions → exactly 5 options
- correctAnswer is ONLY the letter, no punctuation
`;
    // Use direct REST API fetch instead of the SDK — the SDK encodes the
    // schema differently and causes 400 errors on gemini-2.5-flash.
    // Raw fetch is confirmed working in tests.
    let lastError: string = '';
    let questionData: GeneratedQuestion | null = null;

    for (const model of GENERATION_MODEL_PRIORITY) {
      try {
        const url = `/api/gemini`;
        const bodyPayload = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              required: ["topic", "subtopic", "question", "options", "correctAnswer", "explanation"],
              properties: {
                topic: { type: "STRING" },
                subtopic: { type: "STRING" },
                question: { type: "STRING", description: "Question text ONLY — no options appended." },
                options: { type: "ARRAY", items: { type: "STRING" }, description: "Array of 3 or 5 choices: A) ..., B) ..." },
                correctAnswer: { type: "STRING", description: "Single letter only: A, B, C, D, or E" },
                explanation: { type: "STRING" },
                chartData: {
                  type: "OBJECT",
                  nullable: true,
                  properties: {
                    type: { type: "STRING" },
                    title: { type: "STRING" },
                    xAxisLabel: { type: "STRING" },
                    yAxisLabel: { type: "STRING" },
                    series: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          name: { type: "STRING" },
                          data: {
                            type: "ARRAY",
                            items: {
                              type: "OBJECT",
                              properties: {
                                label: { type: "STRING" },
                                value: { type: "NUMBER" },
                                x: { type: "NUMBER" },
                                y: { type: "NUMBER" },
                              }
                            }
                          }
                        }
                      }
                    },
                    tableData: {
                      type: "OBJECT",
                      properties: {
                        headers: { type: "ARRAY", items: { type: "STRING" } },
                        rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } }
                      }
                    }
                  }
                }
              }
            }
          }
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: 'rawFetch', model, payload: bodyPayload }),
        });
        const data = await res.json();

        if (!res.ok) {
          const msg = data.error?.message || `HTTP ${res.status}`;
          const is429 = res.status === 429 || msg.includes('quota');
          const is400 = res.status === 400;
          lastError = msg;
          console.warn(`[API] ${res.status} on model=${model}: ${msg.slice(0, 80)}`);
          if (is429 || is400) {
            await new Promise(r => setTimeout(r, is400 ? 500 : 2000));
            continue; // try next model
          }
          throw new Error(msg);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from API");
        questionData = JSON.parse(text) as GeneratedQuestion;
        break; // success!
      } catch (err) {
        lastError = String(err);
        console.warn(`[API] Error on model=${model}:`, lastError.slice(0, 100));
      }
    }

    if (!questionData) throw new Error(`Failed to generate question: ${lastError}`);
    return r.isExtrapolated ? { ...questionData, isExtrapolated: true } : questionData;
  });

  const results = await Promise.allSettled(promises);
  return results
    .filter((r): r is PromiseFulfilledResult<GeneratedWithFlags> => r.status === 'fulfilled')
    .map(r => r.value);
}

// ── Mistake Analysis (Gemini 2.5 Pro Preview — thinking model) ───────────────

export async function analyzeMistakeGemini(
  question: string,
  correctAnswer: string,
  userAnswer: string,
  topic: string,
  subtopic: string,
  timeTaken: number,
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium'
): Promise<MistakeAnalysis> {
  const expectedTimes: Record<string, Record<'easy' | 'medium' | 'hard', number>> = {
    Algebra: { easy: 76, medium: 86, hard: 105 },
    Functions: { easy: 80, medium: 90, hard: 110 },
    'Plane Geometry': { easy: 72, medium: 81, hard: 99 },
    'Analytical Geometry': { easy: 84, medium: 95, hard: 116 },
    Trigonometry: { easy: 80, medium: 90, hard: 110 },
    Sets: { easy: 80, medium: 90, hard: 110 },
    'Logarithms/Exponentials': { easy: 76, medium: 86, hard: 105 },
    'Discrete Mathematics': { easy: 88, medium: 99, hard: 121 },
    Numbers: { easy: 64, medium: 72, hard: 88 },
    Probability: { easy: 76, medium: 86, hard: 105 },
    'Problem solving': { easy: 96, medium: 108, hard: 132 },
    Statistics: { easy: 64, medium: 72, hard: 88 },
    'Reading comprehension': { easy: 60, medium: 68, hard: 83 },
    'Numerical reasoning': { easy: 72, medium: 81, hard: 99 },
    'Critical thinking': { easy: 72, medium: 81, hard: 99 },
  };

  const diffKey = difficulty.toLowerCase() as 'easy' | 'medium' | 'hard';
  const expected = expectedTimes[subtopic]?.[diffKey] ?? expectedTimes[topic]?.[diffKey] ?? 90;
  const timeFlag =
    timeTaken > expected * 1.4
      ? `The user took ${timeTaken}s — significantly over the ~${expected}s target. Time management is a concern.`
      : timeTaken < expected * 0.5
        ? `The user answered in only ${timeTaken}s — possibly rushed. This may have contributed to the mistake.`
        : `Time taken (${timeTaken}s) was within normal range (~${expected}s target).`;

  const prompt = `You are an expert Bocconi entrance test tutor performing surgical mistake analysis.

FORMATTING RULES:
- ALL mathematical expressions MUST use LaTeX: $...$ inline, $$...$$ for display equations.
- Never write math in plain text (no frac, no / for fractions, no ^ without LaTeX).

CONTEXT:
Topic: ${topic} | Subtopic: ${subtopic} | Difficulty: ${difficulty}
Question: ${question}
Correct Answer: ${correctAnswer}
User's Answer: ${userAnswer}
Time Analysis: ${timeFlag}

Perform a precise, actionable analysis.

Rules:
- ALL math in analysis and advice MUST use LaTeX.
- recommendations array must have 2–3 items.
- YouTube suggestions must include a specific search query in quotes.
- Practice suggestions must name the exact exercise type.
`;

  const response = await callWithRetry(
    async (model) => {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateContent',
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                analysis: { type: Type.STRING },
                advice: { type: Type.STRING },
                recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['analysis', 'advice', 'recommendations'],
            },
          }
        })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    MISTAKE_ANALYSIS_GEMINI_FALLBACKS
  );

  const text = response.text;
  if (!text) throw new Error('Failed to analyze mistake');
  return JSON.parse(text) as MistakeAnalysis;
}

// ADD TO BOTTOM OF gemini.ts
 
import { renderTaxonomyForPrompt, getAllUnitsForTopic, getSubtopicForUnit } from '../lib/taxonomy';
import { MockQuestion, TopicProfile } from './supabase';
 
export interface QuestionUnitTag {
  subtopic: string;
  unit: string;
}
 
/**
 * Tag a single question with its deep taxonomy units.
 * Uses only the taxonomy slice for the question's topic — never the full tree.
 * Called during extraction, once per question.
 */
export async function tagQuestionUnits(
  question: GeneratedQuestion
): Promise<QuestionUnitTag[]> {
  const topicSlice = renderTaxonomyForPrompt(question.topic);
  if (!topicSlice) return [];
 
  const allUnits = getAllUnitsForTopic(question.topic);
  if (allUnits.length === 0) return [];
 
  const prompt = `
You are classifying a Bocconi exam question against a fixed taxonomy.
 
QUESTION:
${question.question}
 
OPTIONS: ${question.options.join(' | ')}
EXPLANATION: ${question.explanation}
 
${topicSlice}
 
TASK:
From the taxonomy above, identify which specific UNITS this question tests.
A question may test 1-3 units. Select ONLY from the exact unit names listed.
Do not invent units not in the list.
 
Return JSON: { "units": ["exact unit name 1", "exact unit name 2"] }
Rules:
- Only include units that are genuinely and directly tested by this question
- Maximum 3 units
- Use exact names from the taxonomy — no paraphrasing
`;
 
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.0,
      }),
    });
    if (!res.ok) throw new Error(`Groq API proxy ${res.status}`);
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as { units?: string[] };
    const validUnits = (parsed.units ?? []).filter((u: string) => allUnits.includes(u));
 
    return validUnits.map((unit: string) => ({
      subtopic: getSubtopicForUnit(question.topic, unit) ?? question.subtopic,
      unit,
    }));
  } catch (err) {
    console.error('Unit tagging failed:', err);
    return [];
  }
}


/**
 * Generate a 768-dimension embedding for a question.
 * Uses Gemini text-embedding-004 (free, high quality).
 * Called after tag review is complete for a question.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'embedContent',
      model: 'text-embedding-004',
      contents: text,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.embedding ?? []) as number[];
}

export interface TopicProfileAnalysis {
  topic: string;
  coverage_map: Record<string, { count: number; confidence: 'high'|'medium'|'low' }>;
  difficulty_ladder: string;
  distractor_taxonomy: string;
  time_pressure: string;
  calibrated_uplift: string;
  figure_patterns: string;
  prose_injection: string;
  representative_q_ids: { Easy: string[]; Medium: string[]; Hard: string[] };
  question_count: number;
}
 
/**
 * Analyse all questions for one topic and produce a draft TopicProfile.
 * Uses Gemini 2.5 Pro. Called ONCE per topic per upload batch.
 * Returns a structured draft for manual review — nothing is saved automatically.
 */
export async function analyseTopicProfile(
  topic: string,
  questions: Array<{
    id: string;
    question: GeneratedQuestion;
    units: Array<{ subtopic: string; unit: string }>;
  }>
): Promise<TopicProfileAnalysis> {
  if (questions.length === 0) {
    throw new Error(`No questions provided for topic: ${topic}`);
  }
 
  // Serialise chart data as descriptive text so the model sees figure content
  const questionContext = questions.map((item, i) => {
    const q = item.question;
    const units = item.units.map(u => u.unit).join(', ') || 'untagged';
 
    let chartDesc = '';
    if (q.chartData) {
      const cd = q.chartData;
      chartDesc = `[FIGURE: ${cd.type} chart titled '${cd.title}'.`;
      if (cd.tableData) {
        chartDesc += ` Columns: ${cd.tableData.headers.join(', ')}.`;
        chartDesc += ` ${cd.tableData.rows.length} data rows.`;
        if (cd.tableData.rows.length > 0) {
          chartDesc += ` Sample row: ${cd.tableData.rows[0].join(', ')}.`;
        }
      }
      if (cd.series && cd.series.length > 0) {
        chartDesc += ` Series: ${cd.series.map(s => s.name).join(', ')}.`;
        chartDesc += ` Data points per series: ${cd.series[0].data.length}.`;
      }
      chartDesc += ']';
    }
 
    return [
      `--- Q${i+1} [${q.difficulty ?? 'Medium'}] [Units: ${units}] ---`,
      `Question: ${q.question}`,
      `Options: ${q.options.join(' | ')}`,
      `Correct: ${q.correctAnswer}`,
      `Explanation: ${q.explanation}`,
      chartDesc ? chartDesc : '',
      `StyleAnalysis: ${q.styleAnalysis ?? ''}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
 
  const topicSlice = renderTaxonomyForPrompt(topic);
 
  // Build coverage map from actual unit tags
  const unitCounts: Record<string, number> = {};
  questions.forEach(item => {
    item.units.forEach(u => {
      unitCounts[u.unit] = (unitCounts[u.unit] ?? 0) + 1;
    });
  });
  const coverageMap: Record<string, { count: number; confidence: 'high'|'medium'|'low' }> = {};
  Object.entries(unitCounts).forEach(([unit, count]) => {
    coverageMap[unit] = {
      count,
      confidence: count >= 3 ? 'high' : count === 2 ? 'medium' : 'low',
    };
  });
 
  // Representative questions: best 2 per difficulty level
  const byDiff: Record<string, string[]> = { Easy:[], Medium:[], Hard:[] };
  questions.forEach(item => {
    const d = item.question.difficulty ?? 'Medium';
    if (byDiff[d] && byDiff[d].length < 2) byDiff[d].push(item.id);
  });
 
  const prompt = `
You are an expert analyst of the Bocconi undergraduate entrance test.
Your task: analyse the ${questions.length} ${topic} questions below and produce
a MASTER PATTERN PROFILE for this topic only.
 
${topicSlice}
 
OBSERVED UNIT COVERAGE:
${Object.entries(coverageMap).map(([u,v]) =>
  `  ${u}: ${v.count} appearance(s) — confidence: ${v.confidence}`
).join('\n')}
 
IMPORTANT RULES:
- Base every claim on the actual questions below. No invented patterns.
- For low-coverage units (1 appearance), note uncertainty explicitly.
- Statistical figures must be analysed: describe chart types, data structures,
  and how questions reference them.
- The calibrated_uplift field must describe SPECIFIC structural changes
  that make the real Bocconi test 10-15% harder than mock tests for THIS topic.
  Not vague adjectives — specific: 'add one extra algebraic step', etc.
- prose_injection must be concise (max 400 words). It will be injected into
  every generation prompt for this topic.
 
QUESTIONS:
${questionContext}
 
Output JSON with these exact fields:
{
  "difficulty_ladder": "What concretely distinguishes Easy/Medium/Hard for this topic.",
  "distractor_taxonomy": "Categories of wrong answers used and how they trap students.",
  "time_pressure": "What makes questions in this topic slow. Specific elements.",
  "calibrated_uplift": "Specific structural changes for 10-15% real test uplift.",
  "figure_patterns": "Chart/table types used, data structures, how questions reference them. Empty string if no figures.",
  "prose_injection": "Dense instructional markdown for injection into generation prompts. Max 400 words. Start with ## ${topic} PATTERNS. No preamble."
}
`;
 
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generateContent',
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            difficulty_ladder:   { type: Type.STRING },
            distractor_taxonomy: { type: Type.STRING },
            time_pressure:       { type: Type.STRING },
            calibrated_uplift:   { type: Type.STRING },
            figure_patterns:     { type: Type.STRING },
            prose_injection:     { type: Type.STRING },
          },
          required: ['difficulty_ladder','distractor_taxonomy','time_pressure',
                     'calibrated_uplift','figure_patterns','prose_injection'],
        },
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const response = await res.json();
  const text = response.text;
  if (!text) throw new Error('Empty response from profile analysis');
  const parsed = JSON.parse(text);
 
  return {
    topic,
    coverage_map: coverageMap,
    difficulty_ladder:   parsed.difficulty_ladder,
    distractor_taxonomy: parsed.distractor_taxonomy,
    time_pressure:       parsed.time_pressure,
    calibrated_uplift:   parsed.calibrated_uplift,
    figure_patterns:     parsed.figure_patterns,
    prose_injection:     parsed.prose_injection,
    representative_q_ids: {
      Easy:   byDiff.Easy,
      Medium: byDiff.Medium,
      Hard:   byDiff.Hard,
    },
    question_count: questions.length,
  };
}

// UPDATE generateQuestions signature — add two new optional parameters:
// approvedProfile?: TopicProfile | null
// similarExamples?: MockQuestion[]
// isExtrapolated?: boolean
 
// The prompt building in generateQuestions — replace the learnedProfilePrompt
// section with this more precise version:
 
// NEW: build topic-specific profile injection
function buildTopicProfilePrompt(
  profile: TopicProfile | null,
  similarExamples: MockQuestion[]
): string {
  if (!profile && similarExamples.length === 0) return '';
  const lines: string[] = [];
  lines.push('══════════════════════════════════════════════════════');
  lines.push('APPROVED TOPIC PROFILE (from real Bocconi mock analysis):');
 
  if (profile?.prose_injection) {
    lines.push(profile.prose_injection);
  }
  if (profile?.calibrated_uplift) {
    lines.push('');
    lines.push('CALIBRATED UPLIFT FOR THIS TOPIC (apply to all generated questions):');
    lines.push(profile.calibrated_uplift);
  }
  if (similarExamples.length > 0) {
    lines.push('');
    lines.push('REAL BOCCONI EXAMPLES AT THIS DIFFICULTY (replicate this style exactly):');
    similarExamples.forEach((ex, i) => {
      lines.push(`[Example ${i+1}]`);
      lines.push(`Q: ${ex.question}`);
      lines.push(`Options: ${(ex.options as string[]).join(' | ')}`);
      lines.push(`Correct: ${ex.correct_answer}`);
      if (ex.style_analysis) lines.push(`Style: ${ex.style_analysis}`);
      lines.push('');
    });
  }
  lines.push('══════════════════════════════════════════════════════');
  return lines.join('\n');
}
 
// In the generateQuestions function signature, add these parameters:
// (already updated above)
 
// For each request, build a topic-specific profile prompt:
// (add this inside the existing prompt building, replacing learnedProfilePrompt
// for requests that have an approved profile)
// requests.forEach(r => {
//   const profile = approvedProfiles?.[r.topic] ?? null;
//   const examples = similarExamplesMap?.[r.topic] ?? [];
//   const topicPrompt = buildTopicProfilePrompt(profile, examples);
//   // inject topicPrompt into the per-request prompt section
//   // (see full updated generateQuestions in the calling code)
// });

// ── Chatbot (gemini-2.0-flash — fast conversational) ─────────────────────────

export async function sendChatMessageGemini(
  userMessage: string,
  history: { role: 'user' | 'model'; text: string }[],
  context?: string
): Promise<string> {
  const contents = [
    ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user' as const, parts: [{ text: userMessage }] }
  ];

  const response = await callWithRetry(
    async (model) => {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateContent',
          model,
          contents,
          config: {
            systemInstruction: `You are an elite tutor for the Bocconi Undergraduate Entrance Test (UB test).
You have deep knowledge of the test style, syllabus, scoring (−0.2 / −0.33 penalty system),
and the 4 official mock tests provided by Bocconi/GiuntiPsy.

Your role:
- Explain mistakes with surgical precision, referencing the exact concept that broke down
- Teach the underlying concept clearly, not just the answer
- Suggest when to skip vs. attempt given the penalty system
- Give time management advice benchmarked to 90s/question average
- Use markdown. Always use LaTeX for math: $...$ inline, $$...$$ for display blocks.
- Be direct, concise, and academic. Do not over-praise.
- ALWAYS provide a complete answer. You MUST never say you cannot answer — if a topic is unclear, provide your best explanation and flag any uncertainty inline.`,
          }
        })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    CHAT_GEMINI_FALLBACKS
  );

  const text = response.text;
  if (!text) throw new Error('Failed to get chat response');
  return text;
}

export async function ingestMockTest(fileBase64: string, mimeType: string, sourceName: string): Promise<GeneratedQuestion[]> {
  const prompt = `
You are an expert AI parser for the Bocconi undergraduate entrance test.
Your task is to extract all the questions from the provided mock test document and convert them into our structured JSON format.

The document may contain instructions, answer keys, or other text.
IGNORE everything except the actual questions, their options, and any provided explanations or solutions if they exist.

For each question, figure out:
1. The broad topic (Mathematics, Reading Comprehension, Numerical Reasoning, Critical Thinking).
2. The specific subtopic.
3. The question text (use LaTeX for math, like $x^2$).
4. The 5 options (A, B, C, D, E). Format them as "A) option", "B) option", etc.
5. The correct answer letter (A, B, C, D, or E). If the document doesn't explicitly state it but you can solve it, solve it to find the correct letter.
6. A detailed explanation of how to solve the question.
7. Determine the level of difficulty based on the Bocconi syllabus ('Easy', 'Medium', or 'Hard').
8. Describe the 'styleAnalysis' — identify the question style, structure, language phrasing, and specific traps used.
9. Explain the 'syllabusAlignment' — detailing exactly how the question aligns with the specific standard of the syllabus and what mathematical/logical constraints it enforces.

If a question relies on a chart, table, or graph (common in Numerical Reasoning and Statistics), you MUST convert that visual data into the \`chartData\` JSON object according to the schema.

IMPORTANT: Output ONLY a JSON array of objects that matches the requested schema exactly.
  `;

  let lastIngestError = '';
  for (const model of INGEST_MODELS) {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateContent',
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: fileBase64,
                    mimeType: mimeType,
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  subtopic: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  styleAnalysis: { type: Type.STRING },
                  syllabusAlignment: { type: Type.STRING },
                  chartData: {
                    type: Type.OBJECT,
                    nullable: true,
                    properties: {
                      type: { type: Type.STRING },
                      title: { type: Type.STRING },
                      xAxisLabel: { type: Type.STRING },
                      yAxisLabel: { type: Type.STRING },
                      series: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING },
                            data: {
                              type: Type.ARRAY,
                              items: {
                                type: Type.OBJECT,
                                properties: {
                                  label: { type: Type.STRING },
                                  value: { type: Type.NUMBER },
                                  x: { type: Type.NUMBER },
                                  y: { type: Type.NUMBER },
                                }
                              }
                            }
                          }
                        }
                      },
                      tableData: {
                        type: Type.OBJECT,
                        properties: {
                          headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                          rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } }
                        }
                      }
                    }
                  }
                },
                required: [
                  "topic", "subtopic", "question", "options",
                  "correctAnswer", "explanation",
                  "difficulty", "styleAnalysis", "syllabusAlignment"
                ]
              }
            },
            temperature: 0.1,
          }
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const responseText = data.text;
      if (!responseText) throw new Error("Empty response from Gemini");

      const parsed = JSON.parse(responseText) as GeneratedQuestion[];
      return parsed.map(q => ({ ...q, source: sourceName }));
    } catch (error) {
      lastIngestError = String(error);
      console.warn(`[Ingest] Error on model=${model}:`, lastIngestError.slice(0, 100));
    }
  }
  throw new Error(`Ingest failed on all models: ${lastIngestError}`);
}

export async function synthesizeStylePattern(questions: GeneratedQuestion[]): Promise<string> {
  if (questions.length === 0) return "";

  const questionContext = questions.map((q, i) =>
    `[Q${i + 1} - ${q.topic} - Diff: ${q.difficulty}]\nQuestion: ${q.question}\nOptions: ${q.options.join(", ")}\nSyllabus Alignment: ${q.syllabusAlignment}\nStyle Analysis: ${q.styleAnalysis}`
  ).join("\n\n");

  const prompt = `
You are an expert AI behavior scientist specializing in the Bocconi undergraduate entrance test.
Below is a raw dump of ${questions.length} official mock questions that have been heavily analyzed.

Your task is to synthesize these individual data points into a MASTER LEARNED STYLE PROFILE.
Extract:
1. Recurring question frames per topic (e.g., how Algebra questions are always structured).
2. Common distractor strategies (e.g., what traps are laid in the wrong options).
3. The real difficulty distribution and mathematical/logical constraints enforced.
4. Any highly specific patterns that the baseline style guide might miss.

Output a highly dense, instructional markdown string that will be injected into future AI generation prompts to ensure the AI flawlessly recreates this exact test style and syllabus rigor. Output ONLY the profile content. Begin directly with the first section heading. No preamble, no conclusion, no meta-commentary.
  `;

  for (const model of SYNTHESIS_MODELS) {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateContent',
          model,
          contents: [
            { role: 'user', parts: [{ text: prompt }, { text: questionContext }] }
          ],
          config: { temperature: 0.2 }
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      if (data.text) return data.text;
    } catch (error) {
      console.warn(`[Synthesis] Error on model=${model}:`, String(error).slice(0, 100));
    }
  }
  return "";
}
