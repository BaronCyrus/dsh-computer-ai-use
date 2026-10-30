import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createPluginUpdater, resolvePackageManager } from '../lib/update.js'

// The update against the pnpm the desktop app ships, a local registry and DSH's own profile lock.
const NAME = 'dsh-update-fixture'
const PNPM = fileURLToPath(new URL('../node_modules/pnpm/bin/pnpm.mjs', import.meta.url))
const OLD = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString()
const run = promisify(execFile)

let root
let server
let registry
let profileDir
let manager
const published = new Map()

const pnpm = (args, cwd) => run(process.execPath, [PNPM, ...args], { cwd, env: { ...process.env, CI: '' } })

async function publish(version, time = OLD) {
  const dir = join(root, 'fixtures', version)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: NAME, version, main: 'index.js' }))
  await writeFile(join(dir, 'index.js'), `module.exports = ${JSON.stringify(version)}\n`)
  const output = join(root, 'tarballs', version)
  await pnpm(['pack', '--pack-destination', output], dir)
  const [file] = await readdir(output)
  const tarball = await readFile(join(output, file))
  published.set(version, { tarball, time })
}

const packument = () => {
  const versions = {}
  const time = {}
  for (const [version, entry] of published) {
    time[version] = entry.time
    versions[version] = {
      name: NAME,
      version,
      main: 'index.js',
      dist: {
        tarball: `${registry}/${NAME}/-/${NAME}-${version}.tgz`,
        integrity: `sha512-${createHash('sha512').update(entry.tarball).digest('base64')}`,
      },
    }
  }
  return { name: NAME, 'dist-tags': { latest: [...published.keys()].at(-1) }, time, versions }
}

const updaterFor = (overrides = {}) => createPluginUpdater({
  packageName: NAME,
  currentVersion: '1.0.0',
  preference: { writable: true, enabled: () => true },
  dshHome: root,
  ownPackageJsonUrl: pathToFileURL(join(profileDir, 'node_modules', NAME, 'package.json')),
  registryUrl: `${registry}/${NAME}`,
  env: { ...process.env, CI: '' },
  manager,
  runtimeVersion: async () => '0.2.1-rc.5',
  ...overrides,
})

const installedVersion = async () => JSON.parse(await readFile(join(profileDir, 'node_modules', NAME, 'package.json'), 'utf8')).version
const declaredVersion = async () => JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8')).dependencies[NAME]

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-update-it-'))
  server = createServer((request, response) => {
    const tarball = /\/-\/.*-(\d+\.\d+\.\d+)\.tgz$/u.exec(request.url)
    if (tarball !== null) {
      const body = published.get(tarball[1])?.tarball
      // A version the registry lists but does not serve yet, like a mirror still syncing.
      if (body === undefined || tarball[1] === '1.2.0') return response.writeHead(404).end()
      return response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(body)
    }
    if (decodeURIComponent(request.url) === `/${NAME}`) {
      return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(packument()))
    }
    return response.writeHead(404).end()
  })
  await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve) })
  registry = `http://127.0.0.1:${server.address().port}`
  await publish('1.0.0')
  profileDir = join(root, 'profiles', 'desktop')
  await mkdir(profileDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-test', private: true }))
  const toYaml = path => JSON.stringify(path.replaceAll('\\', '/'))
  // The same settings DSH writes when it creates a profile, with caches kept out of the home directory.
  await writeFile(join(profileDir, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - .',
    '',
    'nodeLinker: hoisted',
    'autoInstallPeers: false',
    `storeDir: ${toYaml(join(root, 'store'))}`,
    `cacheDir: ${toYaml(join(root, 'cache'))}`,
    '',
  ].join('\n'))
  await writeFile(join(profileDir, '.npmrc'), `registry=${registry}/\n`)
  await pnpm(['add', '--save-exact', `${NAME}@1.0.0`], profileDir)
  manager = resolvePackageManager({ argv: ['app', 'entry', 'runtime', 'project', 'primary', PNPM, ''], execPath: process.execPath, env: process.env })
  assert.equal(manager.command, process.execPath)
})

after(async () => {
  await new Promise(resolve => { server.close(resolve) })
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
})

test('an update lands through the desktop app\'s pnpm and releases the profile', { timeout: 120_000 }, async () => {
  await publish('1.1.0')
  const updater = updaterFor()
  const before = await updater.status({ force: true })
  assert.equal(before.updateAvailable, true)
  assert.equal(before.install.kind, 'npm')
  assert.deepEqual(await updater.update(), { version: '1.1.0' })
  assert.equal(await installedVersion(), '1.1.0')
  assert.equal(await declaredVersion(), '1.1.0')
  assert.equal(existsSync(join(profileDir, 'package.json.lock')), false)
  assert.equal(existsSync(join(profileDir, '.plugin-manager', 'run.json')), false)
  // Old enough for pnpm's own policy, so the update left no exception behind.
  assert.doesNotMatch(await readFile(join(profileDir, 'pnpm-workspace.yaml'), 'utf8'), /minimumReleaseAgeExclude/u)
  assert.equal((await updater.status()).installed, '1.1.0')
})

test('an operation holding the profile lock keeps the update out', { timeout: 60_000 }, async () => {
  await publish('1.1.1')
  await writeFile(join(profileDir, 'package.json.lock'), `${process.pid}\n`)
  try {
    assert.deepEqual(await updaterFor({ lockWaitMs: 200 }).update(), { version: '1.1.1', failed: 'busy' })
    assert.equal(await installedVersion(), '1.1.0')
  } finally {
    await rm(join(profileDir, 'package.json.lock'), { force: true })
  }
})

test('a lock its holder left behind does not stop the update', { timeout: 120_000 }, async () => {
  // A process that has exited: spawned, awaited, and only then named in the lock.
  const { stdout } = await run(process.execPath, ['-p', 'process.pid'])
  await writeFile(join(profileDir, 'package.json.lock'), `${stdout.trim()}\n`)
  assert.deepEqual(await updaterFor().update(), { version: '1.1.1' })
  assert.equal(await installedVersion(), '1.1.1')
  assert.equal(existsSync(join(profileDir, 'package.json.lock')), false)
})

test('a tarball the registry does not serve yet leaves the installed version working', { timeout: 120_000 }, async () => {
  await publish('1.2.0')
  const manifest = await readFile(join(profileDir, 'package.json'), 'utf8')
  const lockfile = await readFile(join(profileDir, 'pnpm-lock.yaml'), 'utf8')
  const result = await updaterFor().update()
  assert.equal(result.version, '1.2.0')
  assert.equal(result.failed, 'syncing')
  assert.equal(await installedVersion(), '1.1.1')
  assert.equal(await readFile(join(profileDir, 'package.json'), 'utf8'), manifest)
  assert.equal(await readFile(join(profileDir, 'pnpm-lock.yaml'), 'utf8'), lockfile)
  assert.equal(existsSync(join(profileDir, 'package.json.lock')), false)
  published.delete('1.2.0')
})

test('pnpm accepts a fresh version a person asked for and records the exception', { timeout: 120_000 }, async () => {
  await publish('1.3.0', new Date().toISOString())
  const updater = updaterFor()
  await updater.tick()
  assert.equal(await installedVersion(), '1.1.1', 'the automatic path must leave a fresh, unverified release alone')
  assert.deepEqual(await updater.update(), { version: '1.3.0' })
  assert.equal(await installedVersion(), '1.3.0')
  assert.match(await readFile(join(profileDir, 'pnpm-workspace.yaml'), 'utf8'), /dsh-update-fixture@1\.3\.0/u)
})
