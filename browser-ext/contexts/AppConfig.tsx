import React, { useState, createContext, useContext } from 'react';

export type QuickActionSource =
{
  type: 'local';
} |
{
  type: 'api';
  url: string;
  method?: string;
} |
{
  type: 'mcp';
  toolName: string;
} |
{
  type: 'ollama';
  prompt: string;
};

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  insertText: string;
  color: string;
  enabled: boolean;
  source: QuickActionSource;
}

export interface AppConfig {
  backend: {
    isInstalled: boolean;
    url: string;
  };
  ai: {
    localConnected: boolean;
    cloudEnabled: boolean;
    cloudQuotaRemaining: number;
    selectedModel: string | null;
    availableModels: string[];
  };
  sync: {
    enabled: boolean;
    lastSyncTime: string | null;
    isAuthenticated: boolean;
  };
  viewMode: 'sidebar' | 'admin' | 'docs';
  quickActions: QuickAction[];
}

interface AppConfigContextType {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  updateConfig: (updates: Partial<AppConfig>) => void;
}

const defaultQuickActions: QuickAction[] = [
{
  id: 'concise',
  label: 'Make it Concise',
  description: 'Add instruction for brief, focused output',
  insertText:
  '\n\nPlease be concise and to the point. Avoid unnecessary elaboration.',
  color: 'text-emerald-400',
  enabled: true,
  source: {
    type: 'local'
  }
},
{
  id: 'step-by-step',
  label: 'Chain of Thought',
  description: 'Add step-by-step reasoning instructions',
  insertText:
  '\n\nThink through this step-by-step:\n1. First, analyze the input\n2. Then, consider edge cases\n3. Finally, provide your answer',
  color: 'text-amber-400',
  enabled: true,
  source: {
    type: 'local'
  }
},
{
  id: 'examples',
  label: 'Add Examples',
  description: 'Insert few-shot example structure',
  insertText:
  '\n\nHere are some examples:\n\nInput: {{example_input}}\nOutput: {{example_output}}\n\nNow apply this to:',
  color: 'text-blue-400',
  enabled: true,
  source: {
    type: 'local'
  }
},
{
  id: 'format-json',
  label: 'Output as JSON',
  description: 'Specify JSON output format',
  insertText:
  '\n\nReturn your response as a valid JSON object with the following structure:\n```json\n{\n  "result": "",\n  "confidence": 0,\n  "reasoning": ""\n}\n```',
  color: 'text-purple-400',
  enabled: true,
  source: {
    type: 'api',
    url: 'http://localhost:8000/api/v1/process-template'
  }
},
{
  id: 'clarity',
  label: 'Improve Clarity',
  description: 'Add constraints and specificity',
  insertText:
  '\n\nBe specific about:\n- Scope: [define boundaries]\n- Constraints: [list limitations]\n- Expected detail level: [brief/moderate/comprehensive]',
  color: 'text-rose-400',
  enabled: false,
  source: {
    type: 'ollama',
    prompt: 'Improve the clarity of this prompt'
  }
}];

const defaultConfig: AppConfig = {
  backend: {
    isInstalled: false,
    url: 'http://localhost:8000'
  },
  ai: {
    localConnected: false,
    cloudEnabled: false,
    cloudQuotaRemaining: 50,
    selectedModel: null,
    availableModels: [],
  },
  sync: {
    enabled: false,
    lastSyncTime: null,
    isAuthenticated: false
  },
  viewMode: 'sidebar',
  quickActions: defaultQuickActions
};

const AppConfigContext = createContext<AppConfigContextType | undefined>(
  undefined
);

export function AppConfigProvider({ children }: {children: React.ReactNode;}) {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const updateConfig = (updates: Partial<AppConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...updates
    }));
  };
  return (
    <AppConfigContext.Provider
      value={{
        config,
        setConfig,
        updateConfig
      }}>
      {children}
    </AppConfigContext.Provider>);
}

export function useAppConfig() {
  const context = useContext(AppConfigContext);
  if (context === undefined) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return context;
}
