// Same route check as the built-in read_image tool: a screenshot is useless to
// a model that cannot read images, so say so instead of sending it blind.
export async function assertImageRoute(ctx, exec) {
  const routed = exec.agent?.session.requestHeader()?.config
  const provider = routed?.provider ?? exec.agent?.options.provider
  const model = routed?.model ?? exec.agent?.options.model
  const llm = ctx.get('llm')
  if (provider === undefined || model === undefined || llm === undefined) {
    throw new Error('computer tools could not resolve the current model route')
  }
  const info = await llm.resolveModelInfo(provider, model, exec.signal)
  if (!info.inputModalities?.includes('image')) {
    throw new Error(`model "${model}" does not accept image input, so it cannot see the screen. Tell the user to switch to a vision model.`)
  }
}
