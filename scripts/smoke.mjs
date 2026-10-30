#!/usr/bin/env node
// Real-machine check of the UI-TARS driver, without DSH and without a model.
// Run it after installing dependencies, on each OS you care about:
//
//   node scripts/smoke.mjs [--out dir]          read-only: permissions, screen, one screenshot
//   node scripts/smoke.mjs --input [--out dir]  also drives TextEdit or Notepad
//
// --input moves the real pointer and types into the editor it opens, so leave the
// keyboard and mouse alone until it finishes. It refuses to start if the editor is
// already running, checks the front app before every step, and stops if the focus
// went anywhere else. It ends the editor without saving when done.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createUiTarsDriver, writeClipboard } from '../lib/ui-tars-driver.js'

const isMac = process.platform === 'darwin'
const withInput = process.argv.includes('--input')
const outIndex = process.argv.indexOf('--out')
const out = outIndex === -1 ? mkdtempSync(join(tmpdir(), 'computer-use-smoke-')) : process.argv[outIndex + 1]
mkdirSync(out, { recursive: true })

const driver = createUiTarsDriver()
const failures = []

async function step(label, run) {
  const started = Date.now()
  try {
    const value = await run()
    console.log(`ok   ${label} (${Date.now() - started} ms)${value === undefined ? '' : `: ${JSON.stringify(value)}`}`)
    return value
  } catch (error) {
    console.log(`FAIL ${label} (${Date.now() - started} ms): ${error.message}`)
    failures.push(label)
    return undefined
  }
}

const finish = () => {
  console.log(failures.length === 0 ? 'SMOKE PASSED' : `SMOKE FAILED: ${failures.join(', ')}`)
  process.exit(failures.length === 0 ? 0 : 1)
}

function editorIsRunning() {
  try {
    if (isMac) return execFileSync('pgrep', ['-x', 'TextEdit'], { encoding: 'utf8' }).trim() !== ''
    return /notepad\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq notepad.exe'], { encoding: 'utf8' }))
  } catch {
    return false
  }
}

async function runInputChecks(size) {
  const require = createRequire(import.meta.url)
  const nut = require('@computer-use/nut-js')
  const editor = isMac ? 'TextEdit' : 'Notepad'
  const mod = isMac ? 'cmd' : 'ctrl'

  if (editorIsRunning()) {
    console.log(`FAIL ${editor} is already running. Close it first so this check cannot touch your documents.`)
    failures.push('editor already running')
    return
  }
  if (await step('can control input', async () => { await driver.assertCanControl(); return true }) !== true) return

  const startPointer = await driver.cursor()
  const startClipboard = await nut.clipboard.getContent().catch(() => '')

  const frontIsEditor = async () => {
    if (isMac) {
      const asn = execFileSync('lsappinfo', ['front'], { encoding: 'utf8' }).trim()
      return execFileSync('lsappinfo', ['info', '-only', 'bundleid', asn], { encoding: 'utf8' }).includes('"com.apple.TextEdit"')
    }
    return /notepad|记事本/i.test(await (await nut.getActiveWindow()).title)
  }
  const inEditor = async (label, run) => {
    if (!await frontIsEditor()) throw new Error(`stopped before "${label}": ${editor} is no longer in front`)
    return step(label, run)
  }
  const shots = async (name, region) => {
    const shot = await driver.capture({ region })
    writeFileSync(join(out, `${name}.jpg`), shot.data)
    return shot.data
  }
  const copied = async () => {
    await writeClipboard(nut, '__smoke_sentinel__')
    await driver.key(`${mod}+c`)
    await sleep(300)
    return nut.clipboard.getContent()
  }

  spawn(isMac ? 'open' : 'notepad.exe', isMac ? ['-a', 'TextEdit'] : [], { detached: true, stdio: 'ignore' }).unref()
  for (let waited = 0; waited < 15_000 && !await frontIsEditor(); waited += 250) await sleep(250)
  await sleep(1000)

  try {
    if (isMac) await inEditor('new document', async () => { await driver.key('cmd+n'); await sleep(1000) })

    let window = await nut.getActiveWindow()
    let area = await window.region
    console.log(`editor window at ${area.left},${area.top} size ${area.width}x${area.height}`)
    const centerX = () => area.left + area.width / 2
    const centerY = () => area.top + area.height / 2
    if (centerX() < 0 || centerX() >= size.width || centerY() < 0 || centerY() >= size.height) {
      await inEditor('drag the window onto the primary display', async () => {
        await driver.drag({ x: Math.round(centerX()), y: area.top + 14 }, { x: 600, y: 200 })
        await sleep(800)
        window = await nut.getActiveWindow()
        area = await window.region
        return { left: area.left, top: area.top }
      })
    }
    const region = {
      x: Math.max(area.left, 0), y: Math.max(area.top, 0),
      width: Math.min(area.width, size.width - Math.max(area.left, 0)),
      height: Math.min(area.height, size.height - Math.max(area.top, 0)),
    }
    const middle = { x: Math.round(centerX()), y: Math.round(centerY()) }

    await inEditor('click the text area', () => driver.click(middle, { button: 'left', count: 1 }))
    await sleep(300)

    const firstLine = 'computer use 冒烟测试 123'
    await inEditor('type text with CJK and a newline', async () => {
      await driver.type(`${firstLine}\nsecond line`)
      await sleep(300)
    })
    await inEditor('select all and copy back the typed text', async () => {
      await driver.key(`${mod}+a`)
      await sleep(200)
      const text = (await copied()).replace(/\r\n/g, '\n')
      if (text !== `${firstLine}\nsecond line`) throw new Error(`clipboard read back ${JSON.stringify(text)}`)
      return text
    })
    await shots('1-typed', region)

    const dragged = await inEditor('drag selects part of the first line', async () => {
      // The first line's height differs by OS and toolbar, so try likely heights.
      // A click below the text clears the selection, so an old one cannot pass.
      for (const offset of isMac ? [107, 100, 115, 90, 122, 80, 70] : [60, 70, 50, 80, 90, 100, 110]) {
        const y = area.top + offset
        await driver.click({ x: area.left + 300, y: area.top + 300 }, { button: 'left', count: 1 })
        await sleep(600)
        await driver.drag({ x: area.left + 8, y }, { x: area.left + 60, y })
        await sleep(250)
        const text = await copied()
        if (text !== '__smoke_sentinel__' && text.trim().length > 0 && firstLine.startsWith(text)) return { y, selected: text }
      }
      throw new Error('no drag height selected the start of the first line')
    })
    await shots('2-dragged', region)

    await inEditor('right click opens a context menu', async () => {
      const before = await shots('3a-before-menu', region)
      await driver.click(middle, { button: 'right', count: 1 })
      await sleep(600)
      const after = await shots('3b-menu', region)
      await driver.key('esc')
      await sleep(300)
      if (before.equals(after)) throw new Error('the window did not change')
    })

    if (dragged !== undefined) {
      await inEditor('double click selects a word', async () => {
        await driver.click({ x: area.left + 300, y: dragged.y + 200 }, { button: 'left', count: 1 })
        await sleep(600)
        await driver.click({ x: area.left + 60, y: dragged.y }, { button: 'left', count: 2 })
        await sleep(300)
        const text = await copied()
        if (text === '__smoke_sentinel__' || text.trim().length === 0) throw new Error('nothing was selected')
        return text
      })
    }

    await inEditor('scroll moves long content', async () => {
      await driver.key(`${mod}+a`)
      await writeClipboard(nut, Array.from({ length: 150 }, (_, line) => `line ${line + 1}`).join('\n'))
      await driver.key(`${mod}+v`)
      await sleep(800)
      await driver.key(isMac ? 'cmd+up' : 'ctrl+home')
      await sleep(500)
      const top = await shots('4a-scroll-top', region)
      await driver.scroll(middle, 'down', 10)
      await sleep(800)
      const down = await shots('4b-scroll-down', region)
      await driver.scroll(middle, 'up', 10)
      await sleep(800)
      if (top.equals(down)) throw new Error('scrolling down did not change the window')
    })

    await inEditor('move and read the pointer back', async () => {
      const target = { x: middle.x + 37, y: middle.y + 23 }
      await driver.move(target)
      const { x, y } = await driver.cursor()
      if (Math.hypot(x - target.x, y - target.y) > 2) throw new Error(`pointer at ${x},${y}, expected ${target.x},${target.y}`)
      return { x, y }
    })
  } finally {
    // This run started the editor, so it can end it. A keyboard close would land
    // on a save prompt whose default button saves.
    await step('close the editor without saving', async () => {
      if (isMac) execFileSync('pkill', ['-x', 'TextEdit'])
      else execFileSync('taskkill', ['/IM', 'notepad.exe', '/F'])
      await sleep(1000)
      if (editorIsRunning()) throw new Error('the editor is still running')
    })
    await driver.move({ x: Math.max(startPointer.x, 0), y: Math.max(startPointer.y, 0) }).catch(() => {})
    if (startClipboard) await writeClipboard(nut, startClipboard).catch(() => {})
  }
}

console.log(`platform ${process.platform} ${process.arch}, node ${process.version}, output ${out}`)
const size = await step('screen size', () => driver.screenSize())
await step('cursor', () => driver.cursor())
await step('screenshot', async () => {
  const shot = await driver.capture()
  writeFileSync(join(out, 'screen.jpg'), shot.data)
  return { bytes: shot.data.length, screen: `${shot.screenWidth}x${shot.screenHeight}` }
})
if (withInput && size !== undefined) {
  await runInputChecks(size).catch(error => {
    console.log(`FAIL ${error.message}`)
    failures.push('input checks stopped')
  })
}
finish()
