import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import {
  AUTO_MIN_AGE_MS,
  autoHold,
  classifyFailure,
  createPluginUpdater,
  findInstall,
  isCompatible,
  readRelease,
  resolvePackageManager,
  startAutoUpdate,
} from '../lib/update.js'

const NOW = Date.parse('2026-11-10T00:00:00.000Z')
const OLD = '2026-11-01T00:00:00.000Z'
const PEERS = { '@deepseek-ai/cordis': '^4.0.1', '@deepseek-ai/dsh-tools': '>=0.1.5-rc.1 <0.3.0-0' }

const packument = ({ version = '0.3.0', time = OLD, manifest = {} } = {}) => ({
  'dist-tags': { latest: version },
  time: { [version]: time },
  versions: {
    [version]: {
      version,
      peerDependencies: PEERS,
      repository: { url: 'git+https://github.com/BaronCyrus/dsh-computer-ai-use.git' },
      dist: { attestations: { provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } },
      ...manifest,
    },
  },
})

async function makeProfile({ spec = '0.2.0', installed = '0.2.0' } = {}) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-update-'))
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const packageDir = join(profileDir, 'node_modules', 'dsh-computer-ai-use')
  await mkdir(packageDir, { recursive: true })
  const profileManifest = `${JSON.stringify({ dependencies: { 'dsh-computer-ai-use': spec } })}\n`
  await writeFile(join(profileDir, 'package.json'), profileManifest)
  await writeFile(join(profileDir, 'pnpm-lock.yaml'), 'lock: old\n')
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: 'dsh-computer-ai-use', version: installed }))
  return { dshHome, profileDir, packageDir, profileManifest, cleanup: () => rm(dshHome, { recursive: true, force: true }) }
}

function makeUpdater(profile, { doc = packument(), run, enabled = true, ...overrides } = {}) {
  const calls = []
  const runCommand = async (spec, options) => {
    calls.push(spec)
    await options.onSpawn?.(4242)
    return run === undefined ? installs(profile, '0.3.0') : run(spec, options, calls.length)
  }
  const updater = createPluginUpdater({
    currentVersion: '0.2.0',
    preference: { writable: true, enabled: () => enabled },
    dshHome: profile.dshHome,
    ownPackageJsonUrl: pathToFileURL(join(profile.packageDir, 'package.json')),
    manager: { command: 'node', args: ['pnpm.mjs'], env: { PATH: '/bundled' } },
    env: { PATH: '/usr/bin', HOME: '/home/me', HTTPS_PROXY: 'http://proxy', NPM_TOKEN: 'secret', DSH_HOME: 'x', 'my_api_key': 'secret' },
    fetchImpl: async () => ({ ok: true, json: async () => doc }),
    runCommand,
    withLock: (file, operation) => operation(),
    runtimeVersion: async () => '0.2.1-rc.5',
    now: () => NOW,
    ...overrides,
  })
  return { updater, calls }
}

const installs = async (profile, version) => {
  await writeFile(join(profile.packageDir, 'package.json'), JSON.stringify({ name: 'dsh-computer-ai-use', version }))
  await writeFile(join(profile.profileDir, 'package.json'), JSON.stringify({ dependencies: { 'dsh-computer-ai-use': version } }))
  return { code: 0, output: 'done', timedOut: false }
}

test('a release is verified only with provenance from this repository', () => {
  assert.equal(readRelease(packument()).verified, true)
  assert.equal(readRelease(packument({ manifest: { dist: {} } })).verified, false)
  assert.equal(readRelease(packument({ manifest: { repository: { url: 'git+https://github.com/someone/fork.git' } } })).verified, false)
})

test('an unusable registry answer reads as no release', () => {
  assert.equal(readRelease({}), undefined)
  assert.equal(readRelease({ 'dist-tags': { latest: 'nonsense' }, versions: {} }), undefined)
  assert.equal(readRelease({ 'dist-tags': { latest: '1.0.0' }, versions: {} }), undefined)
})

test('compatibility follows the rule of the DSH plugin manager', () => {
  assert.equal(isCompatible({ peerDependencies: PEERS }, '0.2.1-rc.5'), true)
  assert.equal(isCompatible({ peerDependencies: PEERS }, '0.3.0'), false)
  // Only DSH's own packages count; an unrelated peer range decides nothing.
  assert.equal(isCompatible({ peerDependencies: { react: '^99.0.0', '@deepseek-ai/cordis': '^99.0.0' } }, '0.2.1-rc.5'), true)
  // engines.dsh decides alone.
  assert.equal(isCompatible({ engines: { dsh: '>=0.2.0-0' }, peerDependencies: { '@deepseek-ai/dsh-tools': '<0.1.0' } }, '0.2.1-rc.5'), true)
  assert.equal(isCompatible({ engines: { dsh: '>=0.4.0' } }, '0.2.1-rc.5'), false)
})

test('automatic updates hold until a release has cleared every check', () => {
  const options = { now: NOW, runtimeVersion: '0.2.1-rc.5' }
  assert.equal(autoHold(readRelease(packument()), options), undefined)
  assert.deepEqual(autoHold(readRelease(packument({ manifest: { deprecated: 'broken' } })), options), { reason: 'deprecated' })
  assert.deepEqual(autoHold(readRelease(packument({ manifest: { dist: {} } })), options), { reason: 'unverified' })
  assert.deepEqual(autoHold(readRelease(packument()), { now: NOW }), { reason: 'unknown-runtime' })
  assert.deepEqual(autoHold(readRelease(packument()), { now: NOW, runtimeVersion: '0.3.0' }), { reason: 'incompatible' })
  const published = NOW - AUTO_MIN_AGE_MS + 1000
  assert.deepEqual(autoHold(readRelease(packument({ time: new Date(published).toISOString() })), options), { reason: 'cooling', availableAt: published + AUTO_MIN_AGE_MS })
})

test('pnpm failures are told apart', () => {
  assert.deepEqual(classifyFailure('ERR_PNPM_NO_MATURE_MATCHING_VERSION', 'pkg', NOW), { pending: true })
  const refusal = 'ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION\n  pkg@1.0.0 was published at 2026-11-09T12:00:00.000Z, within the minimumReleaseAge cutoff (2026-11-09T00:00:00.000Z)'
  assert.deepEqual(classifyFailure(refusal, 'pkg', NOW), { pending: true, availableAt: Date.parse('2026-11-10T12:00:00.000Z') })
  assert.deepEqual(classifyFailure('\u001b[31mERR_PNPM_NO_MATCHING_VERSION\u001b[39m No matching version found for pkg@9.9.9 while fetching it from https://mirror.example/', 'pkg', NOW), { failed: 'syncing', registry: 'mirror.example' })
  assert.deepEqual(classifyFailure('ERR_PNPM_FETCH_404 GET https://mirror.example/other: Not Found - 404', 'pkg', NOW), { failed: 'failed' })
  assert.deepEqual(classifyFailure('ERR_PNPM_META_FETCH_FAIL GET https://registry.example/pkg: ECONNRESET', 'pkg', NOW), { failed: 'unreachable', registry: 'registry.example' })
  assert.deepEqual(classifyFailure('ERR_PNPM_IGNORED_BUILDS', 'pkg', NOW), { failed: 'failed' })
})

test('the desktop app\'s pnpm runs the way DSH runs it', async () => {
  // argv carries no pnpm script here: only `pnpm` on PATH remains, which Windows cannot spawn without a shell.
  assert.deepEqual(resolvePackageManager({ argv: ['node', 'dsh'], platform: 'darwin' }), { command: 'pnpm', args: [], env: {} })
  assert.equal(resolvePackageManager({ argv: ['node', 'dsh'], platform: 'win32' }), undefined)
  assert.equal(resolvePackageManager({ argv: ['node', '/missing/pnpm.mjs', '/bin'], platform: 'darwin' }).command, 'pnpm')
  const dir = await mkdtemp(join(tmpdir(), 'dsh-update-pnpm-'))
  try {
    const pnpm = join(dir, 'pnpm.mjs')
    await writeFile(pnpm, '')
    const manager = resolvePackageManager({ argv: ['app', 'entry', 'runtime', 'project', 'primary', pnpm, '/runtime/bin'], execPath: '/app/electron', env: { PATH: '/usr/bin' }, platform: 'win32' })
    assert.equal(manager.command, '/app/electron')
    assert.deepEqual(manager.args, ['--expose-internals', pnpm])
    assert.equal(manager.env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(manager.env.DSH_DESKTOP_NODE_EXECUTABLE, '/app/electron')
    assert.ok(manager.env.PATH.startsWith('/runtime/bin'))
    assert.ok(manager.env.PATH.endsWith('/usr/bin'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the install kind comes from the profile that owns the running copy', async () => {
  const profile = await makeProfile()
  try {
    const own = pathToFileURL(join(profile.packageDir, 'package.json'))
    assert.deepEqual(await findInstall({ dshHome: profile.dshHome, ownPackageJsonUrl: own }), { kind: 'npm', profile: 'desktop' })
    await writeFile(join(profile.profileDir, 'package.json'), JSON.stringify({ dependencies: { 'dsh-computer-ai-use': 'link:/checkout' } }))
    assert.deepEqual(await findInstall({ dshHome: profile.dshHome, ownPackageJsonUrl: own }), { kind: 'link', profile: 'desktop' })
    await writeFile(join(profile.profileDir, 'package.json'), JSON.stringify({ dependencies: {} }))
    assert.deepEqual(await findInstall({ dshHome: profile.dshHome, ownPackageJsonUrl: own }), { kind: 'unknown' })
  } finally {
    await profile.cleanup()
  }
})

test('a symlinked package is still recognized as the running copy', { skip: process.platform === 'win32' }, async () => {
  const profile = await makeProfile({ spec: 'link:/checkout' })
  try {
    const checkout = join(profile.dshHome, 'checkout')
    await mkdir(checkout)
    await writeFile(join(checkout, 'package.json'), '{}')
    await rm(profile.packageDir, { recursive: true })
    await symlink(checkout, profile.packageDir)
    assert.deepEqual(await findInstall({ dshHome: profile.dshHome, ownPackageJsonUrl: pathToFileURL(join(checkout, 'package.json')) }), { kind: 'link', profile: 'desktop' })
  } finally {
    await profile.cleanup()
  }
})

test('status reports a newer release and what auto update will do with it', async () => {
  const profile = await makeProfile()
  try {
    const { updater } = makeUpdater(profile, { doc: packument({ time: new Date(NOW - 1000).toISOString() }) })
    const info = await updater.status()
    assert.equal(info.current, '0.2.0')
    assert.equal(info.latest, '0.3.0')
    assert.equal(info.updateAvailable, true)
    assert.equal(info.canInstall, true)
    assert.equal(info.compatible, true)
    assert.equal(info.hold.reason, 'cooling')
    assert.deepEqual(info.auto, { enabled: true, writable: true })
    assert.equal(info.installed, undefined)
  } finally {
    await profile.cleanup()
  }
})

test('status still answers when the registry cannot be reached', async () => {
  const profile = await makeProfile()
  try {
    const logs = []
    const { updater } = makeUpdater(profile, { fetchImpl: async () => { throw new Error('offline') }, log: message => logs.push(message) })
    const info = await updater.status()
    assert.equal(info.current, '0.2.0')
    assert.equal(info.latest, undefined)
    assert.equal(info.updateAvailable, false)
    assert.equal(info.checkFailed, true)
    assert.match(logs[0], /offline/u)
  } finally {
    await profile.cleanup()
  }
})

test('status never offers a downgrade', async () => {
  const profile = await makeProfile({ installed: '0.4.0' })
  try {
    const { updater } = makeUpdater(profile, { currentVersion: '0.4.0' })
    assert.equal((await updater.status()).updateAvailable, false)
  } finally {
    await profile.cleanup()
  }
})

test('a version installed on disk is reported until DSH reopens', async () => {
  const profile = await makeProfile({ installed: '0.3.0' })
  try {
    const { updater, calls } = makeUpdater(profile)
    const info = await updater.status()
    assert.equal(info.installed, '0.3.0')
    assert.equal(info.updateAvailable, false)
    await updater.tick()
    assert.equal(calls.length, 0)
  } finally {
    await profile.cleanup()
  }
})

test('update installs the exact version with a scrubbed environment and no policy bypass', async () => {
  const profile = await makeProfile()
  try {
    const { updater, calls } = makeUpdater(profile)
    assert.deepEqual(await updater.update(), { version: '0.3.0' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].command, 'node')
    assert.deepEqual(calls[0].args, ['pnpm.mjs', 'add', '--save-exact', 'dsh-computer-ai-use@0.3.0'])
    assert.equal(calls[0].cwd, profile.profileDir)
    assert.equal(calls[0].args.some(arg => arg.includes('minimumReleaseAge')), false)
    assert.deepEqual(calls[0].env, { PATH: '/bundled', HOME: '/home/me', HTTPS_PROXY: 'http://proxy' })
    assert.equal((await updater.status()).installed, '0.3.0')
  } finally {
    await profile.cleanup()
  }
})

test('the update holds the profile lock and leaves no run record behind', async () => {
  const profile = await makeProfile()
  try {
    const locked = []
    let recordDuring
    const { updater } = makeUpdater(profile, {
      withLock: async (file, operation) => {
        locked.push(file)
        return operation()
      },
      run: async () => {
        recordDuring = JSON.parse(await readFile(join(profile.profileDir, '.plugin-manager', 'run.json'), 'utf8'))
        return installs(profile, '0.3.0')
      },
    })
    await updater.update()
    assert.deepEqual(locked, [join(profile.profileDir, 'package.json')])
    assert.deepEqual(recordDuring, { pid: 4242, grouped: false })
    await assert.rejects(readFile(join(profile.profileDir, '.plugin-manager', 'run.json')), { code: 'ENOENT' })
  } finally {
    await profile.cleanup()
  }
})

test('a run another operation recorded keeps the profile untouched', async () => {
  const profile = await makeProfile()
  try {
    await mkdir(join(profile.profileDir, '.plugin-manager'))
    await writeFile(join(profile.profileDir, '.plugin-manager', 'run.json'), JSON.stringify({ pid: process.pid, grouped: false }))
    const { updater, calls } = makeUpdater(profile)
    assert.deepEqual(await updater.update(), { version: '0.3.0', failed: 'busy' })
    assert.equal(calls.length, 0)
  } finally {
    await profile.cleanup()
  }
})

test('a lock another operation holds reads as busy', async () => {
  const profile = await makeProfile()
  try {
    const { updater, calls } = makeUpdater(profile, { withLock: async () => { throw new Error('atomic-write: timed out waiting for the writer lock at x') } })
    assert.deepEqual(await updater.update(), { version: '0.3.0', failed: 'busy' })
    assert.equal(calls.length, 0)
  } finally {
    await profile.cleanup()
  }
})

test('a failed install restores the profile files', async () => {
  const profile = await makeProfile()
  try {
    const { updater } = makeUpdater(profile, {
      run: async () => {
        await writeFile(join(profile.profileDir, 'package.json'), 'half written')
        await writeFile(join(profile.profileDir, 'pnpm-lock.yaml'), 'half written')
        return { code: 1, output: 'ERR_PNPM_FETCH_404 GET https://mirror.example/dsh-computer-ai-use/-/dsh-computer-ai-use-0.3.0.tgz: Not Found - 404', timedOut: false }
      },
    })
    assert.deepEqual(await updater.update(), { version: '0.3.0', failed: 'syncing', registry: 'mirror.example' })
    assert.equal(await readFile(join(profile.profileDir, 'package.json'), 'utf8'), profile.profileManifest)
    assert.equal(await readFile(join(profile.profileDir, 'pnpm-lock.yaml'), 'utf8'), 'lock: old\n')
  } finally {
    await profile.cleanup()
  }
})

test('a zero exit that landed nothing is a failure', async () => {
  const profile = await makeProfile()
  try {
    const { updater } = makeUpdater(profile, { run: async () => ({ code: 0, output: '', timedOut: false }) })
    assert.deepEqual(await updater.update(), { version: '0.3.0', failed: 'failed' })
  } finally {
    await profile.cleanup()
  }
})

test('a hung install is repaired from the restored lockfile', async () => {
  const profile = await makeProfile()
  try {
    const { updater, calls } = makeUpdater(profile, {
      run: async (spec, options, count) => (count === 1
        ? { code: 1, output: '', timedOut: true }
        : { code: 0, output: '', timedOut: false }),
    })
    assert.deepEqual(await updater.update(), { version: '0.3.0', failed: 'unreachable' })
    assert.deepEqual(calls[1].args, ['pnpm.mjs', 'install', '--frozen-lockfile'])
  } finally {
    await profile.cleanup()
  }
})

test('update refuses what the plugin manager would refuse, and local checkouts', async () => {
  const profile = await makeProfile()
  try {
    const incompatible = makeUpdater(profile, { doc: packument({ manifest: { peerDependencies: { '@deepseek-ai/dsh-tools': '>=0.4.0' } } }) })
    assert.deepEqual(await incompatible.updater.update(), { version: '0.3.0', failed: 'incompatible' })
    assert.equal(incompatible.calls.length, 0)
    await writeFile(join(profile.profileDir, 'package.json'), JSON.stringify({ dependencies: { 'dsh-computer-ai-use': 'link:/checkout' } }))
    const linked = makeUpdater(profile)
    assert.deepEqual(await linked.updater.update(), { failed: 'unsupported' })
    assert.equal(linked.calls.length, 0)
  } finally {
    await profile.cleanup()
  }
})

test('a person may install a release automatic updates are still holding', async () => {
  const profile = await makeProfile()
  try {
    const { updater, calls } = makeUpdater(profile, { doc: packument({ time: new Date(NOW - 1000).toISOString(), manifest: { dist: {} } }) })
    assert.deepEqual(await updater.update(), { version: '0.3.0' })
    assert.equal(calls.length, 1)
  } finally {
    await profile.cleanup()
  }
})

test('a pnpm release age refusal is reported as pending', async () => {
  const profile = await makeProfile()
  try {
    const { updater } = makeUpdater(profile, { run: async () => ({ code: 1, output: 'ERR_PNPM_NO_MATURE_MATCHING_VERSION', timedOut: false }) })
    const result = await updater.update()
    assert.deepEqual(result, { version: '0.3.0', pending: true })
    const { lastResult } = await updater.status()
    assert.equal(lastResult.pending, true)
    assert.equal(lastResult.at, NOW)
  } finally {
    await profile.cleanup()
  }
})

test('the automatic path installs only a cleared release and only when enabled', async () => {
  const profile = await makeProfile()
  try {
    const off = makeUpdater(profile, { enabled: false })
    assert.equal(await off.updater.tick(), undefined)
    assert.equal(off.calls.length, 0)

    const published = NOW - 1000
    const cooling = makeUpdater(profile, { doc: packument({ time: new Date(published).toISOString() }) })
    assert.equal(await cooling.updater.tick(), published + AUTO_MIN_AGE_MS)
    assert.equal(cooling.calls.length, 0)

    const unverified = makeUpdater(profile, { doc: packument({ manifest: { dist: {} } }) })
    await unverified.updater.tick()
    assert.equal(unverified.calls.length, 0)

    const ready = makeUpdater(profile)
    await ready.updater.tick()
    assert.equal(ready.calls.length, 1)
    assert.equal((await ready.updater.status()).installed, '0.3.0')
  } finally {
    await profile.cleanup()
  }
})

test('the scheduler ticks after the first delay, then on the interval, and stops', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    let ticks = 0
    const stop = startAutoUpdate({ tick: async () => { ticks += 1 } }, { firstDelayMs: 1000, intervalMs: 5000, now: () => NOW })
    assert.equal(ticks, 0)
    mock.timers.tick(1000)
    assert.equal(ticks, 1)
    await new Promise(resolve => { setImmediate(resolve) })
    mock.timers.tick(5000)
    assert.equal(ticks, 2)
    await new Promise(resolve => { setImmediate(resolve) })
    stop()
    mock.timers.tick(50_000)
    assert.equal(ticks, 2)
  } finally {
    mock.timers.reset()
  }
})

test('the scheduler comes back when a held release clears and survives a failed tick', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    let ticks = 0
    const logs = []
    const stop = startAutoUpdate({
      tick: async () => {
        ticks += 1
        if (ticks === 1) return NOW + 2000
        if (ticks === 2) throw new Error('boom')
        return undefined
      },
    }, { firstDelayMs: 1000, intervalMs: 50_000, now: () => NOW, log: message => logs.push(message) })
    mock.timers.tick(1000)
    await new Promise(resolve => { setImmediate(resolve) })
    mock.timers.tick(2000)
    assert.equal(ticks, 2)
    await new Promise(resolve => { setImmediate(resolve) })
    assert.match(logs[0], /boom/u)
    mock.timers.tick(50_000)
    assert.equal(ticks, 3)
    stop()
  } finally {
    mock.timers.reset()
  }
})
