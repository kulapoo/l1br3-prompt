export interface Env {
  RATE_LIMIT: KVNamespace;
  DAILY_QUOTA: string;
  IP_DAILY_QUOTA: string;
  DEFAULT_GROQ_MODEL: string;
  DEFAULT_GEMINI_MODEL: string;
  GROQ_API_KEY: string;
  GEMINI_API_KEY: string;
}

export interface GenerateBody {
  prompt: string;
  model?: string;
  options?: Record<string, unknown>;
  stream?: boolean;
}

export interface QuotaRecord {
  count: number;
  firstSeen: string;
}

export interface QuotaInfo {
  used: number;
  remaining: number;
  total: number;
  resetAt: string;
}

export interface HealthResponse {
  providers: string[];
  quota: QuotaInfo;
}
