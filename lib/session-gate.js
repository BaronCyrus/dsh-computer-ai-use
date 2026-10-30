const ACCESS_REASON = 'Let this session see your screen and control your mouse and keyboard until it ends? Screenshots go to the current model provider. 允许本会话在结束前一直查看屏幕并控制鼠标键盘吗？截图会发送给当前模型服务商。'

/**
 * Seeing the screen and driving input are one capability, granted once per
 * session. DSH approvals are one-shot, so the grant is remembered here. A
 * session whose approval policy is `never` cannot be asked, so it passes only
 * on the full-access preset, where every other tool is already unconfined.
 */
export function createSessionGate(ctx) {
  const granted = new WeakSet()
  return async function ensureAccess(exec, toolName) {
    const agent = exec.agent
    if (agent === undefined) throw new Error('computer tools need a call from a session')
    const session = agent.session
    if (granted.has(session)) return
    const approval = ctx.get('approval')
    if (approval === undefined) throw new Error('computer tools need the DSH approval service, which this profile does not mount')
    const policy = approval.overrideOf(session) ?? approval.config?.policy ?? 'ask'
    if (policy === 'never') {
      if (ctx.get('permissionPresets')?.current(session) !== 'danger-full-access') {
        throw new Error('computer access is blocked: this session disables approval prompts and is not on the full access preset. Tell the user to enable prompts or switch presets.')
      }
    } else {
      const outcome = await approval.request({
        agent, toolName, reason: ACCESS_REASON, signal: exec.signal,
        ...(exec.callId === undefined ? {} : { callId: exec.callId }),
      })
      if (outcome === 'cancelled') throw new Error('the computer access request was cancelled')
      if (outcome !== 'allowed-once') throw new Error(`the user did not allow computer access (${outcome}). Do not retry; tell the user what you needed it for.`)
    }
    granted.add(session)
  }
}
