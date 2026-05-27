import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ConflictDialog } from './ConflictDialog'
import type { Conflict } from '../lib/conflicts'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const updatePromptMock = vi.fn(async (_baseUrl: string, _id: string, _data: unknown) => ({}))
vi.mock('../lib/api', () => ({
  updatePrompt: (baseUrl: string, id: string, data: unknown) => updatePromptMock(baseUrl, id, data),
}))

const removeConflictMock = vi.fn(async (_id: string) => {})
const setWatermarkMock = vi.fn(async (_id: string, _updatedAt: string) => {})
vi.mock('../lib/conflicts', async () => {
  const actual = await vi.importActual<typeof import('../lib/conflicts')>('../lib/conflicts')
  return {
    ...actual,
    removeConflict: (id: string) => removeConflictMock(id),
    setWatermark: (id: string, updatedAt: string) => setWatermarkMock(id, updatedAt),
  }
})

let mockConflicts: Conflict[] = []
vi.mock('../hooks/useConflicts', () => ({
  useConflicts: () => ({ conflicts: mockConflicts, count: mockConflicts.length, loading: false }),
}))

vi.mock('../contexts/AppConfig', () => ({
  useAppConfig: () => ({
    config: { backend: { url: 'http://localhost:8000' } },
  }),
}))

vi.mock('lucide-react', () => ({
  AlertTriangle: () => null,
  Check: () => null,
  X: () => null,
  ArrowLeftCircle: () => null,
  ArrowRightCircle: () => null,
  Pencil: () => null,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    id: 'p1',
    promptId: 'p1',
    local: {
      id: 'p1',
      title: 'Local Title',
      content: 'Local content',
      category: 'General',
      tags: ['a'],
      isFavorite: false,
      updatedAt: '2026-05-02T00:00:00Z',
      deletedAt: null,
    },
    remote: {
      id: 'p1',
      title: 'Remote Title',
      content: 'Remote content',
      category: 'General',
      tags: ['b'],
      isFavorite: true,
      updatedAt: '2026-05-02T12:00:00Z',
      deletedAt: null,
    },
    baseUpdatedAt: '2026-05-01T00:00:00Z',
    detectedAt: '2026-05-03T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  mockConflicts = []
  updatePromptMock.mockClear()
  removeConflictMock.mockClear()
  setWatermarkMock.mockClear()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConflictDialog', () => {
  it('renders nothing when closed', () => {
    mockConflicts = [makeConflict()]
    const { container } = render(<ConflictDialog open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows an empty state when no conflicts pending', () => {
    mockConflicts = []
    render(<ConflictDialog open={true} onClose={() => {}} />)
    expect(screen.getByText(/no pending conflicts/i)).toBeInTheDocument()
  })

  it('displays the local and remote sides for the selected conflict', () => {
    mockConflicts = [makeConflict()]
    render(<ConflictDialog open={true} onClose={() => {}} />)
    expect(screen.getAllByText('Local Title').length).toBeGreaterThan(0)
    expect(screen.getByText('Remote Title')).toBeInTheDocument()
  })

  it('writes the local snapshot via updatePrompt when "Keep mine" is clicked', async () => {
    mockConflicts = [makeConflict()]
    render(<ConflictDialog open={true} onClose={() => {}} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep mine/i }))
    })
    await waitFor(() => {
      expect(updatePromptMock).toHaveBeenCalledWith(
        'http://localhost:8000',
        'p1',
        expect.objectContaining({ title: 'Local Title', isFavorite: false }),
      )
    })
    expect(removeConflictMock).toHaveBeenCalledWith('p1')
    expect(setWatermarkMock).toHaveBeenCalledWith('p1', '2026-05-02T12:00:00Z')
  })

  it('writes the remote snapshot via updatePrompt when "Use theirs" is clicked', async () => {
    mockConflicts = [makeConflict()]
    render(<ConflictDialog open={true} onClose={() => {}} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use theirs/i }))
    })
    await waitFor(() => {
      expect(updatePromptMock).toHaveBeenCalledWith(
        'http://localhost:8000',
        'p1',
        expect.objectContaining({ title: 'Remote Title', isFavorite: true }),
      )
    })
  })

  it('opens a manual editor when "Edit manually" is clicked', () => {
    mockConflicts = [makeConflict()]
    render(<ConflictDialog open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit manually/i }))
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Local Title')).toBeInTheDocument()
  })

  it('shows an error if updatePrompt rejects', async () => {
    mockConflicts = [makeConflict()]
    updatePromptMock.mockRejectedValueOnce(new Error('backend offline'))
    render(<ConflictDialog open={true} onClose={() => {}} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep mine/i }))
    })
    await waitFor(() => {
      expect(screen.getByText(/backend offline/)).toBeInTheDocument()
    })
    expect(removeConflictMock).not.toHaveBeenCalled()
  })
})
