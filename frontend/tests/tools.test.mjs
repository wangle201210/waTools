import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDate, formatTimestampDate, formatTimestampISO, parseDate, parseTimestamp, timestampValues } from '../src/lib/time.ts'
import { convertURL, restoreLogText, splitText } from '../src/lib/text.ts'

const options = { escapedNewlines: true, spaces: true, tabs: true, commas: false, semicolons: false, custom: '', trim: true, removeEmpty: true, unique: false }

test('Unix epoch, seconds, milliseconds and precise fractional seconds', () => {
  assert.equal(parseTimestamp('1700000000').nanoseconds, 1700000000000000000n)
  assert.equal(parseTimestamp('1700000000000').unit, 'milliseconds')
  assert.equal(parseTimestamp('1700000000.123').milliseconds, 1700000000123)
  assert.equal(parseTimestamp('-0.001', 'seconds').milliseconds, -1)
  assert.equal(parseTimestamp('1', 'milliseconds').milliseconds, 1)
  assert.equal(formatDate(0, 'utc'), '1970-01-01 00:00:00.000')
  assert.equal(formatDate(0, 'beijing'), '1970-01-01 08:00:00.000')
})

test('Reject invalid timestamps, unsafe range and unsupported precision', () => {
  for (const value of ['', 'abc', 'NaN', '1e10', '1700000000.0000000001']) {
    assert.throws(() => parseTimestamp(value))
  }
  assert.throws(() => parseTimestamp('8640000000000001', 'milliseconds'))
  assert.throws(() => parseTimestamp('1.1', 'nanoseconds'))
  assert.equal(parseTimestamp('1.000', 'milliseconds').milliseconds, 1)
  assert.throws(() => formatDate(8_640_000_000_000_000, 'beijing'))
})

test('Date conversion honours zone, leap years and milliseconds', () => {
  assert.equal(parseDate('1970-01-01 08:00:00', 'beijing').milliseconds, 0)
  assert.equal(parseDate('1970-01-01T00:00:00.001', 'utc').milliseconds, 1)
  assert.equal(parseDate('1969-12-31 23:59:59.999', 'utc').milliseconds, -1)
  assert.equal(formatDate(parseDate('2024-02-29 12:30:45.12', 'utc').milliseconds, 'utc'), '2024-02-29 12:30:45.120')
  assert.equal(formatDate(parseDate('0099-01-01 00:00:00', 'utc').milliseconds, 'utc'), '0099-01-01 00:00:00.000')
  for (const value of ['2025-02-29 12:00:00', '2024-02-30 12:00:00', '2024-13-01 12:00:00', '2024-01-01 24:00:00', '2024-01-01 12:60:00', 'not a date']) {
    assert.throws(() => parseDate(value, 'utc'))
  }
  const sample = '2026-11-25 12:30:45.123'
  assert.equal(formatDate(parseDate(sample, 'local').milliseconds, 'local'), sample)
})

test('URL Unicode and reserved characters round trip, plus sign is explicit', () => {
  const value = 'https://example.com?q=你好 🐱&path=a/b+c'
  assert.equal(convertURL(convertURL(value, 'encode'), 'decode'), value)
  assert.equal(convertURL('a+b%2Bc', 'decode'), 'a+b+c')
  assert.equal(convertURL('a+b%2Bc', 'decode', true), 'a b+c')
  assert.equal(convertURL('a b+c', 'encode', true), 'a+b%2Bc')
  assert.equal(convertURL('%2520', 'decode'), '%20')
  for (const invalid of ['%', '%GG', '%E4%BD', '%FF']) assert.throws(() => convertURL(invalid, 'decode'))
})

test('Log restoration preserves Go stack spaces, tabs, blank lines and source locations', () => {
  const input = String.raw`[StateMachine]panic when doTimeoutCallback, currentState: 6, stack: goroutine 21667460 [running]:\nruntime/debug.Stack()\n\t/usr/local/go/src/runtime/debug/stack.go:26 +0x5e\nexample.com/pkg.(*StateMachine).Run.func1()\n\t/app/statemachine/skeleton.go:189 +0xab\n`
  const expected = '[StateMachine]panic when doTimeoutCallback, currentState: 6, stack: goroutine 21667460 [running]:\nruntime/debug.Stack()\n\t/usr/local/go/src/runtime/debug/stack.go:26 +0x5e\nexample.com/pkg.(*StateMachine).Run.func1()\n\t/app/statemachine/skeleton.go:189 +0xab\n'
  assert.equal(restoreLogText(input), expected)
  assert.equal(restoreLogText(String.raw`a  b\r\n\t c\n\n`), 'a  b\n\t c\n\n')
  assert.equal(restoreLogText(expected), expected)
  assert.equal(restoreLogText(String.raw`keep \x41 and \u4F60`), String.raw`keep \x41 and \u4F60`)
})

test('Text splitting handles literal escapes, actual CRLF, spaces and tabs', () => {
  assert.deepEqual(splitText('apple banana\\ncherry\\r\\ndate\t葡萄　西瓜\r\npear', options), ['apple', 'banana', 'cherry', 'date', '葡萄', '西瓜', 'pear'])
  assert.deepEqual(splitText('  line one\n\tline two  ', { ...options, spaces: false, tabs: false, trim: false }), ['  line one', '\tline two  '])
  assert.deepEqual(splitText('a\n\nb\n', { ...options, removeEmpty: false }), ['a', '', 'b', ''])
  assert.deepEqual(splitText('', { ...options, removeEmpty: false }), [])
})

test('Custom separators are literal and duplicates retain first occurrence order', () => {
  assert.deepEqual(splitText('a.*b.*a.*c', { ...options, custom: '.*', unique: true }), ['a', 'b', 'c'])
  assert.deepEqual(splitText('a|b|c', { ...options, custom: '|' }), ['a', 'b', 'c'])
  assert.deepEqual(splitText('a，b,c；d;e', { ...options, commas: true, semicolons: true }), ['a', 'b', 'c', 'd', 'e'])
})

test('Microsecond and nanosecond epochs keep all digits beyond Number safe integers', () => {
  const expected = 1700000000123456789n
  for (const [text, unit] of [
    ['1700000000.123456789', 'seconds'],
    ['1700000000123.456789', 'milliseconds'],
    ['1700000000123456.789', 'microseconds'],
    ['1700000000123456789', 'nanoseconds'],
  ]) {
    const parsed = parseTimestamp(text)
    assert.equal(parsed.nanoseconds, expected)
    assert.equal(parsed.unit, unit)
    assert.equal(formatTimestampISO(parsed.nanoseconds, parsed.precision), '2023-11-14T22:13:20.123456789Z')
  }
  const micro = parseTimestamp('1700000000123456')
  assert.equal(formatTimestampDate(micro.nanoseconds, 'beijing', micro.precision), '2023-11-15 06:13:20.123456')
  assert.equal(parseTimestamp('1', 'nanoseconds').nanoseconds, 1n)
  assert.equal(parseTimestamp('1', 'microseconds').nanoseconds, 1000n)
  assert.equal(parseTimestamp('1.1', 'milliseconds').nanoseconds, 1100000n)
})

test('Nanosecond date round trip and lower-precision integer outputs', () => {
  const parsed = parseDate('2023-11-14 22:13:20.123456789', 'utc')
  assert.equal(parsed.nanoseconds, 1700000000123456789n)
  assert.equal(formatTimestampDate(parsed.nanoseconds, 'utc'), '2023-11-14 22:13:20.123456789')
  assert.deepEqual(timestampValues(parsed.nanoseconds), {
    seconds: '1700000000', milliseconds: '1700000000123', microseconds: '1700000000123456', nanoseconds: '1700000000123456789',
  })
  assert.equal(parseDate('1970-01-01 00:00:00.000000001', 'utc').nanoseconds, 1n)
  assert.throws(() => parseDate('2023-11-14 22:13:20.1234567891', 'utc'))
})

test('Negative nanoseconds floor correctly before the Unix epoch', () => {
  const parsed = parseTimestamp('-1', 'nanoseconds')
  assert.equal(parsed.milliseconds, -1)
  assert.equal(formatTimestampISO(parsed.nanoseconds), '1969-12-31T23:59:59.999999999Z')
  assert.equal(parseDate('1969-12-31 23:59:59.999999999', 'utc').nanoseconds, -1n)
  assert.deepEqual(timestampValues(-1n), { seconds: '-1', milliseconds: '-1', microseconds: '-1', nanoseconds: '-1' })
  assert.equal(parseTimestamp('-0.000000001', 'seconds').nanoseconds, -1n)
})
