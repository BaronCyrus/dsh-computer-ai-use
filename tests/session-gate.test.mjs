import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionGate } from '../lib/session-gate.js'

function setup({ policy, override, preset, outcome = 'allowed-once', approval = true } = {}) {
  const requests = []
  const services = {
    approval: approval ? {
      config: { policy },
      overrideOf: () => override,
      request: async request => { requests.push(request); return outcome },
    } : undefined,
    permissionPresets: preset === undefined ? undefined : { current: () => preset },
  }
  const gate = createSessionGate({ get: name => services[name] })
  const exec = { agent: { session: {} }, callId: 'call-1', signal: new AbortController().signal }
  return { gate, exec, requests }
}

test('asks once per session and remembers the grant', async () => {
  const { gate, exec, requests } = setup({ policy: 'ask' })
  await gate(exec, 'computer_screenshot')
  await gate(exec, 'computer_action')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].toolName, 'computer_screenshot')
  assert.equal(requests[0].callId, 'call-1')
  // The host's button reads "allow once", so the prompt must say the grant lasts.
  assert.match(requests[0].reason, /until it ends/)
  await gate({ ...exec, agent: { session: {} } }, 'computer_screenshot')
  assert.equal(requests.length, 2)
})

test('a rejection is not remembered and tells the model not to retry', async () => {
  const { gate, exec, requests } = setup({ policy: 'ask', outcome: 'rejected' })
  await assert.rejects(gate(exec, 'computer_action'), /did not allow computer access \(rejected\). Do not retry/)
  await assert.rejects(gate(exec, 'computer_action'), /did not allow/)
  assert.equal(requests.length, 2)
})

test('a cancelled prompt fails closed', async () => {
  const { gate, exec } = setup({ policy: 'ask', outcome: 'cancelled' })
  await assert.rejects(gate(exec, 'computer_action'), /cancelled/)
})

test('policy never passes only on the full access preset, without prompting', async () => {
  const full = setup({ policy: 'never', preset: 'danger-full-access' })
  await full.gate(full.exec, 'computer_action')
  assert.equal(full.requests.length, 0)

  const confined = setup({ policy: 'never', preset: 'workspace-write' })
  await assert.rejects(confined.gate(confined.exec, 'computer_action'), /disables approval prompts/)
  assert.equal(confined.requests.length, 0)

  const unknown = setup({ policy: 'never' })
  await assert.rejects(unknown.gate(unknown.exec, 'computer_action'), /disables approval prompts/)
})

test('a session override wins over the configured policy', async () => {
  const { gate, exec, requests } = setup({ policy: 'ask', override: 'never', preset: 'danger-full-access' })
  await gate(exec, 'computer_action')
  assert.equal(requests.length, 0)
})

test('no approval service or no session fails closed', async () => {
  const missing = setup({ approval: false })
  await assert.rejects(missing.gate(missing.exec, 'computer_action'), /approval service/)
  const { gate } = setup({ policy: 'ask' })
  await assert.rejects(gate({ signal: new AbortController().signal }, 'computer_action'), /from a session/)
})
