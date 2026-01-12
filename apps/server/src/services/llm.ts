import Groq from 'groq-sdk';
import type { QuizQuestion, Flashcard } from '@lecture/shared';
import { v4 as uuidv4 } from 'uuid';

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
  
  // Common English words
  const englishWords = /\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|this|that|these|those|and|but|or|if|then|else|when|where|why|how|what|which|who|whom|with|from|into|through|during|before|after|above|below|between|under|again|further|once|here|there|all|each|few|more|most|other|some|such|no|not|only|own|same|so|than|too|very)\b/gi;
  const englishWordCount = (lowerText.match(englishWords) || []).length;
  
  // Calculate scores (weighted)
  const turkishScore = turkishCharCount * 3 + turkishWordCount * 2;
  const englishScore = englishWordCount * 2;
  
  // Determine language
  if (turkishScore > englishScore && (turkishCharCount > 5 || turkishWordCount > 10)) {
    return 'Turkish';
  } else if (englishScore > turkishScore) {
    return 'English';
  } else if (turkishScore > 0) {
    // Default to Turkish if any Turkish indicators present (for mixed/unclear cases)
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

export const llmService = {
  /**
   * Structure a raw transcription into organized notes using LLM
   * @param rawText - The raw transcription text
   * @param title - The lecture title for context
   */
  async structureTranscription(rawText: string, title: string): Promise<StructuringResult> {
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
  async generateQuiz(content: string, title: string, questionCount: number = 10): Promise<QuizQuestion[]> {
    console.log(`Generating ${questionCount} quiz questions for: ${title}`);

    const prompt = `You are an expert educator creating a quiz to test understanding of lecture material.

Generate exactly ${questionCount} multiple-choice questions based on the following lecture content.

Requirements:
- Each question should test understanding of key concepts, not just memorization
- Include a mix of difficulty levels (easy, medium, hard)
- Each question must have exactly 4 options (A, B, C, D)
- Only one option should be correct
- Provide a brief explanation for why the correct answer is right
- Questions should cover the most important topics from the lecture

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
  async generateFlashcards(content: string, title: string, cardCount: number = 20): Promise<Flashcard[]> {
    console.log(`Generating ${cardCount} flashcards for: ${title}`);

    const prompt = `You are an expert educator creating flashcards to help students memorize key concepts from a lecture.

Generate exactly ${cardCount} flashcards based on the following lecture content.

Requirements:
- Focus on the most important concepts, definitions, and facts
- Front side should be a question or concept name
- Back side should be a clear, concise answer or explanation
- Include a mix of:
  - Definitions (What is X?)
  - Concepts (Explain the concept of X)
  - Key facts (What are the main characteristics of X?)
  - Relationships (How does X relate to Y?)
- Optionally categorize cards by topic/section

Output ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "cards": [
    {
      "front": "What is [concept]?",
      "back": "Clear definition or explanation",
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
