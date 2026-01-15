import Groq from 'groq-sdk';
import { v4 as uuidv4 } from 'uuid';
import type { Flashcard, QuizQuestion } from '@lecture/shared';
import type { TokenUsageInput, UsageContext } from './usage.js';
import { usageService } from './usage.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const groq = new Groq({
  apiKey: GROQ_API_KEY,
  timeout: 180000, // 3 minute timeout for long texts
  maxRetries: 2,
});

/**
 * Detect the primary language of the text
 * Uses character frequency analysis and common word patterns
 */
function detectLanguage(text: string): string {
  const lowerText = text.toLowerCase();

  // Turkish-specific characters
  const turkishChars = /[şğıüöçŞĞİÜÖÇ]/g;
  const turkishCharCount = (text.match(turkishChars) || []).length;

  // Common Turkish words (including partial/truncated forms that survive transcription errors)
  const turkishWords = /\b(bir|ve|bu|için|ile|de|da|ne|ki|var|yok|olan|gibi|daha|çok|kadar|sonra|önce|ama|fakat|ancak|değil|mi|mı|mu|mü|evet|hayır|nasıl|neden|peki|şey|biz|siz|onlar|ben|sen|olarak)\b/gi;
  const turkishWordCount = (lowerText.match(turkishWords) || []).length;

  // German-specific characters
  const germanChars = /[äöüßÄÖÜ]/g;
  const germanCharCount = (text.match(germanChars) || []).length;

  // Common German words
  const germanWords = /\b(der|die|das|und|ist|sind|nicht|ein|eine|mit|auf|für|von|zu|im|am|dem|den|des|dass|wie|was|wir|ihr|sie|er|es|auch|bei|als|aus|über|nach|vor|wird|werden)\b/gi;
  const germanWordCount = (lowerText.match(germanWords) || []).length;

  // Common English words
  const englishWords = /\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|this|that|these|those|and|but|or|if|then|else|when|where|why|how|what|which|who|whom|with|from|into|through|during|before|after|above|below|between|under|again|further|once|here|there|all|each|few|more|most|other|some|such|no|not|only|own|same|so|than|too|very)\b/gi;
  const englishWordCount = (lowerText.match(englishWords) || []).length;

  // Calculate scores (weighted)
  const turkishScore = turkishCharCount * 3 + turkishWordCount * 2;
  const germanScore = germanCharCount * 3 + germanWordCount * 2;
  const englishScore = englishWordCount * 2;

  const maxScore = Math.max(turkishScore, germanScore, englishScore);

  if (maxScore === 0) {
    return 'Unknown';
  }

  if (maxScore === turkishScore && (turkishCharCount > 3 || turkishWordCount > 6)) {
    return 'Turkish';
  }

  if (maxScore === germanScore && (germanCharCount > 1 || germanWordCount > 5)) {
    return 'German';
  }

  if (maxScore === englishScore) {
    return 'English';
  }

  if (germanScore > 0) {
    return 'German';
  }

  if (turkishScore > 0) {
    return 'Turkish';
  }

  return 'Unknown';
}

const STRUCTURING_PROMPT = `You are an expert at transforming raw lecture transcriptions into well-structured, digestible content.

Transform the following lecture transcription into a well-organized document:

## CRITICAL: Transcription Error Correction (Apply First)
Voice transcription often produces incomplete or garbled text. You MUST reconstruct these errors before structuring:

### Error Patterns to Fix:
- **Truncated words**: Single letters or syllables that should be complete words
  - Example: "i g sizce k bir kaynak m" → "iyi sizce ki bir kaynak mı"
  - Example: "E insanlar di insanlar" → "Evet, insanlar, diğer insanlar"
- **Missing suffixes**: Especially Turkish suffixes (-mı, -mi, -mu, -mü, -dir, -ler, -lar, -dan, -den, etc.)
- **Broken word boundaries**: Words split incorrectly or merged incorrectly
- **Missing vowel harmony**: Reconstruct proper Turkish vowel harmony when words are incomplete

### Turkish-Specific Corrections:
- Reconstruct question particles: m, mı, mi, mu, mü → full form based on vowel harmony
- Fix truncated connectors: v → ve, i → ile, d → da/de
- Complete demonstratives: b → bu, ş → şu, o → o (context-dependent)
- Restore case suffixes: -d, -t → -da/-de/-ta/-te, -n → -nın/-nin/-nun/-nün

### Correction Guidelines:
- Use surrounding context and topic to infer the intended complete words
- Prefer the most contextually and grammatically appropriate reconstruction
- Apply your knowledge of the language's grammar and common phrases
- Only mark as [unclear] if the meaning is truly unrecoverable after analysis
- When multiple interpretations are possible, choose the one that fits the lecture topic

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

## Mathematical Formulations:
- **ALWAYS use LaTeX syntax** for all mathematical expressions, formulas, equations, and calculations
- Use square brackets for inline math: [ \frac{a}{b} \times 100 ]
- Use LaTeX commands for fractions (\frac{numerator}{denominator}), operators (\times, \div, \pm, \mp), and functions
- For text within math, use \text{text content}
- Avoid LaTeX environments or alignment syntax: do NOT use \begin{align}, \begin{array}, \begin{cases}, \begin{tabular}, the & symbol, or \\ line breaks
- Keep every formula to a single inline expression inside one pair of brackets
- Examples:
  - Percentage calculation: [ \frac{106{,}50}{104}\times100 - 100 = 2{,}40% ]
  - Formula with text: [ \text{Rate} = \left(\frac{\text{new value}}{\text{old value}} \times 100\right) - 100 ]
  - Complex expressions: [ \sum_{i=1}^{n} x_i = \frac{n(n+1)}{2} ]
- Always wrap mathematical expressions in square brackets [ ... ] for proper rendering

## Content Guidelines:
- Write in direct, informative language - NOT as if describing notes
- WRONG: "This section reviews...", "The lecture discusses...", "These notes cover..."
- RIGHT: Just present the information directly as structured content
- Preserve all important information from the original
- Remove filler words, repetitions, and verbal tics
- Maintain the logical flow of the lecture
- Do NOT add information that wasn't in the original
- Do NOT use meta-language referring to the document itself

Output clean Markdown format.`;

export interface StructuringResult {
  structuredText: string;
  detectedLanguage: string;
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

const normalizeLanguage = (language?: string | null): string | null => {
  if (!language) {
    return null;
  }

  const trimmed = language.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') {
    return null;
  }

  return trimmed;
};

interface CompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

const resolveTokenUsage = (usage?: CompletionUsage): TokenUsageInput => ({
  inputTokens: usage?.prompt_tokens ?? usage?.input_tokens ?? null,
  outputTokens: usage?.completion_tokens ?? usage?.output_tokens ?? null,
  totalTokens: usage?.total_tokens ?? null,
});

export const llmService = {
  /**
   * Structure a raw transcription into organized notes using LLM
   * @param rawText - The raw transcription text
   * @param title - The lecture title for context
   */
  async structureTranscription(
    rawText: string,
    title: string,
    usageContext?: UsageContext
  ): Promise<StructuringResult> {
    // Detect language for better error correction
    const detectedLanguage = detectLanguage(rawText);
    console.log(`Structuring transcription: ${title}, length: ${rawText.length} chars, language: ${detectedLanguage}`);

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
            content: `Lecture Title: "${title}"\nLanguage: ${detectedLanguage}\n\nTranscription:\n\n${textToProcess}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 16000,
      });

      if (usageContext) {
        await usageService.recordTokenUsage({
          context: usageContext,
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          usage: resolveTokenUsage(completion.usage),
        });
      }

      const structuredText = completion.choices[0]?.message?.content || '';

      if (!structuredText) {
        throw new Error('LLM returned empty response');
      }

      console.log(`Structuring complete, output length: ${structuredText.length} chars`);

      return {
        structuredText,
        detectedLanguage,
      };
    });
  },

  /**
   * Generate quiz questions from lecture content
   */
  async generateQuiz(
    content: string,
    title: string,
    questionCount: number = 10,
    language: string = 'English',
    usageContext?: UsageContext
  ): Promise<QuizQuestion[]> {
    const inferredLanguage = normalizeLanguage(detectLanguage(content));
    const resolvedLanguage = inferredLanguage ?? normalizeLanguage(language);
    const languageLabel = resolvedLanguage ?? 'the same language as the content';
    console.log(`Generating ${questionCount} quiz questions for: ${title} (language: ${resolvedLanguage ?? 'auto'})`);

    const languageInstruction = resolvedLanguage
      ? `CRITICAL: Generate ALL questions, options, and explanations in ${resolvedLanguage}. The content is in ${resolvedLanguage}, so the quiz must also be entirely in ${resolvedLanguage}.`
      : 'CRITICAL: Generate all questions, options, and explanations in the same language as the content.';

    const prompt = `You are an expert educator creating a quiz to test understanding of lecture material.

Generate exactly ${questionCount} multiple-choice questions based on the following lecture content.

${languageInstruction}

Requirements:
- Each question should test understanding of key concepts, not just memorization
- Include a mix of difficulty levels (easy, medium, hard)
- Each question must have exactly 4 options (A, B, C, D)
- Only one option should be correct
- Provide a brief explanation for why the correct answer is right
- Questions should cover the most important topics from the lecture
- ALL text (questions, options, explanations) must be in ${languageLabel}

Output ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Lecture Title: "${title}"

Content:
${content.substring(0, 50000)}`;

    return withRetry(async () => {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 8000,
      });

      if (usageContext) {
        await usageService.recordTokenUsage({
          context: usageContext,
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          usage: resolveTokenUsage(completion.usage),
        });
      }

      const responseText = completion.choices[0]?.message?.content || '';
      
      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse quiz JSON from LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const questions: QuizQuestion[] = parsed.questions.map((q: {
        question: string;
        options: string[];
        correctAnswer: number;
        explanation: string;
      }) => ({
        id: uuidv4(),
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      }));

      console.log(`Generated ${questions.length} quiz questions`);
      return questions;
    });
  },

  /**
   * Generate flashcards from lecture content
   */
  async generateFlashcards(
    content: string,
    title: string,
    cardCount: number = 20,
    language: string = 'English',
    usageContext?: UsageContext
  ): Promise<Flashcard[]> {
    const inferredLanguage = normalizeLanguage(detectLanguage(content));
    const resolvedLanguage = inferredLanguage ?? normalizeLanguage(language);
    const languageLabel = resolvedLanguage ?? 'the same language as the content';
    console.log(`Generating ${cardCount} flashcards for: ${title} (language: ${resolvedLanguage ?? 'auto'})`);

    const languageInstruction = resolvedLanguage
      ? `CRITICAL: Generate ALL flashcard content (front, back, category) in ${resolvedLanguage}. The content is in ${resolvedLanguage}, so the flashcards must also be entirely in ${resolvedLanguage}.`
      : 'CRITICAL: Generate all flashcard content (front, back, category) in the same language as the content.';

    const prompt = `You are an expert educator creating flashcards to help students memorize key concepts from a lecture.

Generate exactly ${cardCount} flashcards based on the following lecture content.

${languageInstruction}

Requirements:
- Focus on the most important concepts, definitions, and facts
- Front side should be a question or concept name
- Back side should be a clear, concise answer or explanation
- Include a mix of:
  - Definitions (e.g., "What is X?" / "${resolvedLanguage === 'Turkish' ? 'X nedir?' : 'What is X?'}")
  - Concepts (e.g., "Explain the concept of X" / "${resolvedLanguage === 'Turkish' ? 'X kavramını açıklayın' : 'Explain X'}")
  - Key facts (e.g., "What are the main characteristics of X?")
  - Relationships (e.g., "How does X relate to Y?")
- Optionally categorize cards by topic/section
- ALL text must be in ${languageLabel}

Output ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "cards": [
    {
      "front": "Question in ${languageLabel}",
      "back": "Answer in ${languageLabel}",
      "category": "Optional topic/section name"
    }
  ]
}

Lecture Title: "${title}"

Content:
${content.substring(0, 50000)}`;

    return withRetry(async () => {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 8000,
      });

      if (usageContext) {
        await usageService.recordTokenUsage({
          context: usageContext,
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          usage: resolveTokenUsage(completion.usage),
        });
      }

      const responseText = completion.choices[0]?.message?.content || '';
      
      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse flashcard JSON from LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const cards: Flashcard[] = parsed.cards.map((c: {
        front: string;
        back: string;
        category?: string;
      }) => ({
        id: uuidv4(),
        front: c.front,
        back: c.back,
        category: c.category,
      }));

      console.log(`Generated ${cards.length} flashcards`);
      return cards;
    });
  },
};
