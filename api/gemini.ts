import { GoogleGenAI } from "@google/genai";

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const body = await req.json();
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
    
    // For calls using raw fetch formatting (Question Generation)
    if (body.action === 'rawFetch') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.payload),
      });
      const data = await response.text();
      return new Response(data, { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    // For calls using SDK formatting
    if (body.action === 'generateContent') {
      const ai = new GoogleGenAI({ apiKey });
      const { model, contents, config } = body;
      const response = await ai.models.generateContent({ model, contents, config });
      return new Response(JSON.stringify({ text: response.text }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'embedContent') {
      const ai = new GoogleGenAI({ apiKey });
      const { model, contents } = body;
      const response = await ai.models.embedContent({ model, contents });
      const embedding = response.embeddings?.[0]?.values ?? [];
      return new Response(JSON.stringify({ embedding }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
