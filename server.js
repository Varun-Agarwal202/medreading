import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 5173);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Default requested model (will fall back if unsupported for a given key).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const app = express();
app.use(express.json({ limit: '25mb' }));

const BOOKS = [
  {
    key: 'gifted_hands',
    title: 'Gifted Hands: The Ben Carson Story',
    author: 'Ben Carson with Cecil Murphey',
    pdfFilename:
      'Gifted hands  the Ben Carson story (Carson, Ben, Murphey, Cecil) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
  },
  {
    key: 'first_do_no_harm',
    title: 'First, Do No Harm',
    author: 'Lisa Belkin',
    pdfFilename: 'First, do no harm (Belkin, Lisa, 1960-) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
  },
  {
    key: 'tuesdays_with_morrie',
    title: 'Tuesdays with Morrie',
    author: 'Mitch Albom',
    pdfFilename:
      'Tuesdays with Morrie an old man, a young man, and life’s greatest lesson (Mitch Albom) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
  },
  {
    key: 'being_mortal',
    title: 'Being Mortal',
    author: 'Atul Gawande',
    pdfFilename: 'Being mortal (Gawande, Atul, author) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
  },
  {
    key: 'ultra_processed',
    title: 'Ultra-Processed People',
    author: 'Chris van Tulleken',
    pdfFilename:
      'Ultra-Processed People The Food We Eat That Isnt Food and Why We Cant Stop (Chris van Tulleken) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
  }
];

const PDF_ALLOWLIST = new Set(BOOKS.map((b) => b.pdfFilename));

// Serve ONLY allowlisted PDFs from the workspace folder (read-only).
app.get('/books/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!PDF_ALLOWLIST.has(filename)) {
    return res.status(404).send('Not found');
  }
  // PDFs are served from public/books for local + Vercel parity.
  return res.sendFile(path.join(__dirname, 'public', 'books', filename));
});

// Local PDF.js assets (avoid CDN + ensure pdfjsLib exists).
app.use(
  '/vendor/pdfjs',
  express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build'))
);

app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/books', (_req, res) => {
  res.json({ books: BOOKS });
});

app.post('/api/generate', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(400).json({
        error:
          'Missing GEMINI_API_KEY. Copy .env.example to .env and set your key, then restart the server.'
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
            return {
              inlineData: {
                mimeType: m[1],
                data: m[2]
              }
            };
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
      // Modern aliases / current families (per Google docs).
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      // Older but commonly available.
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
          `Set GEMINI_MODEL in .env to one that works for your key. Last error: ${msg}`
      });
    }

    let parsed = safeJsonParse(text);
    if (!parsed || !Array.isArray(parsed.questions)) {
      const repaired = await repairToValidJson({ genAI, modelCandidates, badText: text });
      parsed = repaired ?? parsed;
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return res.status(500).json({
        error:
          'Model returned invalid JSON. Try again (or lower Questions per book / disable images).'
      });
    }

    return res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try to salvage the first JSON object in the response.
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

function buildQuizSchema(numQuestions) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: {
        type: 'array',
        minItems: numQuestions,
        maxItems: numQuestions,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            number: { type: 'integer' },
            text: { type: 'string' },
            choices: {
              type: 'object',
              additionalProperties: false,
              properties: {
                A: { type: 'string' },
                B: { type: 'string' },
                C: { type: 'string' },
                D: { type: 'string' }
              },
              required: ['A', 'B', 'C', 'D']
            },
            answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] }
          },
          required: ['number', 'text', 'choices', 'answer']
        }
      }
    },
    required: ['questions']
  };
}

async function generateTextWithModelFallback({ genAI, modelCandidates, prompt, imgParts }) {
  let lastErr = null;
  let text = '';

  for (const candidate of modelCandidates) {
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
        return { text, lastErr: null };
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/404/i.test(msg) || /not found/i.test(msg) || /is not supported/i.test(msg)) break;
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

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function listenWithFallback(startPort) {
  const server = app.listen(startPort, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running at http://localhost:${startPort}`);
  });

  server.on('error', (err) => {
    if (err && typeof err === 'object' && err.code === 'EADDRINUSE') {
      const next = startPort + 1;
      // eslint-disable-next-line no-console
      console.warn(`Port ${startPort} is in use; trying ${next}…`);
      listenWithFallback(next);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Server error:', err);
    process.exit(1);
  });
}

listenWithFallback(PORT);

