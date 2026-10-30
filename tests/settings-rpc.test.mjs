import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSettingsRpc } from '../lib/settings-rpc.js'

const makeRpc = ({ writable = true, set = async () => {}, status = async options => ({ options }) } = {}) => {
  const ticks = []
  const logs = []
  const rpc = createSettingsRpc({
    updater: { status, update: async () => ({ version: '1.0.0' }), tick: async () => { ticks.push(true) } },
    preference: { writable, set },
    log: message => logs.push(message),
  })
  return { rpc, ticks, logs }
}

test('status passes on whether the caller asked for a fresh read', async () => {
  const { rpc } = makeRpc()
  assert.deepEqual(await rpc('update/status', { force: true }), { ok: true, value: { options: { force: true } } })
  assert.deepEqual(await rpc('update/status', {}), { ok: true, value: { options: { force: false } } })
})

test('install answers with the update result', async () => {
  const { rpc } = makeRpc()
  assert.deepEqual(await rpc('update/install', {}), { ok: true, value: { version: '1.0.0' } })
})

test('turning automatic updates on checks right away, and off does not', async () => {
  const saved = []
  const { rpc, ticks } = makeRpc({ set: async value => { saved.push(value) } })
  assert.deepEqual(await rpc('update/auto', { enabled: true }), { ok: true, value: { enabled: true } })
  assert.deepEqual(await rpc('update/auto', { enabled: false }), { ok: true, value: { enabled: false } })
  assert.deepEqual(saved, [true, false])
  assert.equal(ticks.length, 1)
})

test('a host that cannot save the setting refuses the change', async () => {
  const { rpc } = makeRpc({ writable: false })
  assert.deepEqual(await rpc('update/auto', { enabled: true }), { ok: false, error: { message: 'Request failed' } })
})

test('errors stay on the host and unknown endpoints are refused', async () => {
  const { rpc, logs } = makeRpc({ status: async () => { throw new Error('pnpm said /Users/me/secret') } })
  assert.deepEqual(await rpc('update/status', {}), { ok: false, error: { message: 'Request failed' } })
  assert.match(logs[0], /secret/u)
  assert.deepEqual(await rpc('constructor', {}), { ok: false, error: { message: 'Unknown endpoint' } })
})
