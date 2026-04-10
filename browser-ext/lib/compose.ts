import type { QuickAction } from '../contexts/AppConfig'

/**
 * Build the Ollama prompt for an ollama-source modifier.
 *
 * Combines the modifier's system instruction with the user's current
 * compose content so Ollama has full context to act on.
 */
export function composePromptFor(action: QuickAction, editorText: string): string {
  if (action.source.type !== 'ollama') return editorText
  const instruction = action.source.prompt.trim()
  const content = editorText.trim()
  if (!content) return instruction
  return `${instruction}\n\n${content}`
}
