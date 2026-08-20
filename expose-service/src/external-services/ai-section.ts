const forbiddenText = /\[\s*(?:insert|address|price|title|value)|\{\{|\}\}|\b(?:undefined|null|n\/a)\b|(?:screenshot|image|img|photo|scan)[_-]?\d*\.(?:png|jpe?g|webp|pdf)\b/i;

export async function generateSectionText(section: string, source: unknown, fallback: string, maxLength: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;
  try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Du bist ein professioneller deutscher Immobilienredakteur. Erzeuge ausschließlich den Text für den Abschnitt ${section}. Schreibe sachlich und attraktiv. Nutze nur die gelieferten Fakten. Ergänze keine Entfernungen, Eigenschaften, Modernisierungen, Ausstattungen oder Ortsinformationen. Wenn eine Information fehlt, lasse sie weg. Antworte als JSON mit dem Schlüssel text.` },
          { role: "user", content: JSON.stringify({ facts: source }) },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const value = JSON.parse(body.choices?.[0]?.message?.content || "{}").text;
    return typeof value === "string" && value.trim() && value.length <= maxLength && !forbiddenText.test(value) ? value.trim() : fallback;
  } catch {
    return fallback;
  }
}