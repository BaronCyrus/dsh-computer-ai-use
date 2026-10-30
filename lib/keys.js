const NAMED_KEYS = {
  ctrl: 'LeftControl', control: 'LeftControl',
  shift: 'LeftShift',
  alt: 'LeftAlt', option: 'LeftAlt', opt: 'LeftAlt',
  enter: 'Enter', return: 'Enter',
  esc: 'Escape', escape: 'Escape',
  tab: 'Tab', space: 'Space', backspace: 'Backspace',
  delete: 'Delete', del: 'Delete', insert: 'Insert',
  home: 'Home', end: 'End',
  pageup: 'PageUp', pagedown: 'PageDown', pgup: 'PageUp', pgdn: 'PageDown',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
  capslock: 'CapsLock', fn: 'Fn', menu: 'Menu',
  ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon', '\'': 'Quote',
  '[': 'LeftBracket', ']': 'RightBracket', '\\': 'Backslash',
  '-': 'Minus', '=': 'Equal', '`': 'Grave',
}

const SYSTEM_MODIFIERS = new Set(['cmd', 'command', 'meta', 'super', 'win', 'windows'])

function keyName(token, platform) {
  if (SYSTEM_MODIFIERS.has(token)) return platform === 'darwin' ? 'LeftCmd' : 'LeftWin'
  if (NAMED_KEYS[token] !== undefined) return NAMED_KEYS[token]
  if (/^[a-z]$/.test(token)) return token.toUpperCase()
  if (/^[0-9]$/.test(token)) return `Num${token}`
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(token)) return token.toUpperCase()
  throw new Error(`unknown key "${token}"`)
}

/**
 * Parse "cmd+shift+t" into nut.js Key enum names. Unlike the UI-TARS hotkey
 * table, ctrl stays Control on macOS: DSH models name the key they mean, and
 * ctrl+c in a terminal is not cmd+c.
 */
export function parseKeys(combo, platform = process.platform) {
  const tokens = combo.trim().toLowerCase().replace(/\s+/g, '').split('+')
  if (tokens.includes('')) throw new Error(`cannot parse keys "${combo}"; write the plus key as shift+=`)
  return [...new Set(tokens.map(token => keyName(token, platform)))]
}
