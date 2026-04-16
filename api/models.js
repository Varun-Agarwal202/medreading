import { GoogleGenAI } from '@google/genai';

export default async function handler(_req, res) {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(400).json({
        error: 'Missing GEMINI_API_KEY (set it in Vercel Environment Variables).'
      });
    }

    const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const modelsResult = await genAI.models.list();

    // The SDK may return an array, an object with `models`, or an async iterable pager.
    let modelsArray = [];
    if (Array.isArray(modelsResult)) {
      modelsArray = modelsResult;
    } else if (modelsResult && Array.isArray(modelsResult.models)) {
      modelsArray = modelsResult.models;
    } else if (modelsResult && typeof modelsResult[Symbol.asyncIterator] === 'function') {
      for await (const m of modelsResult) modelsArray.push(m);
    } else if (modelsResult && typeof modelsResult[Symbol.iterator] === 'function') {
      for (const m of modelsResult) modelsArray.push(m);
    }

    const simplified = modelsArray.map((m) => ({
      name: m?.name,
      displayName: m?.displayName,
      supportedActions: m?.supportedActions
    }));

    return res.status(200).json({ models: simplified });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}

