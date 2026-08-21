import { getLogger, trackExternalCall } from '../lib/logger.js';

const forbiddenText =
  /\[\s*(?:insert|address|price|title|value)|\{\{|\}\}|\b(?:undefined|null|n\/a)\b|(?:screenshot|image|img|photo|scan)[_-]?\d*\.(?:png|jpe?g|webp|pdf)\b/i;

export async function generateSectionText(
  section: string,
  source: unknown,
  fallback: string,
  maxLength: number,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  try {
    const response = await trackExternalCall(
      {
        service: 'openai',
        operation: 'chat.completions',
        method: 'POST',
        path: '/chat/completions',
        props: { provider: 'openai', model, section },
        status: (result) => (result as Response).status,
      },
      () =>
        fetch(
          `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              temperature: 0.35,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content: `Du bist ein professioneller deutscher Immobilienredakteur. Erzeuge ausschließlich den Text für den Abschnitt ${section}. Schreibe sachlich und attraktiv. Nutze nur die gelieferten Fakten. Ergänze keine Entfernungen, Eigenschaften, Modernisierungen, Ausstattungen oder Ortsinformationen. Wenn eine Information fehlt, lasse sie weg. Antworte als JSON mit dem Schlüssel text.`,
                },
                { role: 'user', content: JSON.stringify({ facts: source }) },
              ],
            }),
          },
        ).then((result) => {
          if (!result.ok) {
            const error = new Error(`OpenAI request rejected with status ${result.status}`);
            (error as { status?: number }).status = result.status;
            throw error;
          }
          return result;
        }),
    );
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const value = JSON.parse(body.choices?.[0]?.message?.content || '{}').text;
    if (
      typeof value === 'string' &&
      value.trim() &&
      value.length <= maxLength &&
      !forbiddenText.test(value)
    ) {
      getLogger().info(
        {
          section,
          inputTokens: body.usage?.prompt_tokens,
          outputTokens: body.usage?.completion_tokens,
        },
        'AI section text generated for section {section}',
      );
      return value.trim();
    }
    getLogger().info(
      { section, reason: 'AI output was invalid or too long; using fallback' },
      'Falling back for AI section {section}',
    );
    return fallback;
  } catch {
    getLogger().warn(
      { section },
      'AI section request failed for section {section}; using fallback',
    );
    return fallback;
  }
}
