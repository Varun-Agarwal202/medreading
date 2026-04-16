import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(_req, res) {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(400).json({
        error: 'Missing GEMINI_API_KEY (set it in Vercel Environment Variables).'
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const models = await genAI.listModels();

    // Keep response small + useful.
    const simplified = (models?.models || models || []).map((m) => ({
      name: m.name,
      displayName: m.displayName,
      supportedGenerationMethods: m.supportedGenerationMethods
    }));

    return res.status(200).json({ models: simplified });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}

