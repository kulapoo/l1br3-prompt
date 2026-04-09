export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Detect active input fields on AI chat sites
    let activeInput: HTMLElement | null = null

    function getActiveInput(): HTMLElement | null {
      const selectors = [
        'textarea[data-id="root"]',  // ChatGPT
        '#prompt-textarea',           // ChatGPT alt
        '[contenteditable="true"]',   // Claude, Gemini
        'textarea',
      ]
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel)
        if (el) return el
      }
      return null
    }

    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true'
      ) {
        activeInput = target
      }
    })

    browser.runtime.onMessage.addListener((message: { type: string; text?: string }) => {
      if (message.type === 'INSERT_TEXT' && message.text) {
        const input = activeInput || getActiveInput()
        if (input) {
          if (input.tagName === 'TEXTAREA') {
            const ta = input as HTMLTextAreaElement
            const start = ta.selectionStart ?? ta.value.length
            const end = ta.selectionEnd ?? ta.value.length
            ta.value = ta.value.slice(0, start) + message.text + ta.value.slice(end)
            ta.dispatchEvent(new Event('input', { bubbles: true }))
          } else {
            document.execCommand('insertText', false, message.text)
          }
        }
      }
    })
  }
})
