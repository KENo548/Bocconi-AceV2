/**
 * Groq service — ultra-fast free inference for conversational + reasoning tasks.
 *
 * Task routing (matching your stack):
 *   llama-3.3-70b-versatile         → Chatbot (fast, great conversation)
 *   deepseek-r1-distill-llama-70b   → Mistake Analysis (step-by-step math reasoning)
 *
 * Groq uses an OpenAI-compatible API endpoint.
 * Falls back to Gemini 2.0 Flash for both tasks if Groq is unavailable.
 */

import { sendChatMessageGemini, analyzeMistakeGemini, MistakeAnalysis } from './gemini';

export type { MistakeAnalysis };

const GROQ_BASE = '/api/groq';

const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';          // Chatbot
const GROQ_REASON_MODEL = 'qwen-qwq-32b';   // Mistake Analysis

// ─── Shared fetch helper ──────────────────────────────────────────────────────

async function groqChat(
    model: string,
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    opts: { temperature?: number; max_tokens?: number; response_format?: { type: string } } = {}
): Promise<string> {
    const res = await fetch(GROQ_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: opts.temperature ?? 0.7,
            max_tokens: opts.max_tokens ?? 1024,
            ...(opts.response_format ? { response_format: opts.response_format } : {}),
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Groq API error ${res.status}: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';

    // DeepSeek R1 wraps its reasoning in <think>...</think> — strip it for clean output
    return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// ─── Question Generation fallback — Llama 3.3 70B via Groq ───────────────────
// Used as Fallback 2 when both gemini-2.0-flash and gemini-2.5-flash fail.

import type { GeneratedQuestion } from './gemini';

export async function generateQuestionFallback(
    topic: string,
    difficulty: string,
    fullPrompt: string
): Promise<GeneratedQuestion | null> {
    const systemPrompt = `You are a question generator for the Bocconi undergraduate entrance test.
You MUST respond with a single valid JSON object only. No markdown fences, no preamble, no extra text.
The JSON object MUST have exactly these keys:
- topic (string)
- subtopic (string)
- question (string) — question text only, NO options appended
- options (array of 5 strings, each formatted as "A) ...", "B) ...", "C) ...", "D) ...", "E) ..." — or exactly 3 for Critical Thinking True/False questions)
- correctAnswer (string) — single letter only: A, B, C, D, or E
- explanation (string) — step-by-step solution`;

    try {
        const raw = await groqChat(
            GROQ_CHAT_MODEL,
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: fullPrompt },
            ],
            { temperature: 0.7, max_tokens: 2048, response_format: { type: 'json_object' } }
        );

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]) as GeneratedQuestion;
        // Ensure required fields exist
        if (!parsed.question || !parsed.options || !parsed.correctAnswer) return null;
        return { ...parsed, topic, difficulty: difficulty as 'Easy' | 'Medium' | 'Hard' };
    } catch (err) {
        console.warn('[Groq] Question generation fallback failed:', String(err).slice(0, 100));
        return null;
    }
}

// ─── Mistake Analysis — DeepSeek R1 Distill 70B via Groq ─────────────────────

export async function analyzeMistake(
    question: string,
    correctAnswer: string,
    userAnswer: string,
    topic: string,
    subtopic: string,
    timeTaken: number,
    difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium'
): Promise<MistakeAnalysis> {
    const timeNote = timeTaken < 30
        ? `The student answered in only ${timeTaken}s — possibly rushed. This may have contributed to the mistake.`
        : '';

    const systemPrompt = `You are an elite Bocconi entrance test tutor performing surgical mistake analysis.
Return ONLY a JSON object with exactly these keys:
{
  "analysis": "Precise explanation of what went wrong and why, referencing the exact concept.",
  "advice": "Concrete technique or mental checklist to avoid this exact mistake.",
  "recommendations": ["topic1", "topic2"]
}
No markdown, no extra text. Pure JSON only.`;

    const userPrompt = `Question: ${question}
Topic: ${topic} / ${subtopic} | Difficulty: ${difficulty}
Correct Answer: ${correctAnswer}
Student's Answer: ${userAnswer}
${timeNote}

Analyze this mistake now.`;

    try {
        const raw = await groqChat(
            GROQ_REASON_MODEL,
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            { temperature: 0.3, max_tokens: 800 }
        );

        // Extract JSON from response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as MistakeAnalysis;
        throw new Error('No JSON found in Groq response');
    } catch (err) {
        console.warn('[Groq] Mistake analysis failed, falling back to Gemini:', err);
        return analyzeMistakeGemini(question, correctAnswer, userAnswer, topic, subtopic, timeTaken, difficulty);
    }
}

// ─── Chatbot — Llama 3.3 70B via Groq ────────────────────────────────────────

export async function sendChatMessage(
    userMessage: string,
    history: { role: 'user' | 'model'; text: string }[],
    context?: string
): Promise<string> {
    const systemPrompt = `You are an expert AI tutor specialising in the Bocconi University undergraduate entrance test (UB test).
Your role is to help students master all sections: Mathematics, Reading Comprehension, Numerical Reasoning, and Critical Thinking.
${context ? `\nContext for this session:\n${context}` : ''}

Guidelines:
- Be concise, precise, and encouraging.
- Use LaTeX notation for all mathematical expressions (e.g. $x^2$, $$\\frac{a}{b}$$).
- For exam questions, walk through the solution step by step.
- Flag common Bocconi-specific traps and time-saving tricks.
- Never just give the answer — teach the method.`;

    // Convert history to Groq/OpenAI messages format
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({
            role: (m.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: m.text,
        })),
        { role: 'user', content: userMessage },
    ];

    try {
        return await groqChat(GROQ_CHAT_MODEL, messages, { temperature: 0.7, max_tokens: 1024 });
    } catch (err) {
        console.warn('[Groq] Chat failed, falling back to Gemini:', err);
        return sendChatMessageGemini(userMessage, history, context);
    }
}
