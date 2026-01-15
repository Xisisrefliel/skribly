import { Polar } from '@polar-sh/sdk';
import { v4 as uuidv4 } from 'uuid';
import { d1Service } from './d1.js';

export type UsageStep = 'audio' | 'structuring' | 'quiz' | 'flashcards';

export interface UsageContext {
  userId: string;
  transcriptionId: string;
  step: UsageStep;
}

export interface TokenUsageInput {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

type MetadataValue = string | number | boolean;

interface PricingResult {
  costUsd: number;
  pricingMissing: boolean;
  usageMissing: boolean;
}

const EVENT_NAME = 'transcription_cost';

const TOKEN_PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'gpt-4o-mini-transcribe': { input: 2.5, output: 10 },
  'gpt-4o-transcribe': { input: 2.5, output: 10 },
};

const AUDIO_PRICING_PER_HOUR: Record<string, number> = {
  'whisper-large-v3-turbo': 0.04,
  'whisper-large-v3': 0.111,
};

const polarAccessToken = process.env.POLAR_ACCESS_TOKEN || '';
const polarServer = process.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production';
const polar = polarAccessToken
  ? new Polar({
    accessToken: polarAccessToken,
    server: polarServer,
  })
  : null;

const calculateTokenCostUsd = (
  model: string,
  inputTokens?: number | null,
  outputTokens?: number | null
): PricingResult => {
  const pricing = TOKEN_PRICING_PER_MILLION[model];
  const hasTokenData = typeof inputTokens === 'number' || typeof outputTokens === 'number';
  if (!pricing) {
    return { costUsd: 0, pricingMissing: true, usageMissing: !hasTokenData };
  }

  if (!hasTokenData) {
    return { costUsd: 0, pricingMissing: false, usageMissing: true };
  }

  const inputCost = (inputTokens ?? 0) / 1_000_000 * pricing.input;
  const outputCost = (outputTokens ?? 0) / 1_000_000 * pricing.output;
  return { costUsd: inputCost + outputCost, pricingMissing: false, usageMissing: false };
};

const calculateAudioCostUsd = (model: string, audioSeconds?: number | null): PricingResult => {
  const pricingPerHour = AUDIO_PRICING_PER_HOUR[model];
  const hasAudioData = typeof audioSeconds === 'number';
  if (!pricingPerHour) {
    return { costUsd: 0, pricingMissing: true, usageMissing: !hasAudioData };
  }

  if (!hasAudioData) {
    return { costUsd: 0, pricingMissing: false, usageMissing: true };
  }

  const costUsd = (audioSeconds ?? 0) / 3600 * pricingPerHour;
  return { costUsd, pricingMissing: false, usageMissing: false };
};

const buildMetadata = (base: Record<string, MetadataValue>, extra?: Record<string, MetadataValue | undefined>) => {
  const metadata: Record<string, MetadataValue> = { ...base };
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined) {
        metadata[key] = value;
      }
    });
  }
  return metadata;
};

const recordUsageEvent = async (params: {
  context: UsageContext;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  audioSeconds?: number | null;
  costUsd: number;
  pricingMissing: boolean;
  usageMissing: boolean;
  metadata?: Record<string, MetadataValue>;
}): Promise<void> => {
  const eventId = uuidv4();
  const metadata = buildMetadata(
    {
      transcriptionId: params.context.transcriptionId,
      step: params.context.step,
      provider: params.provider,
      model: params.model,
      costUsd: params.costUsd,
      pricingMissing: params.pricingMissing,
      usageMissing: params.usageMissing,
    },
    {
      inputTokens: params.inputTokens ?? undefined,
      outputTokens: params.outputTokens ?? undefined,
      totalTokens: params.totalTokens ?? undefined,
      audioSeconds: params.audioSeconds ?? undefined,
      ...params.metadata,
    }
  );

  try {
    await d1Service.insertUsageEvent({
      id: eventId,
      userId: params.context.userId,
      transcriptionId: params.context.transcriptionId,
      step: params.context.step,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens ?? null,
      outputTokens: params.outputTokens ?? null,
      totalTokens: params.totalTokens ?? null,
      audioSeconds: params.audioSeconds ?? null,
      costUsd: params.costUsd,
      metadata,
    });
  } catch (error) {
    console.error('Failed to record usage event in D1:', error);
  }

  if (!polar) {
    return;
  }

  try {
    await polar.events.ingest({
      events: [
        {
          name: EVENT_NAME,
          externalCustomerId: params.context.userId,
          externalId: eventId,
          metadata,
          timestamp: new Date(),
        },
      ],
    });
  } catch (error) {
    console.error('Failed to send usage event to Polar:', error);
  }
};

export const usageService = {
  async recordTokenUsage(params: {
    context: UsageContext;
    provider: string;
    model: string;
    usage: TokenUsageInput;
    metadata?: Record<string, MetadataValue>;
  }): Promise<void> {
    const inputTokens = params.usage.inputTokens ?? null;
    const outputTokens = params.usage.outputTokens ?? null;
    const totalTokens = params.usage.totalTokens ?? (
      inputTokens !== null || outputTokens !== null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : null
    );

    const pricing = calculateTokenCostUsd(params.model, inputTokens, outputTokens);
    await recordUsageEvent({
      context: params.context,
      provider: params.provider,
      model: params.model,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: pricing.costUsd,
      pricingMissing: pricing.pricingMissing,
      usageMissing: pricing.usageMissing,
      metadata: params.metadata,
    });
  },

  async recordAudioUsage(params: {
    context: UsageContext;
    provider: string;
    model: string;
    audioSeconds: number | null;
    metadata?: Record<string, MetadataValue>;
  }): Promise<void> {
    const pricing = calculateAudioCostUsd(params.model, params.audioSeconds);
    await recordUsageEvent({
      context: params.context,
      provider: params.provider,
      model: params.model,
      audioSeconds: params.audioSeconds ?? null,
      costUsd: pricing.costUsd,
      pricingMissing: pricing.pricingMissing,
      usageMissing: pricing.usageMissing,
      metadata: params.metadata,
    });
  },
};
