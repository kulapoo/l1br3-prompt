export type TabType = 'compose' | 'prompts' | 'suggestions' | 'settings';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  tags: Tag[];
  category: string;
  usageCount: number;
  lastUsed: string | null;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptCreate {
  title: string;
  content: string;
  category?: string;
  isFavorite?: boolean;
  tags?: Array<{ name: string }>;
}

export type PromptUpdate = Partial<PromptCreate>;

export interface Suggestion {
  id: string;
  promptId: string;
  title: string;
  description: string;
  actionText: string;
  originalText?: string;
  suggestedText?: string;
  score: number;
  rule: string;
}

export interface SuggestContext {
  url?: string;
  selectedText?: string;
  pageTitle?: string;
  pageContent?: string;
  inputText?: string;
  useAi?: boolean;
}

export interface GenerateRequest {
  prompt: string;
  model?: string | null;
  options?: Record<string, unknown> | null;
  cloudEnabled?: boolean;
}

export interface ProcessTemplateResponse {
  rendered: string;
  variables: string[];
}

export interface AiStatus {
  ollama: {
    reachable: boolean;
    models: string[];
  };
  cloud?: {
    reachable: boolean;
    quotaRemaining: number;
    quotaTotal: number;
    resetAt: string | null;
  };
  provider: 'ollama' | 'cloud' | null;
}
