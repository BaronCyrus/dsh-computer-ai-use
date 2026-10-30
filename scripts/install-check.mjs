// Installs the packed plugin the way DSH's Plugins page does: the pnpm the desktop app ships, in a new
// profile with the settings DSH gives one. pnpm 11 fails here if a dependency brings an install script,
// which would stop the Plugins page install and every update.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const REPO = fileURLToPath(new URL('../', import.meta.url))
const PNPM = join(REPO, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
const pnpm = (args, cwd) => run(process.execPath, [PNPM, ...args], { cwd, maxBuffer: 16 * 1024 * 1024 })

const root = await mkdtemp(join(tmpdir(), 'dsh-install-check-'))
try {
  await pnpm(['pack', '--pack-destination', root], REPO)
  const [tarball] = (await readdir(root)).filter(name => name.endsWith('.tgz'))
  const profileDir = join(root, 'profiles', 'desktop')
  await mkdir(profileDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-check', private: true }))
  await writeFile(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  await pnpm(['add', '--save-exact', `file:${join(root, tarball)}`], profileDir)

  const installed = join(profileDir, 'node_modules', 'dsh-computer-ai-use')
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
  for (const path of [manifest.main, manifest.icon, manifest.dsh.bundle.patch, manifest.exports['./client'], 'locale/zh.json', 'locale/en.json', 'lib/update.js']) {
    if (!existsSync(join(installed, path))) throw new Error(`${path} is missing from the installed package`)
  }
  // DSH refuses the package's display metadata when locale/ holds anything but language files.
  const locale = await readdir(join(installed, 'locale'))
  if (locale.join() !== 'en.json,zh.json') throw new Error(`locale/ holds ${locale.join()}`)
  console.log(`INSTALL CHECK PASSED ${manifest.version}`)
} catch (error) {
  console.error(error.stdout ?? '', error.stderr ?? '', error.message)
  process.exitCode = 1
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
