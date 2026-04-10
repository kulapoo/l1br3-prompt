import { Prompt, Tag, Suggestion } from '../types';

export const MOCK_TAGS: Tag[] = [
{
  id: 't1',
  name: 'Code',
  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
},
{
  id: 't2',
  name: 'Writing',
  color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
},
{
  id: 't3',
  name: 'Review',
  color: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
},
{
  id: 't4',
  name: 'Email',
  color: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
},
{
  id: 't5',
  name: 'Debug',
  color: 'bg-rose-500/20 text-rose-400 border-rose-500/30'
}];


export const MOCK_PROMPTS: Prompt[] = [
{
  id: 'p1',
  title: 'Code Review Assistant',
  content:
  'Review the following code for security vulnerabilities, performance issues, and adherence to clean code principles. Provide specific examples for improvement:\n\n{{code}}',
  tags: [MOCK_TAGS[0], MOCK_TAGS[2]],
  category: 'Development',
  usageCount: 142,
  lastUsed: '2 hours ago',
  isFavorite: true
},
{
  id: 'p2',
  title: 'Refactor to React Hooks',
  content:
  'Refactor this class component to a functional component using React Hooks (useState, useEffect). Ensure all lifecycle methods are properly translated.',
  tags: [MOCK_TAGS[0], MOCK_TAGS[4]],
  category: 'Development',
  usageCount: 89,
  lastUsed: '1 day ago',
  isFavorite: false
},
{
  id: 'p3',
  title: 'Polite Decline Email',
  content:
  'Write a polite and professional email declining the following request, but keeping the door open for future collaboration. Keep it concise.',
  tags: [MOCK_TAGS[3], MOCK_TAGS[1]],
  category: 'Communication',
  usageCount: 56,
  lastUsed: '3 days ago',
  isFavorite: true
},
{
  id: 'p4',
  title: "Explain Like I'm 5",
  content:
  'Explain the following complex technical concept in simple terms, as if you were talking to a 5-year-old. Use analogies where possible.',
  tags: [MOCK_TAGS[1]],
  category: 'Learning',
  usageCount: 210,
  lastUsed: 'Just now',
  isFavorite: true
},
{
  id: 'p5',
  title: 'Generate Unit Tests',
  content:
  'Generate comprehensive unit tests for the following function using Jest and React Testing Library. Include edge cases and error states.',
  tags: [MOCK_TAGS[0]],
  category: 'Testing',
  usageCount: 34,
  lastUsed: '1 week ago',
  isFavorite: false
}];


export const MOCK_SUGGESTIONS: Suggestion[] = [
{
  id: 's1',
  promptId: 'mock-p1',
  title: 'Improve PR Description',
  description:
  'Detected a GitHub PR. Add a structured summary and testing steps to your prompt.',
  actionText: 'Apply PR Template',
  originalText: 'Review this PR',
  suggestedText:
  'Review this PR. Please structure your response with: 1. High-level summary 2. Potential risks 3. Testing recommendations.',
  score: 3.0,
  rule: 'url_pattern',
},
{
  id: 's2',
  promptId: 'mock-p2',
  title: 'Make it Concise',
  description:
  'The selected text is quite long. Wrap it in a prompt to summarize it.',
  actionText: 'Wrap in Summarize',
  score: 2.0,
  rule: 'selected_text',
},
{
  id: 's3',
  promptId: 'mock-p3',
  title: 'Extract Action Items',
  description: 'Detected an email thread. Extract tasks and assignees.',
  actionText: 'Apply Extraction',
  score: 1.5,
  rule: 'url_pattern',
}];
