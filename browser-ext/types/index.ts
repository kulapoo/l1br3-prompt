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
  title: string;
  description: string;
  actionText: string;
  originalText?: string;
  suggestedText?: string;
}
