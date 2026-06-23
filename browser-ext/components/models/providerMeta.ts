import type { ProviderType, ProviderCapability } from '../../types';

export interface ProviderMeta {
  type: ProviderType;
  label: string;
  description: string;
  defaultBaseUrl: string | null;
  keyPlaceholder?: string;
  /** Used for lightweight client-side key validation until backend testing lands. */
  keyPrefix?: string;
  defaultModels: string[];
  /** Fixed providers (ollama/cloud) cannot be added/edited/deleted by the user. */
  fixed?: boolean;
  supportsKey: boolean;
  docsUrl?: string;
}

export const PROVIDER_META: Record<ProviderType, ProviderMeta> = {
  openai: {
    type: 'openai',
    label: 'OpenAI',
    description: 'GPT models via the official OpenAI API.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    keyPrefix: 'sk-',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    supportsKey: true,
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic',
    description: 'Claude models via the official Anthropic API.',
    defaultBaseUrl: 'https://api.anthropic.com',
    keyPlaceholder: 'sk-ant-...',
    keyPrefix: 'sk-ant-',
    defaultModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    supportsKey: true,
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai_compatible: {
    type: 'openai_compatible',
    label: 'OpenAI Compatible',
    description: 'Any endpoint that speaks the OpenAI Chat Completions API (LM Studio, vLLM, OpenRouter, local Ollama, …).',
    defaultBaseUrl: 'http://localhost:1234/v1',
    keyPlaceholder: 'api-key (optional)',
    defaultModels: [],
    supportsKey: true,
  },
  ollama: {
    type: 'ollama',
    label: 'Ollama (Local)',
    description: 'Free, unlimited, private models running on your machine.',
    defaultBaseUrl: null,
    defaultModels: [],
    fixed: true,
    supportsKey: false,
  },
  cloud: {
    type: 'cloud',
    label: 'Free Cloud (Groq / Gemini)',
    description: 'No key needed. Anonymous quota, used as a fallback when nothing else is reachable.',
    defaultBaseUrl: null,
    defaultModels: ['cloud-default'],
    fixed: true,
    supportsKey: false,
  },
};

export const ALL_CAPABILITIES: { id: ProviderCapability; label: string }[] = [
  { id: 'language', label: 'Language' },
  { id: 'embedding', label: 'Embedding' },
  { id: 'tts', label: 'TTS' },
  { id: 'stt', label: 'STT' },
];

/** Provider types the user can add a configuration for. */
export const ADDABLE_PROVIDER_TYPES: ProviderType[] = ['openai', 'anthropic', 'openai_compatible'];

/** Order in which provider cards are displayed in Section 2. */
export const PROVIDER_ORDER: ProviderType[] = ['ollama', 'cloud', 'openai', 'anthropic', 'openai_compatible'];
