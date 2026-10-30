import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))

test('every file the manifest points at exists', () => {
  for (const path of [manifest.main, manifest.icon, manifest.dsh.bundle.patch, manifest.exports['./client']]) {
    assert.ok(existsSync(fileURLToPath(new URL(path, root))), path)
  }
})

test('the client declares what DSH needs to serve it', () => {
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  for (const name of manifest.dsh.client.inject) assert.ok(manifest.peerDependencies[name], `${name} must be a peer`)
})

test('the Plugins page has a title and description in both languages', async () => {
  for (const language of ['zh', 'en']) {
    const { meta } = JSON.parse(await readFile(new URL(`locale/${language}.json`, root), 'utf8'))
    assert.ok(meta.title.length > 0)
    assert.ok(meta.description.length > 0)
  }
  assert.ok(manifest.files.includes('locale/*.json'))
  assert.ok(manifest.files.includes('icon.png'))
})

// Dependencies are covered by scripts/install-check.mjs, which installs with the pnpm that would stop on them.
test('the package itself has no install script', () => {
  for (const name of ['preinstall', 'install', 'postinstall']) assert.equal(manifest.scripts[name], undefined, name)
})

test('the versions a release needs agree with package.json', async () => {
  const { latestTested, supported } = JSON.parse(await readFile(new URL('compatibility.json', root), 'utf8'))
  assert.ok(supported.includes(latestTested))
  const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8')
  assert.match(changelog, new RegExp(`^## ${manifest.version.replaceAll('.', '\\.')} `, 'mu'))
})
