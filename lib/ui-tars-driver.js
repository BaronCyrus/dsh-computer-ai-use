import { createRequire } from 'node:module'
import { parseKeys } from './keys.js'

const require = createRequire(import.meta.url)

const UI_TARS_CONTEXT = Symbol.for('@ui-tars/sdk/context')
const SCROLL_UNITS_PER_NOTCH = 100
const PASTE_SETTLE_MS = 200
const KEY_DELAY_MS = 20
const DRAG_PRESS_DELAY_MS = 100
// The window server applies pointer moves slightly after they are posted, so a
// position read right away can trail the target by several pixels.
const POINTER_SETTLE_MS = 50

const CLICK_ACTIONS = {
  left: { 1: 'left_single', 2: 'left_double' },
  right: { 1: 'right_single' },
  middle: { 1: 'middle_click' },
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// UI-TARS logs through a global context whose default logger is console, and
// that would put the operator's chatter on the stdout of headless and ACP runs.
// The context reads this symbol, so seeding it first keeps the operator quiet.
function silenceUiTarsLogger() {
  const quiet = () => {}
  globalThis[UI_TARS_CONTEXT] ??= {
    logger: { log: quiet, info: quiet, warn: quiet, error: quiet, debug: quiet },
    factors: [1000, 1000],
    systemPrompt: '',
  }
}

const defaultExport = module => module.default ?? module

async function loadRuntime() {
  silenceUiTarsLogger()
  const [operatorModule, nut, jimp] = await Promise.all([
    import('@ui-tars/operator-nut-js'),
    import('@computer-use/nut-js').then(defaultExport),
    import('jimp'),
  ])
  const { NutJSOperator } = operatorModule.NutJSOperator === undefined ? operatorModule.default : operatorModule
  return { operator: new NutJSOperator(), nut, Jimp: jimp.Jimp }
}

function macPermission(kind) {
  if (process.platform !== 'darwin') return 'authorized'
  return require('@computer-use/node-mac-permissions').getAuthStatus(kind)
}

function requestMacPermission(kind) {
  const permissions = require('@computer-use/node-mac-permissions')
  if (kind === 'screen') permissions.askForScreenCaptureAccess()
  else permissions.askForAccessibilityAccess()
}

// macOS fails both of these silently: capture returns only the wallpaper, and
// synthetic input goes nowhere. Refuse up front so the model can tell the user.
function assertMacPermission(kind, label) {
  const status = macPermission(kind)
  if (status === 'authorized') return
  try { requestMacPermission(kind) } catch {}
  throw new Error(`macOS ${label} permission is ${status} for the app running DSH. Ask the user to allow DeepSeek Harness (or their terminal, for a CLI run) in System Settings > Privacy & Security > ${label}, then restart that app.`)
}

export function createUiTarsDriver({ maxImageEdge = 1568, jpegQuality = 80 } = {}) {
  let loading

  // Native modules load on first use, not at DSH boot. A failed load is not
  // cached, so a corrected install works without restarting.
  const runtime = () => {
    loading ??= loadRuntime().catch(error => {
      loading = undefined
      throw new Error(`could not load the UI-TARS desktop operator: ${error.message}`, { cause: error })
    })
    return loading
  }

  async function screenSize() {
    const { nut } = await runtime()
    return { width: await nut.screen.width(), height: await nut.screen.height() }
  }

  // Runs one UI-TARS action. The operator takes coordinates as a [0, 1] box and
  // multiplies them back up, so the box carries exact screen points.
  async function execute(actionType, inputs, size) {
    const { operator } = await runtime()
    await operator.execute({
      prediction: '',
      parsedPrediction: { action_type: actionType, action_inputs: inputs, reflection: null, thought: '' },
      screenWidth: size.width,
      screenHeight: size.height,
      scaleFactor: 1,
      factors: [1000, 1000],
    })
  }

  const box = (point, size) => {
    const x = point.x / size.width
    const y = point.y / size.height
    return `[${x},${y},${x},${y}]`
  }

  return {
    screenSize,

    async cursor() {
      const { nut } = await runtime()
      const { x, y } = await nut.mouse.getPosition()
      return { x, y }
    },

    async assertCanControl() {
      assertMacPermission('accessibility', 'Accessibility')
    },

    async capture({ region } = {}) {
      assertMacPermission('screen', 'Screen Recording')
      const { nut, Jimp } = await runtime()
      const size = await screenSize()
      const grabbed = await (await nut.screen.grab()).toRGB()
      let image = Jimp.fromBitmap({ width: grabbed.width, height: grabbed.height, data: Buffer.from(grabbed.data) })
      const scaleX = grabbed.width / size.width
      const scaleY = grabbed.height / size.height
      if (region !== undefined) {
        image = image.crop({
          x: Math.round(region.x * scaleX), y: Math.round(region.y * scaleY),
          w: Math.max(Math.round(region.width * scaleX), 1), h: Math.max(Math.round(region.height * scaleY), 1),
        })
      }
      const longest = Math.max(image.bitmap.width, image.bitmap.height)
      const targetEdge = region === undefined ? Math.min(longest, maxImageEdge) : Math.min(longest * 3, maxImageEdge)
      if (targetEdge !== longest) {
        const ratio = targetEdge / longest
        image = image.resize({ w: Math.round(image.bitmap.width * ratio), h: Math.round(image.bitmap.height * ratio) })
      }
      return {
        data: await image.getBuffer('image/jpeg', { quality: jpegQuality }),
        mediaType: 'image/jpeg',
        screenWidth: size.width,
        screenHeight: size.height,
      }
    },

    async click(point, { button, count }) {
      const actionType = CLICK_ACTIONS[button]?.[count]
      if (actionType === undefined) throw new Error(`unsupported click: ${button} x${count}`)
      const size = await screenSize()
      await execute(actionType, { start_box: box(point, size) }, size)
    },

    async move(point) {
      const size = await screenSize()
      await execute('mouse_move', { start_box: box(point, size) }, size)
      await sleep(POINTER_SETTLE_MS)
    },

    // The published operator predates the upstream drag fix (UI-TARS #909): it
    // presses wherever the pointer already is and stops halfway to the target.
    // This does what the fix does.
    async drag(from, to) {
      const { nut } = await runtime()
      const size = await screenSize()
      await execute('mouse_move', { start_box: box(from, size) }, size)
      await sleep(DRAG_PRESS_DELAY_MS)
      await nut.mouse.drag(nut.straightTo(new nut.Point(to.x, to.y)))
      await sleep(POINTER_SETTLE_MS)
    },

    // UI-TARS only scrolls vertically, so the wheel call itself goes through nut.js.
    async scroll(point, direction, amount) {
      const { nut } = await runtime()
      const size = await screenSize()
      await execute('mouse_move', { start_box: box(point, size) }, size)
      const units = amount * SCROLL_UNITS_PER_NOTCH
      if (direction === 'up') await nut.mouse.scrollUp(units)
      else if (direction === 'down') await nut.mouse.scrollDown(units)
      else if (direction === 'left') await nut.mouse.scrollLeft(units)
      else await nut.mouse.scrollRight(units)
      await sleep(POINTER_SETTLE_MS)
    },

    async key(combo) {
      const { nut } = await runtime()
      const keys = parseKeys(combo).map(name => nut.Key[name])
      nut.keyboard.config.autoDelayMs = KEY_DELAY_MS
      await nut.keyboard.pressKey(...keys)
      await nut.keyboard.releaseKey(...keys)
    },

    // Pastes instead of synthesizing keystrokes, which an active input method
    // would capture and turn into something else. The operator's own type action
    // logs the text and trims it, so it is not used here. A clipboard holding
    // non-text content reads back empty and cannot be restored.
    async type(text) {
      const { nut } = await runtime()
      const paste = process.platform === 'darwin' ? [nut.Key.LeftCmd, nut.Key.V] : [nut.Key.LeftControl, nut.Key.V]
      nut.keyboard.config.autoDelayMs = KEY_DELAY_MS
      const original = await nut.clipboard.getContent().catch(() => '')
      const lines = text.replace(/\r\n/g, '\n').split('\n')
      try {
        for (const [index, line] of lines.entries()) {
          if (line.length > 0) {
            await nut.clipboard.setContent(line)
            await nut.keyboard.pressKey(...paste)
            await nut.keyboard.releaseKey(...paste)
            await sleep(PASTE_SETTLE_MS)
          }
          if (index < lines.length - 1) {
            await nut.keyboard.pressKey(nut.Key.Enter)
            await nut.keyboard.releaseKey(nut.Key.Enter)
          }
        }
      } finally {
        if (original) await nut.clipboard.setContent(original).catch(() => {})
      }
    },
  }
}
