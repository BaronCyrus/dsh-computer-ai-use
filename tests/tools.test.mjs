import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createComputerTools, toScreenPoint } from '../lib/tools.js'

const SCREEN = { width: 2560, height: 1440 }

function setup({ savedSize = { width: 1568, height: 882 }, access, vision } = {}) {
  const calls = []
  const state = { cursor: { x: 10, y: 10 }, size: { ...SCREEN } }
  const driver = {
    screenSize: async () => state.size,
    cursor: async () => ({ ...state.cursor }),
    assertCanControl: async () => { calls.push(['assertCanControl']) },
    capture: async options => {
      calls.push(['capture', options])
      return { data: Buffer.from('jpeg'), mediaType: 'image/jpeg', screenWidth: state.size.width, screenHeight: state.size.height }
    },
    click: async (point, options) => { calls.push(['click', point, options]); state.cursor = point },
    move: async point => { calls.push(['move', point]); state.cursor = point },
    drag: async (from, to) => { calls.push(['drag', from, to]); state.cursor = to },
    scroll: async (point, direction, amount) => { calls.push(['scroll', point, direction, amount]); state.cursor = point },
    type: async text => { calls.push(['type', text]) },
    key: async keys => { calls.push(['key', keys]) },
  }
  const saved = []
  const [screenshot, action] = createComputerTools({
    defineTool: definition => definition,
    driver,
    settleMs: 0,
    ensureAccess: access ?? (async () => {}),
    ensureVision: vision ?? (async () => {}),
    saveImage: async image => { saved.push(image); return { attachmentId: `sha256:${saved.length}`, mediaType: image.mediaType, bytes: image.data.length, ...savedSize } },
  })
  const exec = { agent: { session: {} }, signal: new AbortController().signal }
  return { screenshot, action, driver, calls, saved, state, exec }
}

test('screen mapping follows the image the model received', () => {
  const observation = { imageWidth: 1568, imageHeight: 882, screenWidth: 2560, screenHeight: 1440 }
  assert.deepEqual(toScreenPoint(observation, 784, 441), { x: 1280, y: 720 })
  assert.deepEqual(toScreenPoint(observation, 0, 0), { x: 0, y: 0 })
  assert.deepEqual(toScreenPoint(observation, 1568, 882), { x: 2559, y: 1439 })
  assert.throws(() => toScreenPoint(observation, 1569, 10), /outside/)
  assert.throws(() => toScreenPoint(observation, -1, 10), /outside/)
  assert.throws(() => toScreenPoint(observation, undefined, 10), /required/)
})

test('a screenshot reports geometry and renders the image for the model', async () => {
  const { screenshot, saved, exec } = setup()
  const value = await screenshot.execute({}, exec)
  assert.equal(saved.length, 1)
  assert.equal(value.image.width, 1568)
  assert.equal(value.screenWidth, 2560)
  assert.deepEqual([value.cursorX, value.cursorY], [10, 10])
  const content = screenshot.output.render({}, value)
  assert.equal(content[0].type, 'text')
  assert.match(content[0].text, /Image 1568x882; screen 2560x1440; pointer at screen point 10,10/)
  assert.deepEqual(content[1], { type: 'image', attachment: value.image })
})

test('actions need a prior screenshot', async () => {
  const { action, calls, exec } = setup()
  await assert.rejects(action.execute({ action: 'click', x: 1, y: 1 }, exec), /computer_screenshot first/)
  assert.deepEqual(calls.filter(([name]) => name === 'click'), [])
})

test('click scales image coordinates to screen points and returns a new observation', async () => {
  const { screenshot, action, calls, saved, exec } = setup()
  await screenshot.execute({}, exec)
  const value = await action.execute({ action: 'click', x: 784, y: 441 }, exec)
  assert.deepEqual(calls.find(([name]) => name === 'click'), ['click', { x: 1280, y: 720 }, { button: 'left', count: 1 }])
  assert.equal(saved.length, 2)
  assert.equal(value.action, 'click')
  assert.equal(value.observation.cursorX, 1280)
  assert.match(action.output.render({}, value)[0].text, /click done\. Image/)
})

test('each pointer action reaches the driver with its own options', async () => {
  const { screenshot, action, calls, exec } = setup({ savedSize: SCREEN })
  await screenshot.execute({}, exec)
  await action.execute({ action: 'double_click', x: 5, y: 6, screenshot: false }, exec)
  await action.execute({ action: 'right_click', x: 5, y: 6, screenshot: false }, exec)
  await action.execute({ action: 'middle_click', x: 5, y: 6, screenshot: false }, exec)
  await action.execute({ action: 'move', x: 7, y: 8, screenshot: false }, exec)
  await action.execute({ action: 'drag', x: 7, y: 8, toX: 20, toY: 30, screenshot: false }, exec)
  await action.execute({ action: 'scroll', x: 20, y: 30, direction: 'down', screenshot: false }, exec)
  const driven = calls.filter(([name]) => !['capture', 'assertCanControl'].includes(name))
  assert.deepEqual(driven, [
    ['click', { x: 5, y: 6 }, { button: 'left', count: 2 }],
    ['click', { x: 5, y: 6 }, { button: 'right', count: 1 }],
    ['click', { x: 5, y: 6 }, { button: 'middle', count: 1 }],
    ['move', { x: 7, y: 8 }],
    ['drag', { x: 7, y: 8 }, { x: 20, y: 30 }],
    ['scroll', { x: 20, y: 30 }, 'down', 5],
  ])
})

test('screenshot false skips the follow-up capture but keeps the drift baseline current', async () => {
  const { screenshot, action, saved, exec } = setup()
  await screenshot.execute({}, exec)
  const value = await action.execute({ action: 'move', x: 100, y: 100, screenshot: false }, exec)
  assert.deepEqual(value, { action: 'move' })
  assert.equal(saved.length, 1)
  assert.deepEqual(action.output.render({}, value), [{ type: 'text', text: 'move done.' }])
  await action.execute({ action: 'key', keys: 'enter', screenshot: false }, exec)
})

test('a pointer the user moved blocks the action until the model looks again', async () => {
  const { screenshot, action, calls, state, exec } = setup()
  await screenshot.execute({}, exec)
  state.cursor = { x: 500, y: 500 }
  await assert.rejects(action.execute({ action: 'type', text: 'hello' }, exec), /pointer moved/)
  assert.deepEqual(calls.filter(([name]) => name === 'type'), [])
  await screenshot.execute({}, exec)
  await action.execute({ action: 'type', text: 'hello' }, exec)
  assert.deepEqual(calls.filter(([name]) => name === 'type'), [['type', 'hello']])
})

test('a resized screen blocks the action until the model looks again', async () => {
  const { screenshot, action, state, exec } = setup()
  await screenshot.execute({}, exec)
  state.size = { width: 1920, height: 1080 }
  await assert.rejects(action.execute({ action: 'click', x: 1, y: 1 }, exec), /screen size changed/)
})

test('invalid arguments are refused before anything is driven', async () => {
  const { screenshot, action, calls, exec } = setup()
  await screenshot.execute({}, exec)
  await assert.rejects(action.execute({ action: 'click', x: 1 }, exec), /x and y are required/)
  await assert.rejects(action.execute({ action: 'click', x: 99999, y: 1 }, exec), /outside/)
  await assert.rejects(action.execute({ action: 'scroll', x: 1, y: 1 }, exec), /direction/)
  await assert.rejects(action.execute({ action: 'scroll', x: 1, y: 1, direction: 'up', amount: 500 }, exec), /between 1 and 50/)
  await assert.rejects(action.execute({ action: 'type', text: '' }, exec), /non-empty/)
  await assert.rejects(action.execute({ action: 'key', keys: ' ' }, exec), /needs keys/)
  await assert.rejects(action.execute({ action: 'wait', seconds: 31 }, exec), /at most 30/)
  await assert.rejects(action.execute({ action: 'teleport' }, exec), /unknown action/)
  assert.deepEqual(calls.filter(([name]) => !['capture', 'assertCanControl'].includes(name)), [])
})

test('a crop is scaled to screen points and does not replace the coordinate system', async () => {
  const { screenshot, action, calls, exec } = setup()
  await assert.rejects(screenshot.execute({ region: { x: 0, y: 0, width: 10, height: 10 } }, exec), /full computer_screenshot/)
  await screenshot.execute({}, exec)
  const crop = await screenshot.execute({ region: { x: 0, y: 0, width: 784, height: 441 } }, exec)
  assert.deepEqual(calls.filter(([name]) => name === 'capture').at(-1)[1], { region: { x: 0, y: 0, width: 1280, height: 720 } })
  assert.match(screenshot.output.render({ region: {} }, crop)[0].text, /Enlarged crop for reading only/)
  await action.execute({ action: 'click', x: 784, y: 441, screenshot: false }, exec)
  assert.deepEqual(calls.find(([name]) => name === 'click')[1], { x: 1280, y: 720 })
})

test('access and vision checks run before the screen is touched', async () => {
  const denied = setup({ access: async () => { throw new Error('denied') } })
  await assert.rejects(denied.screenshot.execute({}, denied.exec), /denied/)
  assert.deepEqual(denied.calls, [])
  const blind = setup({ vision: async () => { throw new Error('no images') } })
  await assert.rejects(blind.screenshot.execute({}, blind.exec), /no images/)
  assert.deepEqual(blind.calls, [])
})

test('an aborted call stops before driving input and during a wait', async () => {
  const { screenshot, action, calls, exec } = setup()
  await screenshot.execute({}, exec)
  const controller = new AbortController()
  const aborted = { ...exec, signal: controller.signal }
  controller.abort(new Error('stop'))
  await assert.rejects(action.execute({ action: 'click', x: 1, y: 1 }, aborted), /stop/)
  assert.deepEqual(calls.filter(([name]) => name === 'click'), [])

  const running = new AbortController()
  const waiting = action.execute({ action: 'wait', seconds: 30 }, { ...exec, signal: running.signal })
  setTimeout(() => running.abort(new Error('stop waiting')), 10)
  await assert.rejects(waiting, /stop waiting/)
})

test('sessions keep separate observations', async () => {
  const { screenshot, action, exec } = setup()
  await screenshot.execute({}, exec)
  await assert.rejects(action.execute({ action: 'key', keys: 'enter' }, { ...exec, agent: { session: {} } }), /computer_screenshot first/)
})
