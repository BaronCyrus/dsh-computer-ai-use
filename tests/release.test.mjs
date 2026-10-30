import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseReleaseNotes, readReleaseNotes } from '../scripts/release-notes.mjs'

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')

test('every release notes file names its own version and tells readers to update to it', () => {
  const files = readdirSync(new URL('../docs/releases/', import.meta.url)).filter(name => name.endsWith('.md'))
  assert.ok(files.length > 0)
  for (const name of files) {
    const version = /^v(\d+\.\d+\.\d+)\.md$/u.exec(name)?.[1]
    assert.ok(version, `${name}: notes are named v<version>.md`)
    const { title, body } = readReleaseNotes(version)
    assert.match(title, new RegExp(`^v${version.replaceAll('.', '\\.')}：\\S`, 'u'), name)
    assert.ok(body.includes(`**${version}**`), name)
  }
})

test('the version in package.json has its release notes before it can be tagged', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.doesNotThrow(() => readReleaseNotes(version))
})

test('malformed notes are refused', () => {
  assert.throws(() => parseReleaseNotes('no heading', '1.0.0'), /must start with/u)
  assert.throws(() => parseReleaseNotes('# v1.0.1：标题\n\n更新至 **1.0.0**', '1.0.0'), /titled v1\.0\.1/u)
  assert.throws(() => parseReleaseNotes('# v1.0.0：标题\n', '1.0.0'), /no body/u)
  assert.throws(() => parseReleaseNotes('# v1.0.0：标题\n\n正文', '1.0.0'), /must tell readers/u)
})

test('the tag publishes the tested tarball with GitHub OIDC, which is what gives it provenance', () => {
  assert.ok(workflow.includes('id-token: write'))
  assert.ok(workflow.includes('run: pnpm pack --pack-destination .artifacts'))
  assert.ok(workflow.includes('npm publish "${artifact:?}" --access public\n'))
  assert.ok(workflow.includes('run: pnpm run test'))
  assert.ok(workflow.includes('run: node scripts/install-check.mjs'))
  // npm treats a token as token auth and skips OIDC, which would drop the provenance automatic updates require.
  assert.equal(workflow.includes('registry-url'), false)
  assert.equal(/NODE_AUTH_TOKEN:/u.test(workflow), false)
})

test('a tag that does not match package.json or lacks notes never reaches npm', () => {
  const publish = workflow.indexOf('- name: Publish\n')
  assert.ok(workflow.indexOf('Refuse a tag that does not match package.json') < publish)
  assert.ok(workflow.indexOf('Refuse a tag without its GitHub Release notes') < publish)
})
