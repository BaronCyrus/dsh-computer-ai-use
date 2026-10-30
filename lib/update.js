import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

export const PACKAGE_NAME = 'dsh-computer-ai-use'
const REPOSITORY = 'github.com/BaronCyrus/dsh-computer-ai-use'

// pnpm's default minimumReleaseAge. pnpm accepts an exact version younger than this and records the
// exception, which suits a person pressing a button but not a background job.
export const AUTO_MIN_AGE_MS = 24 * 60 * 60_000
const CHECK_TTL_MS = 5 * 60_000
const CHECK_TIMEOUT_MS = 10_000
const INSTALL_TIMEOUT_MS = 5 * 60_000
const DRAIN_AFTER_EXIT_MS = 2_000
const LOCK_WAIT_MS = 5_000
const CONFIRM_ATTEMPTS = 3
const CONFIRM_DELAY_MS = 250

const PNPM_SCRIPT = /[\\/]pnpm\.(?:mjs|cjs)$/u
// The same names DSH's plugin manager keeps out of pnpm's environment.
const SENSITIVE_ENV = /KEY|PASSWORD|SECRET|TOKEN/iu
const RELEASE_AGE_ERROR = /ERR_PNPM_(?:NO_MATURE_MATCHING_VERSION|MINIMUM_RELEASE_AGE_VIOLATION)/u
const RELEASE_AGE_ENTRY = /\S+@\S+ was published at (\S+?), within the minimumReleaseAge cutoff \((\S+?)\)/gu
const NOT_SYNCED = /ERR_PNPM_NO_MATCHING_VERSION|\bETARGET\b|No matching version found|ERR_PNPM_FETCH_404|\bE404\b|404 Not Found|Not Found - 404/u
const UNREACHABLE = /ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_FETCH_5\d\d|ERR_PNPM_FETCH_TIMEOUT|\bENOTFOUND\b|\bECONNRESET\b|\bETIMEDOUT\b|\bECONNREFUSED\b|\bEAI_AGAIN\b|\bFETCH_ERROR\b|socket hang up/u
const REGISTRY_URL = /(?:while fetching it from|GET)\s+(https?:\/\/\S+)/u

export function readRelease(doc) {
  const version = doc?.['dist-tags']?.latest
  const manifest = doc?.versions?.[version]
  if (semver.valid(version) === null || manifest === undefined) return undefined
  const publishedAt = Date.parse(doc.time?.[version])
  return {
    version,
    manifest,
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
    deprecated: Boolean(manifest.deprecated),
    // npm refuses provenance whose source repository differs from the manifest's, so a stolen
    // publish token cannot produce a version that passes both checks.
    verified: Boolean(manifest.dist?.attestations?.provenance) && String(manifest.repository?.url ?? '').includes(REPOSITORY),
  }
}

// The rule DSH's plugin manager applies before it installs a version, and again at startup.
export function isCompatible(manifest, runtimeVersion) {
  const within = range => semver.satisfies(runtimeVersion, range, { includePrerelease: true })
  if (typeof manifest.engines?.dsh === 'string') return within(manifest.engines.dsh)
  return Object.entries(manifest.peerDependencies ?? {})
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    .every(([, range]) => within(range))
}

export function autoHold(release, { now, runtimeVersion }) {
  if (release.deprecated) return { reason: 'deprecated' }
  if (!release.verified || release.publishedAt === undefined) return { reason: 'unverified' }
  if (runtimeVersion === undefined) return { reason: 'unknown-runtime' }
  if (!isCompatible(release.manifest, runtimeVersion)) return { reason: 'incompatible' }
  const availableAt = release.publishedAt + AUTO_MIN_AGE_MS
  return now < availableAt ? { reason: 'cooling', availableAt } : undefined
}

function registryOf(line) {
  const url = REGISTRY_URL.exec(line)?.[1]
  if (url === undefined) return {}
  try {
    return { registry: new URL(url.replace(/[.,:;)\]]+$/u, '')).host }
  } catch {
    return {}
  }
}

export function classifyFailure(output, packageName, finishedAt) {
  const text = String(output ?? '').replace(/\u001b\[[0-9;]*m/gu, '')
  if (RELEASE_AGE_ERROR.test(text)) {
    let availableAt
    for (const [, published, cutoff] of text.matchAll(RELEASE_AGE_ENTRY)) {
      const clears = Date.parse(published) + (finishedAt - Date.parse(cutoff))
      if (Number.isFinite(clears) && (availableAt === undefined || clears > availableAt)) availableAt = clears
    }
    return { pending: true, ...(availableAt === undefined ? {} : { availableAt }) }
  }
  const lines = text.split('\n')
  // Another package's 404 says nothing about whether this version has reached the install source.
  const syncing = lines.find(line => NOT_SYNCED.test(line) && line.includes(packageName))
  if (syncing !== undefined) return { failed: 'syncing', ...registryOf(syncing) }
  const unreachable = lines.find(line => UNREACHABLE.test(line))
  if (unreachable !== undefined) return { failed: 'unreachable', ...registryOf(unreachable) }
  return { failed: 'failed' }
}

// How DSH's plugin manager runs the package manager the desktop app ships. `pnpm` on PATH is a .cmd
// shim on Windows, which cannot be spawned without a shell, so there the update is left to the Plugins page.
export function resolvePackageManager({ argv = process.argv, execPath = process.execPath, env = process.env, platform = process.platform } = {}) {
  const index = argv.findIndex(entry => PNPM_SCRIPT.test(entry) && existsSync(entry))
  if (index >= 0) {
    return {
      command: execPath,
      args: ['--expose-internals', argv[index]],
      env: { ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: execPath, PATH: `${argv[index + 1] ?? ''}${delimiter}${env.PATH ?? ''}` },
    }
  }
  return platform === 'win32' ? undefined : { command: 'pnpm', args: [], env: {} }
}

const readManifest = async path => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}

const classifySpec = spec => {
  if (/^(?:link|file):/u.test(spec)) return 'link'
  return /^(?:\d|[~^*])/u.test(spec) ? 'npm' : 'unknown'
}

export async function findInstall({ dshHome, packageName = PACKAGE_NAME, ownPackageJsonUrl }) {
  const own = await realpath(fileURLToPath(ownPackageJsonUrl)).catch(() => undefined)
  const entries = await readdir(join(dshHome, 'profiles'), { withFileTypes: true }).catch(() => [])
  const declared = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const profileDir = join(dshHome, 'profiles', entry.name)
    const spec = (await readManifest(join(profileDir, 'package.json')))?.dependencies?.[packageName]
    if (typeof spec !== 'string') continue
    declared.push({ kind: classifySpec(spec), profile: entry.name })
    const installed = await realpath(join(profileDir, 'node_modules', packageName, 'package.json')).catch(() => undefined)
    if (own !== undefined && installed === own) return declared.at(-1)
  }
  return declared.length === 1 ? declared[0] : { kind: 'unknown' }
}

function spawnCommand({ command, args, cwd, env }, { timeoutMs, onSpawn }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    let timedOut = false
    let drain
    const keep = chunk => { output = (output + chunk).slice(-8192) }
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    const finish = code => {
      clearTimeout(timer)
      clearTimeout(drain)
      resolve({ code: code ?? 1, output, timedOut })
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    child.once('spawn', () => onSpawn?.(child.pid))
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    // A descendant that inherited the pipes must not keep the profile locked.
    child.once('exit', code => { drain = setTimeout(() => finish(code), DRAIN_AFTER_EXIT_MS) })
    child.once('close', code => finish(code))
  })
}

// Declared as a peer, so a host without it fails the update and nothing else.
const withProfileLock = async (file, operation, options) => {
  const { withFileLock } = await import('@deepseek-ai/dsh-atomic-write')
  return withFileLock(file, operation, options)
}

const readRuntimeVersion = async () => {
  try {
    const { default: manifest } = await import('@deepseek-ai/dsh-tools/package.json', { with: { type: 'json' } })
    return semver.valid(manifest.version) ?? undefined
  } catch {
    return undefined
  }
}

const isAlive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

export function createPluginUpdater({
  packageName = PACKAGE_NAME,
  currentVersion,
  preference = { writable: false, enabled: () => false },
  ownPackageJsonUrl = new URL('../package.json', import.meta.url),
  registryUrl = `https://registry.npmjs.org/${packageName}`,
  env = process.env,
  dshHome = env.DSH_HOME || join(homedir(), '.dsh'),
  manager = resolvePackageManager({ env }),
  fetchImpl = (input, init) => globalThis.fetch(input, init),
  runCommand = spawnCommand,
  withLock = withProfileLock,
  lockWaitMs = LOCK_WAIT_MS,
  runtimeVersion = readRuntimeVersion,
  now = Date.now,
  log = () => {},
} = {}) {
  let cached
  let inflight
  let installing = false
  let lastResult

  const childEnv = {
    ...Object.fromEntries(Object.entries(env).filter(([key]) => !SENSITIVE_ENV.test(key) && !key.toUpperCase().startsWith('DSH_'))),
    ...manager?.env,
  }

  const fetchRelease = async () => {
    const response = await fetchImpl(registryUrl, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`the registry answered ${response.status}`)
    const release = readRelease(await response.json())
    if (release === undefined) throw new Error('the registry named no usable latest version')
    return release
  }

  const check = async ({ force = false } = {}) => {
    if (!force && cached !== undefined && now() - cached.fetchedAt < CHECK_TTL_MS) return cached.release
    inflight ??= fetchRelease()
      .then(release => {
        cached = { release, fetchedAt: now() }
        return release
      })
      .finally(() => { inflight = undefined })
    return inflight
  }

  const find = () => findInstall({ dshHome, packageName, ownPackageJsonUrl })
  const profileDirOf = install => join(dshHome, 'profiles', install.profile)
  const installedVersion = async install => (install.profile === undefined
    ? undefined
    : (await readManifest(join(profileDirOf(install), 'node_modules', packageName, 'package.json')))?.version)

  const status = async ({ force = false } = {}) => {
    const install = await find()
    const onDisk = await installedVersion(install)
    let release
    try {
      release = await check({ force })
    } catch (error) {
      log(`update check failed: ${error.message}`)
    }
    const baseline = semver.valid(onDisk) === null ? currentVersion : onDisk
    const updateAvailable = release !== undefined && semver.gt(release.version, baseline)
    const canInstall = install.kind === 'npm' && manager !== undefined
    const runtime = await runtimeVersion()
    return {
      current: currentVersion,
      installed: onDisk !== undefined && onDisk !== currentVersion ? onDisk : undefined,
      latest: release?.version,
      updateAvailable,
      checkFailed: release === undefined,
      install,
      canInstall,
      compatible: !updateAvailable || runtime === undefined || isCompatible(release.manifest, runtime),
      hold: updateAvailable && canInstall ? autoHold(release, { now: now(), runtimeVersion: runtime }) : undefined,
      auto: { enabled: preference.enabled(), writable: preference.writable },
      lastResult,
    }
  }

  const runPnpm = (profileDir, args, onSpawn) => runCommand(
    { command: manager.command, args: [...manager.args, ...args], cwd: profileDir, env: childEnv },
    { timeoutMs: INSTALL_TIMEOUT_MS, onSpawn },
  )

  const landed = async (profileDir, version) => {
    // A zero exit only proves the command ran: pnpm can skip a too-new version and still exit zero.
    for (let attempt = 1; attempt <= CONFIRM_ATTEMPTS; attempt += 1) {
      if ((await readManifest(join(profileDir, 'node_modules', packageName, 'package.json')))?.version === version) return true
      if (attempt < CONFIRM_ATTEMPTS) await new Promise(resolve => { setTimeout(resolve, CONFIRM_DELAY_MS) })
    }
    return false
  }

  const snapshot = profileDir => Promise.all(['package.json', 'pnpm-lock.yaml'].map(async name => {
    const path = join(profileDir, name)
    return { path, text: await readFile(path, 'utf8').catch(() => undefined) }
  }))

  const restore = saved => Promise.all(saved.map(async ({ path, text }) => {
    if (text === undefined) return rm(path, { force: true })
    if (await readFile(path, 'utf8').catch(() => undefined) !== text) await writeFile(path, text)
    return undefined
  }))

  const installVersion = async (profileDir, version) => {
    // The record lets a later DSH operation wait for this pnpm if this process ends while it runs.
    const record = join(profileDir, '.plugin-manager', 'run.json')
    try {
      return await withLock(join(profileDir, 'package.json'), async () => {
        const recorded = await readManifest(record)
        if (Number.isSafeInteger(recorded?.pid) && isAlive(recorded.pid)) return { version, failed: 'busy' }
        const saved = await snapshot(profileDir)
        await mkdir(dirname(record), { recursive: true, mode: 0o700 })
        const onSpawn = pid => writeFile(record, `${JSON.stringify({ pid, grouped: false })}\n`, { mode: 0o600 })
          .catch(error => log(`could not record the update run: ${error.message}`))
        try {
          const result = await runPnpm(profileDir, ['add', '--save-exact', `${packageName}@${version}`], onSpawn)
          if (result.code === 0 && await landed(profileDir, version)) return { version }
          log(`pnpm add ${version} failed: ${result.output.slice(-2000)}`)
          await restore(saved)
          if (!result.timedOut) return { version, ...classifyFailure(result.output, packageName, now()) }
          // A killed pnpm can leave node_modules half linked.
          const repair = await runPnpm(profileDir, ['install', '--frozen-lockfile'], onSpawn)
          if (repair.code !== 0) log(`pnpm install after a timed out update failed: ${repair.output.slice(-2000)}`)
          return { version, failed: 'unreachable' }
        } finally {
          await rm(record, { force: true })
        }
      }, { waitMs: lockWaitMs })
    } catch (error) {
      if (error.message?.includes('timed out waiting')) return { version, failed: 'busy' }
      log(`update to ${version} failed: ${error.message}`)
      return { version, failed: 'failed' }
    }
  }

  const update = async () => {
    if (installing) return { failed: 'busy' }
    installing = true
    try {
      const remember = result => {
        lastResult = { ...result, at: now() }
        return result
      }
      const install = await find()
      if (install.kind !== 'npm' || install.profile === undefined || manager === undefined) return remember({ failed: 'unsupported' })
      let release
      try {
        release = await check({ force: true })
      } catch (error) {
        log(`update check failed: ${error.message}`)
        return remember({ failed: 'unreachable' })
      }
      const baseline = await installedVersion(install) ?? currentVersion
      if (!semver.gt(release.version, baseline)) return remember({ version: baseline })
      const runtime = await runtimeVersion()
      if (runtime !== undefined && !isCompatible(release.manifest, runtime)) return remember({ version: release.version, failed: 'incompatible' })
      return remember(await installVersion(profileDirOf(install), release.version))
    } finally {
      installing = false
    }
  }

  // Returns when the held version clears, so the scheduler can come back on time.
  const tick = async () => {
    if (!preference.enabled()) return undefined
    const info = await status({ force: true })
    if (!info.updateAvailable || !info.canInstall) return undefined
    if (info.hold !== undefined) return info.hold.availableAt
    await update()
    return undefined
  }

  return Object.freeze({ status, update, tick })
}

export function startAutoUpdate(updater, { firstDelayMs = 60_000, intervalMs = 6 * 60 * 60_000, now = Date.now, log = () => {} } = {}) {
  let timer
  let stopped = false
  const schedule = delay => {
    timer = setTimeout(run, delay)
    timer.unref?.()
  }
  const run = async () => {
    let wakeAt
    try {
      wakeAt = await updater.tick()
    } catch (error) {
      log(`automatic update failed: ${error.message}`)
    }
    if (stopped) return
    schedule(typeof wakeAt === 'number' ? Math.max(firstDelayMs, Math.min(intervalMs, wakeAt - now())) : intervalMs)
  }
  schedule(firstDelayMs)
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
