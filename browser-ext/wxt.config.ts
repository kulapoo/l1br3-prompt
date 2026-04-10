import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'l1br3-prompt',
    description: 'Local-first prompt management for AI chat',
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'identity', 'alarms'],
    action: {},
    commands: {
      '_execute_action': {
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        description: 'Open l1br3-prompt sidebar'
      }
    },
    host_permissions: [
      '*://*.chatgpt.com/*',
      '*://*.claude.ai/*',
      '*://*.gemini.google.com/*',
      '<all_urls>'
    ]
  }
});
