export type TabType = 'compose' | 'prompts' | 'settings';

export interface TransformMode {
  id: string;
  name: string;
  instruction: string;
  isBuiltin: boolean;
  createdAt?: string;
  updatedAt?: string;
}

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

export interface PromptStatItem {
  id: string;
  title: string;
  usageCount: number;
  lastUsed: string | null;
}

export interface CategoryCount {
  category: string | null;
  count: number;
}

export interface PromptStats {
  totalPrompts: number;
  totalCopies: number;
  favoritesCount: number;
  topUsed: PromptStatItem[];
  stale: PromptStatItem[];
  byCategory: CategoryCount[];
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
