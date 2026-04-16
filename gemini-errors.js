/**
 * Normalize Gemini / Google GenAI SDK errors for HTTP responses.
 * Quota and rate limits must not be treated as "wrong model" — stop retrying.
 */

export function isGeminiQuotaOrRateLimitError(err) {
  if (err == null) return false;
  const status = typeof err.status === 'number' ? err.status : undefined;
  if (status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (/RESOURCE_EXHAUSTED/i.test(msg)) return true;
  if (/exceeded your current quota/i.test(msg)) return true;
  if (/quota exceeded/i.test(msg)) return true;
  if (/generate_content_free_tier/i.test(msg)) return true;
  if (/RateLimit|rate limit|too many requests/i.test(msg)) return true;
  return false;
}

export function geminiQuotaUserMessage() {
  return (
    'Gemini returned 429 RESOURCE_EXHAUSTED (quota or rate limit). This is not a broken model name. ' +
    'Free tier has strict per-minute and daily caps per Google project; a new API key often still uses the same project quota. ' +
    'Wait for the suggested retry delay, lower “Questions per book” / generate one book at a time, or enable billing / upgrade in Google AI Studio. ' +
    'See https://ai.google.dev/gemini-api/docs/rate-limits'
  );
}
