import { GoogleGenAI } from '@google/genai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  }
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    // Default requested model (will fall back if unsupported for a given key).
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!GEMINI_API_KEY) {
      return res.status(400).json({
        error: 'Missing GEMINI_API_KEY (set it in Vercel Environment Variables).'
      });
    }

    const { book, segment, images, numQuestions, startNumber, style } = req.body ?? {};

    if (!book?.title || !segment || !Number.isInteger(numQuestions) || numQuestions < 1) {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const safeStart = Number.isInteger(startNumber) ? startNumber : 1;

    const imgParts = Array.isArray(images)
      ? images
          .filter((x) => typeof x === 'string' && x.startsWith('data:image/'))
          .slice(0, 8)
          .map((dataUrl) => {
            const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
            if (!m) return null;
            return { inlineData: { mimeType: m[1], data: m[2] } };
          })
          .filter(Boolean)
      : [];

    const styleLine = (() => {
      const s = typeof style === 'string' ? style.toLowerCase() : '';
      if (s === 'recall') return 'Style focus: factual recall (names, terms, numbers, events).';
      if (s === 'definition') return 'Style focus: concepts/definitions (identify meaning of terms/ideas).';
      if (s === 'application') return 'Style focus: application (short scenario; pick best answer).';
      if (s === 'inference') return 'Style focus: inference/why (implications, cause/effect, reasoning).';
      return 'Style focus: HOSA-style mix (recall + definition + inference + application).';
    })();

    const prompt = [
      `Book: "${book.title}" by ${book.author ?? 'Unknown'}`,
      '',
      'You will be given an excerpt of the book with page markers like [Page N].',
      'If images are included, use them to create at least 20% image-grounded questions (figures, tables, charts, captions, diagrams).',
      styleLine,
      '',
      `Task: Generate EXACTLY ${numQuestions} multiple-choice questions from this excerpt.`,
      'Requirements:',
      '- Each question has exactly 4 choices labeled A, B, C, D.',
      '- Exactly one correct answer.',
      '- Add a page reference at the end of each question text like "(pp N)" that matches a page marker present in the excerpt.',
      '- Provide an explanation (2–4 sentences) for why the correct answer is correct, and briefly why one distractor is wrong.',
      '- Provide an evidence quote/snippet from the excerpt that supports the answer (1–2 lines), and the page number used.',
      '- Mix difficulty within the chosen style.',
      '- Avoid vague questions; make distractors plausible.',
      `- Start numbering at ${safeStart}.`,
      '',
      'Respond ONLY with valid JSON in this exact format (no markdown, no explanation):',
      '{ "questions": [ { "number": 1, "text": "… (pp N)", "choices": { "A": "...", "B": "...", "C": "...", "D": "..." }, "answer": "A", "explanation": "...", "evidence": { "page": 12, "quote": "..." }, "qType": "recall|definition|application|inference", "difficulty": "easy|medium|hard" } ] }',
      '',
      'CRITICAL: Output MUST be raw JSON only. Do not wrap in backticks. Do not add commentary.',
      '',
      'Excerpt:',
      '---',
      String(segment).slice(0, 90000),
      '---'
    ].join('\n');

    const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const modelCandidates = uniqueStrings([
      GEMINI_MODEL,
      // Widely-available stable names (often supported when "latest" aliases are not).
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      // Aliases / newer families (may vary by key / API version).
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.0-pro'
    ]);

    const { text, lastErr } = await generateTextWithModelFallback({
      genAI,
      modelCandidates,
      prompt,
      imgParts
    });

    if (lastErr) {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      return res.status(500).json({
        error:
          `No compatible Gemini model found for generateContent. ` +
          `Set GEMINI_MODEL in Vercel env vars. Last error: ${msg}`
      });
    }

    // Parse, then if needed do a one-shot "repair" pass to force valid JSON.
    let parsed = safeJsonParse(text);
    if (!parsed || !Array.isArray(parsed.questions)) {
      const repaired = await repairToValidJson({ genAI, modelCandidates, badText: text });
      parsed = repaired ?? parsed;
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return res.status(500).json({
        error: 'Model returned invalid JSON. Try again (or lower questions / disable images).'
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function uniqueStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr) {
    if (!v || typeof v !== 'string') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// Note: we intentionally do not pass a JSON schema to generationConfig,
// because some Gemini endpoints reject `responseSchema` payloads.

async function generateTextWithModelFallback({ genAI, modelCandidates, prompt, imgParts }) {
  let lastErr = null;
  let text = '';

  for (const candidate of modelCandidates) {
    // Two attempts: first normal, second lower temperature.
    for (const attempt of [
      { temperature: 0.35, extra: '' },
      { temperature: 0.1, extra: '\n\nRemember: return ONLY raw JSON.\n' }
    ]) {
      try {
        const result = await genAI.models.generateContent({
          model: candidate,
          contents: [{ role: 'user', parts: [{ text: prompt + attempt.extra }, ...imgParts] }],
          config: {
            responseMimeType: 'application/json',
            temperature: attempt.temperature,
            maxOutputTokens: 2500
          }
        });
        text = result.text ?? '';

        // If it parses, we can stop early (even if later we still validate structure).
        const quick = safeJsonParse(text);
        if (quick && Array.isArray(quick.questions)) {
          return { text, lastErr: null };
        }

        // Otherwise let the caller attempt repair; still return this candidate output.
        return { text, lastErr: null };
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/404/i.test(msg) || /not found/i.test(msg) || /is not supported/i.test(msg)) break; // try next model
        // transient / rate / json schema incompatibility — try next attempt/model
        continue;
      }
    }
  }

  return { text, lastErr };
}

async function repairToValidJson({ genAI, modelCandidates, badText }) {
  const repairPrompt = [
    'You are a JSON repair tool.',
    'Return ONLY valid JSON that matches the provided schema. No markdown. No commentary.',
    '',
    'Input text (may contain invalid JSON or extra words):',
    '---',
    String(badText).slice(0, 12000),
    '---'
  ].join('\n');

  for (const candidate of modelCandidates) {
    try {
      const result = await genAI.models.generateContent({
        model: candidate,
        contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 2000
        }
      });
      const text = result.text ?? '';
      const parsed = safeJsonParse(text);
      if (parsed && Array.isArray(parsed.questions)) return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
}

