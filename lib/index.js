import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assertImageRoute } from './image-route.js'
import { createSessionGate } from './session-gate.js'
import { createComputerTools } from './tools.js'
import { createUiTarsDriver } from './ui-tars-driver.js'

export const name = 'dsh-computer-ai-use'
export const inject = ['tools', 'attachments']

export const Config = z.object({
  maxImageEdge: z.natural().min(640).max(4096).default(1568).description('Longest edge in pixels of the screenshots sent to the model.'),
  jpegQuality: z.natural().min(30).max(100).default(80).description('JPEG quality of the screenshots sent to the model.'),
  settleMs: z.natural().max(5000).default(400).description('Wait after an action before the follow-up screenshot, in milliseconds.'),
})

export function apply(ctx, config) {
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
