export const CHANNEL = '/computer-ai-use'

export function createSettingsRpc({ updater, preference, log = () => {} }) {
  const endpoints = {
    'update/status': payload => updater.status({ force: payload?.force === true }),
    'update/install': () => updater.update(),
    'update/auto': async payload => {
      if (!preference.writable) throw new Error('This host cannot save the setting')
      const enabled = payload?.enabled === true
      await preference.set(enabled)
      if (enabled) void updater.tick().catch(error => log(`automatic update failed: ${error.message}`))
      return { enabled }
    },
  }
  return async (endpoint, payload) => {
    const handle = Object.hasOwn(endpoints, endpoint) ? endpoints[endpoint] : undefined
    if (handle === undefined) return { ok: false, error: { message: 'Unknown endpoint' } }
    try {
      return { ok: true, value: await handle(payload) }
    } catch (error) {
      log(`${endpoint} failed: ${error.message}`)
      return { ok: false, error: { message: 'Request failed' } }
    }
  }
}
