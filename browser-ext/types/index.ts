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
  lastUsed: string;
  isFavorite: boolean;
}

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
  provider: 'ollama' | null;
}
