import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./PromptsTab', () => ({
  PromptsTab: () => React.createElement('div', { 'data-testid': 'prompts-tab' }, 'Prompts'),
}))
vi.mock('./ComposeTab', () => ({
  ComposeTab: () => React.createElement('div', { 'data-testid': 'compose-tab' }, 'Compose'),
}))
vi.mock('./SuggestionsTab', () => ({
  SuggestionsTab: () => React.createElement('div', { 'data-testid': 'suggestions-tab' }, 'Suggestions'),
}))
vi.mock('./SettingsTab', () => ({
  SettingsTab: () => React.createElement('div', { 'data-testid': 'settings-tab' }, 'Settings'),
}))
vi.mock('./AnalyticsPanel', () => ({
  AnalyticsPanel: () => React.createElement('div', { 'data-testid': 'analytics-panel' }, 'Analytics'),
}))
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

import { AdminLayout } from './AdminLayout'

const browserMock = {
  tabs: {
    getCurrent: vi.fn(),
    remove: vi.fn(),
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as unknown as { browser: typeof browserMock }).browser = browserMock
  browserMock.tabs.getCurrent.mockResolvedValue({ id: 42 })
  browserMock.tabs.remove.mockResolvedValue(undefined)
})

describe('AdminLayout', () => {
  it('renders the 3-column layout with Suggest selected by default', () => {
    render(<AdminLayout />)
    expect(screen.getByTestId('prompts-tab')).toBeTruthy()
    expect(screen.getByTestId('compose-tab')).toBeTruthy()
    expect(screen.getByTestId('suggestions-tab')).toBeTruthy()
    expect(screen.queryByTestId('analytics-panel')).toBeNull()
  })

  it('switches right column to Analytics when Stats tab is clicked', () => {
    render(<AdminLayout />)
    fireEvent.click(screen.getByRole('tab', { name: /stats/i }))
    expect(screen.getByTestId('analytics-panel')).toBeTruthy()
    expect(screen.queryByTestId('suggestions-tab')).toBeNull()
  })

  it('switches back to Suggest when Suggest tab is clicked', () => {
    render(<AdminLayout />)
    fireEvent.click(screen.getByRole('tab', { name: /stats/i }))
    fireEvent.click(screen.getByRole('tab', { name: /suggest/i }))
    expect(screen.getByTestId('suggestions-tab')).toBeTruthy()
  })

  it('closes the current tab when Sidebar Mode is clicked', async () => {
    render(<AdminLayout />)
    fireEvent.click(screen.getByRole('button', { name: /sidebar mode/i }))
    await waitFor(() => expect(browserMock.tabs.remove).toHaveBeenCalledWith(42))
  })

  it('does not render a Docs button', () => {
    render(<AdminLayout />)
    expect(screen.queryByRole('button', { name: /docs/i })).toBeNull()
  })

  it('opens the Settings slide-over when Settings is clicked', () => {
    render(<AdminLayout />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByTestId('settings-tab')).toBeTruthy()
  })
})
