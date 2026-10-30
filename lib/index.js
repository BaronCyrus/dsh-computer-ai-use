import { readFileSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assertImageRoute } from './image-route.js'
import { createSessionGate } from './session-gate.js'
import { CHANNEL, createSettingsRpc } from './settings-rpc.js'
import { createComputerTools } from './tools.js'
import { createUiTarsDriver } from './ui-tars-driver.js'
import { createPluginUpdater, startAutoUpdate } from './update.js'

export const name = 'dsh-computer-ai-use'
export const inject = ['tools', 'attachments']

// Read once: an update rewrites this file while the old code keeps running until DSH reopens.
const { version: currentVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// DSH writes only volatile fields from a plugin's own settings page.
const live = schema => (typeof schema.volatile === 'function' ? schema.volatile() : schema)
const readField = value => (typeof value?.get === 'function' ? value.get() : value)

export const Config = z.object({
  maxImageEdge: z.natural().min(640).max(4096).default(1568).description('Longest edge in pixels of the screenshots sent to the model.'),
  jpegQuality: z.natural().min(30).max(100).default(80).description('JPEG quality of the screenshots sent to the model.'),
  settleMs: z.natural().max(5000).default(400).description('Wait after an action before the follow-up screenshot, in milliseconds.'),
  autoUpdate: live(z.boolean().default(true)).description('Install new versions in the background. They take effect when DSH reopens.'),
})

function applySettings(ctx, config) {
  const log = message => ctx.logger?.warn?.('computer-ai-use: %s', message)
  const preference = {
    writable: false,
    enabled: () => readField(config?.autoUpdate) !== false,
  }
  ctx.inject(['settings'], settingsCtx => {
    const settings = settingsCtx.settings
    // DSH 0.1.5 writes through a settings section of its own, which this plugin does not install.
    if (typeof settings?.update !== 'function' || typeof settings.installSection === 'function' || settings.writable === false) return
    preference.writable = true
    preference.set = enabled => settings.update(ctx.fiber?.entry?.options?.id ?? 'computer-ai-use', { autoUpdate: enabled })
    // The settings section below edits this field, so DSH generates no second page for it.
    if (typeof settings.configure === 'function') {
      settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber), 'computer-ai-use: settings page policy')
    }
  })
  const updater = createPluginUpdater({ currentVersion, preference, log })
  ctx.effect(() => startAutoUpdate(updater, { log }), 'computer-ai-use: automatic update')
  const handler = createSettingsRpc({ updater, preference, log })
  // Registered with this context so that a first install mounts the channel without a restart.
  ctx.inject(['connection', 'webServer'], connectionCtx => {
    const service = connectionCtx.connection
    connectionCtx.effect(
      () => (typeof service.register === 'function'
        ? service.register(connectionCtx, CHANNEL, handler)
        : service.rpc.handle(CHANNEL, handler)),
      'computer-ai-use: settings RPC',
    )
  })
}

export function apply(ctx, config) {
  applySettings(ctx, config)
  const options = { maxImageEdge: 1568, jpegQuality: 80, settleMs: 400, ...config }
  const driver = createUiTarsDriver(options)
  const tools = createComputerTools({
    defineTool,
    driver,
    settleMs: options.settleMs,
    ensureAccess: createSessionGate(ctx),
    ensureVision: exec => assertImageRoute(ctx, exec),
    saveImage: image => ctx.get('attachments').saveImage(image),
  })
  for (const tool of tools) ctx.tools.register(tool)
}
