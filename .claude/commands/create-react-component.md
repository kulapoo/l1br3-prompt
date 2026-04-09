# create-react-component

Scaffold a new React component with TypeScript, Tailwind CSS, and shadcn/ui.

## Usage

```
/create-react-component ComponentName
```

## What It Does

1. **Queries the shadcn MCP server** to check if any shadcn primitives fit the component being built (e.g. Button, Dialog, Input, Card, Select, etc.)

2. Creates `src/components/ComponentName.tsx` with:
   - shadcn/ui primitives from `src/components/ui/` where appropriate
   - Custom Tailwind CSS for layout and project-specific styling
   - Proper TypeScript types
   - Accessibility basics (semantic HTML, ARIA labels)
   - Component documentation comment
   - Export statement

3. If a required shadcn component is not yet installed, runs:
   ```bash
   npx shadcn@latest add <component-name>
   ```
   from the project root before writing the component file.

4. Adds import to `src/components/index.ts` if it exists

## Example

```
/create-react-component PromptCard
```

Creates:
- `src/components/PromptCard.tsx` — component implementation

## Component Template

```typescript
import React from 'react'

export interface PromptCardProps {
  // Your prop types here
}

/**
 * PromptCard displays a single prompt with actions
 */
export const PromptCard: React.FC<PromptCardProps> = ({
  // Destructure props
}) => {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      {/* Component content */}
    </div>
  )
}
```

## File Organization

- **One component per file** — each `.tsx` file exports exactly one component
- **`src/components/`** — reusable components shared across pages (buttons, inputs, cards, modals, etc.)
- **`src/pages/`** — tab pages; each tab gets its own directory with its page-specific sub-components
- **Group related components** — sub-components of a page live flat in that page's directory; only nest a subfolder when a component itself has many subparts:
  ```
  src/
  ├── components/               # shared, reusable across pages
  │   ├── Button.tsx
  │   ├── Card.tsx
  │   └── index.ts
  └── pages/                    # one directory per tab/page
      ├── Compose/
      │   ├── ComposeEditor/    # complex component → its own subfolder
      │   │   ├── ComposeEditor.tsx
      │   │   └── Modifiers.tsx
      │   ├── ComposeHeader.tsx
      │   ├── LivePreview.tsx
      │   └── Tags.tsx
      └── Settings/
          ├── SettingsPanel.tsx
          └── ...
  ```

## Conventions

- **Prefer shadcn/ui primitives** over hand-rolling common UI patterns (buttons, inputs, dialogs, selects, etc.) — check the shadcn MCP before writing from scratch
- shadcn components live in `src/components/ui/` and are never modified directly
- Use `interface ComponentNameProps` for prop types
- Use Tailwind CSS for all layout and custom styling (no inline styles)
- Include semantic HTML (`<button>`, `<input>`, etc) when not using shadcn
- Add ARIA attributes where needed
- Document complex logic with comments
- Keep components focused and composable
