/**
 * DeepSeek service — handles tasks that benefit from open-ended reasoning
 * rather than strict JSON schema enforcement.
 *
 * Task routing:
 *   deepseek-reasoner  (R1)  → Mistake Analysis   (step-by-step math reasoning)
 *   deepseek-chat      (V3)  → Chatbot            (conversational tutor)
 *
 * DeepSeek's API is OpenAI-compatible — plain fetch to their endpoint.
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

// ─── Shared fetch helper ──────────────────────────────────────────────────────

async function deepseekChat(
    model: 'deepseek-reasoner' | 'deepseek-chat',
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    opts: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: opts.temperature ?? 0.6,
            max_tokens: opts.max_tokens ?? 2048,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`DeepSeek API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from DeepSeek');
    return content;
}

// ─── Types (mirrored from gemini.ts for compatibility) ────────────────────────

export interface MistakeAnalysis {
    analysis: string;
    advice: string;
    recommendations: string[];
}

// ─── Expected time benchmarks (shared logic) ──────────────────────────────────

const EXPECTED_TIMES: Record<string, Record<'easy' | 'medium' | 'hard', number>> = {
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

// ─── Mistake Analysis via DeepSeek-R1 ────────────────────────────────────────

/**
 * Uses DeepSeek-R1 (reasoning model) for mistake analysis.
 * R1 produces detailed chain-of-thought before answering — ideal for identifying
 * the *exact* step in a multi-step math problem where the student went wrong.
 *
 * Returns JSON manually parsed (no schema enforcement — R1 handles structure natively).
 */
export async function analyzeMistake(
    question: string,
    correctAnswer: string,
    userAnswer: string,
    topic: string,
    subtopic: string,
    timeTaken: number,
    difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium'
): Promise<MistakeAnalysis> {
    const diffKey = difficulty.toLowerCase() as 'easy' | 'medium' | 'hard';
    const expected = EXPECTED_TIMES[subtopic]?.[diffKey] ?? EXPECTED_TIMES[topic]?.[diffKey] ?? 90;

    const timeFlag =
        timeTaken > expected * 1.4
            ? `The student took ${timeTaken}s — significantly over the ~${expected}s target. Time management is a concern.`
            : timeTaken < expected * 0.5
                ? `The student answered in only ${timeTaken}s — possibly rushed. This may have contributed to the mistake.`
                : `Time taken (${timeTaken}s) was within normal range for this topic (~${expected}s target).`;

    const systemPrompt = `You are an elite Bocconi entrance test tutor performing surgical mistake analysis.

FORMATTING RULES:
- ALL mathematical expressions MUST use LaTeX: $...$ inline, $$...$$ for display equations.
- Never write math in plain text — no "frac", no "/" for fractions, no "^" without LaTeX.
- Be direct, specific, and concise. No generic advice.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "analysis": "Pinpoint the exact conceptual or procedural error. Reference the specific step. Be surgically precise.",
  "advice": "Concrete technique or mental checklist to avoid this exact mistake. Include time strategy if relevant.",
  "recommendations": [
    "YouTube: search '[specific query]' — e.g. 'conditional probability Bayes theorem intuition'",
    "Practice: [specific exercise type] — e.g. 'solve 10 log equations with domain restrictions'"
  ]
}`;

    const userPrompt = `Topic: ${topic} | Subtopic: ${subtopic} | Difficulty: ${difficulty}
Question: ${question}
Correct Answer: ${correctAnswer}
Student's Answer: ${userAnswer}
Time Analysis: ${timeFlag}

Analyze this mistake now.`;

    const raw = await deepseekChat('deepseek-reasoner', [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], { temperature: 0.3 });

    // R1 may wrap its answer in <think>...</think> tags — strip them
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Extract JSON — handle cases where R1 adds brief prose before/after
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('DeepSeek-R1 did not return valid JSON');

    return JSON.parse(jsonMatch[0]) as MistakeAnalysis;
}

// ─── Chatbot (Tutor) via DeepSeek-V3 ─────────────────────────────────────────

/**
 * Uses DeepSeek-V3 (chat model) for the interactive tutor chatbot.
 * V3 has strong conversational reasoning and saves all Gemini quota for
 * structured JSON tasks.
 */
export async function sendChatMessage(
    history: { role: 'user' | 'model'; text: string }[]
): Promise<string> {
    const SYSTEM = `You are an elite tutor for the Bocconi Undergraduate Entrance Test (UB test).
You have deep knowledge of the test's style, syllabus, scoring (−0.2 / −0.33 penalty system),
and the 4 official mock tests provided by Bocconi/GiuntiPsy.

Your role:
- Explain mistakes with surgical precision, referencing the exact concept that broke down
- Teach the underlying concept clearly, not just the answer
- Suggest when to skip vs. attempt a question given the penalty system
- Give time management advice benchmarked to 90s/question average
- Use markdown for structure. Always use LaTeX for math: $...$ inline, $$...$$ for display blocks.
- Be direct, concise, and academic in tone. Do not over-praise.`;

    // Map Gemini role names ('model') to OpenAI role names ('assistant')
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: SYSTEM },
        ...history.map(h => ({
            role: (h.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: h.text,
        })),
    ];

    return deepseekChat('deepseek-chat', messages, { temperature: 0.7, max_tokens: 1024 });
}
