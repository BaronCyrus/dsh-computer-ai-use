import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseKeys } from '../lib/keys.js'

test('cmd follows the platform; ctrl stays Control on macOS', () => {
  assert.deepEqual(parseKeys('cmd+s', 'darwin'), ['LeftCmd', 'S'])
  assert.deepEqual(parseKeys('cmd+s', 'win32'), ['LeftWin', 'S'])
  assert.deepEqual(parseKeys('ctrl+c', 'darwin'), ['LeftControl', 'C'])
  assert.deepEqual(parseKeys('ctrl+c', 'win32'), ['LeftControl', 'C'])
})

test('names, digits, function keys and punctuation map to nut.js Key names', () => {
  assert.deepEqual(parseKeys('Enter'), ['Enter'])
  assert.deepEqual(parseKeys('return'), ['Enter'])
  assert.deepEqual(parseKeys('ctrl + shift + t', 'win32'), ['LeftControl', 'LeftShift', 'T'])
  assert.deepEqual(parseKeys('alt+f4'), ['LeftAlt', 'F4'])
  assert.deepEqual(parseKeys('cmd+,', 'darwin'), ['LeftCmd', 'Comma'])
  assert.deepEqual(parseKeys('option+1'), ['LeftAlt', 'Num1'])
  assert.deepEqual(parseKeys('page down'), ['PageDown'])
})

test('unknown keys and malformed combos are refused', () => {
  assert.throws(() => parseKeys('cmd+nope'), /unknown key "nope"/)
  assert.throws(() => parseKeys('f25'), /unknown key/)
  assert.throws(() => parseKeys('cmd++'), /shift\+=/)
})
