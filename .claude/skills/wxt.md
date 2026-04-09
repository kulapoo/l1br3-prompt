# WXT Skill

WXT is a cross-browser extension framework for building Chrome and Firefox extensions with TypeScript and modern tooling.

## Quick Reference

### Project Structure
```
l1br3-prompt/
├── wxt.config.ts          # Extension config (manifest V3)
├── entrypoints/
│   ├── sidebar.tsx        # Sidebar UI (React)
│   ├── content.ts         # Content script
│   └── background.ts      # Service worker
├── src/
│   ├── components/        # React components
│   ├── contexts/          # Context providers
│   └── types.ts           # TypeScript types
└── dist/                  # Build output
```

### Key APIs
- **Chrome Side Panel**: `chrome.sidePanel.open()`, `chrome.sidePanel.setOptions()`
- **Firefox sidebar**: `browser.sidebarAction.show()`, message passing
- **Storage**: `chrome.storage.sync` / `chrome.storage.local`
- **Messaging**: `chrome.runtime.sendMessage()`, `chrome.runtime.onMessage()`

### Build Commands
```bash
npm run dev           # Dev server with HMR
npm run build         # Production build
npm run preview       # Preview built extension
npm run build:firefox # Build Firefox version
```

### Common Patterns

**Sidebar Component**
```tsx
import { defineUnlistedScript } from 'wxt/sandbox'

export default defineUnlistedScript(() => {
  // Sidebar logic
})
```

**Background Service Worker**
```ts
chrome.runtime.onInstalled.addListener(() => {
  // Setup on install
})
```

**Content Script Communication**
```ts
// Content script
chrome.runtime.sendMessage({type: 'GET_CONTEXT', data: {...}})

// Background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg.type === 'GET_CONTEXT') sendResponse({...})
})
```

## Resources
- [WXT Docs](https://wxt.dev)
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [Firefox WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
