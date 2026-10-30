import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

function loadClient() {
  let definition
  const styles = []
  const window = { __ModuleLoader__: { load: value => { definition = value } } }
  const document = {
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { append: tag => styles.push(tag) },
  }
  runInNewContext(source, { window, document })
  assert.equal(definition.id, 'dsh-computer-ai-use')
  const plugin = definition.factory(name => {
    assert.equal(name, 'react')
    return react
  })
  const copy = {}
  let registration
  let Section
  const ctx = {
    effect: run => run(),
    locale: {
      register: (namespace, value) => { copy.namespace = namespace; copy.zh = value.zh; copy.en = value.en },
      bind: () => key => copy.zh[key] ?? key,
    },
    get: name => {
      assert.equal(name, 'connection')
      return { rpc: { call: (...args) => ctx.rpc(...args) } }
    },
    slots: {
      inject: (name, run) => {
        assert.equal(name, 'settings.section')
        run()
      },
      register: (value, component) => {
        registration = value
        Section = component
      },
    },
  }
  plugin.apply(ctx)
  return { plugin, ctx, copy, styles, registration, Section }
}

const STATUS = {
  current: '0.2.0',
  latest: '0.2.0',
  updateAvailable: false,
  checkFailed: false,
  install: { kind: 'npm', profile: 'desktop' },
  canInstall: true,
  compatible: true,
  auto: { enabled: true, writable: true },
}

async function mount(handlers) {
  const client = loadClient()
  const calls = []
  client.ctx.rpc = async (channel, endpoint, payload) => {
    assert.equal(channel, '/computer-ai-use')
    // The client runs in its own realm; copy its payload into this one to compare it.
    calls.push({ endpoint, payload: { ...payload } })
    return { ok: true, value: await handlers[endpoint](payload) }
  }
  const { rpc, t } = client.registration.inject()
  let tree
  await renderer.act(async () => {
    tree = renderer.create(react.createElement(client.Section, { rpc, t }))
  })
  const text = () => {
    const parts = []
    const walk = node => {
      if (typeof node === 'string') parts.push(node)
      else node?.children?.forEach(walk)
    }
    for (const node of [tree.toJSON()].flat()) walk(node)
    return parts.join(' ')
  }
  const buttons = () => tree.root.findAllByType('button')
  const button = label => buttons().find(entry => entry.children.join('') === label)
  const toggle = () => tree.root.findByProps({ role: 'switch' })
  return { ...client, tree, calls, text, button, toggle }
}

const click = async node => {
  await renderer.act(async () => {
    await node.props.onClick()
  })
}

test('the client registers a settings section with its copy and style', () => {
  const { plugin, copy, styles, registration } = loadClient()
  assert.deepEqual([...plugin.inject], ['slots', 'locale', 'connection'])
  assert.equal(copy.namespace, 'settings.computerAiUse')
  assert.equal(styles[0].dataset.plugin, 'dsh-computer-ai-use')
  assert.equal(registration.id, 'computer-ai-use')
  assert.equal(registration.name, 'settings.section')
})

test('both languages carry the same copy, and every key the page reads exists', () => {
  const { copy } = loadClient()
  assert.deepEqual(Object.keys(copy.zh).sort(), Object.keys(copy.en).sort())
  const used = [...source.matchAll(/\bt\('(\w+)'\)/gu)].map(match => match[1])
  assert.ok(used.length > 10)
  for (const key of used) assert.ok(key in copy.zh, key)
  // Keys chosen by a condition rather than named in a t('...') call.
  for (const key of ['pending', 'pendingUntil', 'syncing', 'syncingFrom', 'unreachable', 'unreachableFrom']) assert.ok(key in copy.zh, key)
})

test('an up to date plugin shows its version and no update button', async () => {
  const page = await mount({ 'update/status': () => STATUS })
  assert.deepEqual(page.calls[0], { endpoint: 'update/status', payload: { force: false } })
  assert.match(page.text(), /v0\.2\.0/u)
  assert.match(page.text(), /已是最新版本/u)
  assert.equal(page.button('立即更新'), undefined)
  assert.equal(page.toggle().props['aria-checked'], true)
})

test('the check button forces a fresh read', async () => {
  const page = await mount({ 'update/status': () => STATUS })
  await click(page.button('检查更新'))
  assert.deepEqual(page.calls[1], { endpoint: 'update/status', payload: { force: true } })
})

test('a new version can be installed, and the page then asks for a restart', async () => {
  let status = { ...STATUS, latest: '0.3.0', updateAvailable: true, hold: { reason: 'cooling', availableAt: Date.parse('2026-11-11T08:00:00Z') } }
  const page = await mount({
    'update/status': () => status,
    'update/install': () => {
      status = { ...STATUS, latest: '0.3.0', installed: '0.3.0', lastResult: { version: '0.3.0', at: 1 } }
      return { version: '0.3.0' }
    },
  })
  assert.match(page.text(), /有新版本 v0\.3\.0/u)
  assert.match(page.text(), /发布满 24 小时后会自动安装/u)
  await click(page.button('立即更新'))
  assert.ok(page.calls.some(call => call.endpoint === 'update/install'))
  assert.match(page.text(), /已安装 v0\.3\.0，完全退出并重新打开 DSH 后生效/u)
  assert.equal(page.button('立即更新'), undefined)
})

test('the toggle saves the choice and hides what auto update would do', async () => {
  const page = await mount({
    'update/status': () => ({ ...STATUS, latest: '0.3.0', updateAvailable: true, hold: { reason: 'deprecated' } }),
    'update/auto': payload => payload,
  })
  assert.match(page.text(), /已被作者标记为废弃/u)
  await click(page.toggle())
  assert.deepEqual(page.calls.at(-1), { endpoint: 'update/auto', payload: { enabled: false } })
  assert.equal(page.toggle().props['aria-checked'], false)
  assert.doesNotMatch(page.text(), /已被作者标记为废弃/u)
})

test('every reason automatic updates hold a release is explained', async () => {
  const cases = [
    [{ reason: 'unverified' }, /官方仓库的发布流程/u],
    [{ reason: 'unknown-runtime' }, /读不到当前 DSH 的版本/u],
    [{ reason: 'deprecated' }, /标记为废弃/u],
    [{ reason: 'cooling', availableAt: Date.parse('2026-11-11T08:00:00Z') }, /发布满 24 小时/u],
  ]
  for (const [hold, expected] of cases) {
    const page = await mount({ 'update/status': () => ({ ...STATUS, latest: '0.3.0', updateAvailable: true, hold }) })
    assert.match(page.text(), expected)
    // A person can still take any of these releases.
    assert.ok(page.button('立即更新'))
  }
})

test('a version installed and waiting for a restart is not called up to date', async () => {
  const page = await mount({ 'update/status': () => ({ ...STATUS, latest: '0.3.0', installed: '0.3.0' }) })
  assert.doesNotMatch(page.text(), /已是最新版本/u)
  assert.match(page.text(), /已安装 v0\.3\.0/u)
})

test('a toggle the host cannot save is locked and says why', async () => {
  const page = await mount({ 'update/status': () => ({ ...STATUS, auto: { enabled: true, writable: false } }) })
  assert.equal(page.toggle().props.disabled, true)
  assert.match(page.text(), /cordis\.patch\.yml/u)
})

test('a failed save is reported and the toggle keeps its state', async () => {
  const page = await mount({
    'update/status': () => STATUS,
    'update/auto': () => { throw new Error('nope') },
  })
  await click(page.toggle())
  assert.equal(page.toggle().props['aria-checked'], true)
  assert.match(page.text(), /设置没有保存/u)
})

test('install kinds that cannot update here say so', async () => {
  const linked = await mount({ 'update/status': () => ({ ...STATUS, install: { kind: 'link', profile: 'desktop' }, canInstall: false }) })
  assert.match(linked.text(), /本地开发安装/u)
  const manual = await mount({ 'update/status': () => ({ ...STATUS, latest: '0.3.0', updateAvailable: true, install: { kind: 'unknown' }, canInstall: false }) })
  assert.match(manual.text(), /卸载后重新安装/u)
  assert.equal(manual.button('立即更新'), undefined)
})

test('a version that needs another DSH cannot be installed from here', async () => {
  const page = await mount({ 'update/status': () => ({ ...STATUS, latest: '0.3.0', updateAvailable: true, compatible: false, hold: { reason: 'incompatible' } }) })
  assert.match(page.text(), /需要其他版本的 DSH/u)
  assert.equal(page.button('立即更新'), undefined)
})

test('update outcomes read differently', async () => {
  const cases = [
    [{ version: '0.3.0', failed: 'syncing', registry: 'mirror.example' }, /安装源 mirror\.example 还没同步 v0\.3\.0/u],
    [{ version: '0.3.0', failed: 'syncing' }, /安装源还没同步 v0\.3\.0/u],
    [{ version: '0.3.0', failed: 'unreachable', registry: 'registry.example' }, /连不上安装源 registry\.example/u],
    [{ version: '0.3.0', failed: 'busy' }, /另一项插件操作正在进行/u],
    [{ version: '0.3.0', failed: 'failed' }, /更新没有成功/u],
    [{ version: '0.3.0', pending: true }, /发布冷却策略暂不允许安装 v0\.3\.0/u],
  ]
  for (const [lastResult, expected] of cases) {
    const page = await mount({ 'update/status': () => ({ ...STATUS, lastResult }) })
    assert.match(page.text(), expected)
  }
})

test('the page survives a host that cannot answer', async () => {
  const client = loadClient()
  client.ctx.rpc = async () => ({ ok: false, error: { message: 'Request failed' } })
  const { rpc, t } = client.registration.inject()
  let tree
  await renderer.act(async () => {
    tree = renderer.create(react.createElement(client.Section, { rpc, t }))
  })
  assert.match(JSON.stringify(tree.toJSON()), /读取版本信息失败/u)
})
