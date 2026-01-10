import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const groq = new Groq({
  apiKey: GROQ_API_KEY,
  timeout: 180000, // 3 minute timeout for long texts
  maxRetries: 2,
});

const STRUCTURING_PROMPT = `You are an expert at transforming raw lecture transcriptions into well-structured, digestible content.

Transform the following lecture transcription into a well-organized document:

## Structure Requirements:
1. **Title**: Create a concise, descriptive title (# heading)
2. **Overview**: 2-3 sentences capturing the main topics (no meta-commentary like "This covers..." - just state the key points directly)
3. **Main Sections**: Organize into logical sections with clear headlines (##)
4. **Key Points**: Use bullet points for important concepts, definitions, and takeaways
5. **Sub-sections**: Use sub-headlines (###) when needed for complex topics
6. **Tables**: When comparing items, listing properties, or showing structured data, use markdown tables

## Formatting Guidelines:
- Bold (**text**) for key terms and important concepts
- Italic (*text*) for emphasis or technical terms on first use
- Use numbered lists for sequential steps or processes
- Use tables for comparisons, schedules, or structured information
- Use \`code\` formatting for technical terms, commands, or formulas
- Keep paragraphs short (2-4 sentences max)

## Content Guidelines:
- Write in direct, informative language - NOT as if describing notes
- WRONG: "This section reviews...", "The lecture discusses...", "These notes cover..."
- RIGHT: Just present the information directly as structured content
- Preserve all important information from the original
- Fix transcription errors and awkward phrasing
- Remove filler words, repetitions, and verbal tics
- Maintain the logical flow of the lecture
- Do NOT add information that wasn't in the original
- Do NOT use meta-language referring to the document itself

Output clean Markdown format.`;

export interface StructuringResult {
  structuredText: string;
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on non-retryable errors
      const errorMessage = lastError.message || '';
      if (errorMessage.includes('Invalid API Key') ||
          errorMessage.includes('401')) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`LLM API attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export const llmService = {
  /**
   * Structure a raw transcription into organized notes using LLM
   * @param rawText - The raw transcription text
   * @param title - The lecture title for context
   */
  async structureTranscription(rawText: string, title: string): Promise<StructuringResult> {
    console.log(`Structuring transcription: ${title}, length: ${rawText.length} chars`);

    // For very long transcriptions, we may need to process in chunks
    // Groq's context window is large, but we'll be safe
    const maxInputLength = 100000; // ~25k tokens
    let textToProcess = rawText;

    if (rawText.length > maxInputLength) {
      console.log(`Text too long (${rawText.length}), truncating to ${maxInputLength}`);
      textToProcess = rawText.substring(0, maxInputLength) + '\n\n[Note: Transcription was truncated due to length]';
    }

    return withRetry(async () => {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: STRUCTURING_PROMPT,
          },
          {
            role: 'user',
            content: `Lecture Title: "${title}"\n\nTranscription:\n\n${textToProcess}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 16000,
      });

      const structuredText = completion.choices[0]?.message?.content || '';

      if (!structuredText) {
        throw new Error('LLM returned empty response');
      }

      console.log(`Structuring complete, output length: ${structuredText.length} chars`);

      return {
        structuredText,
      };
    });
  },
};
