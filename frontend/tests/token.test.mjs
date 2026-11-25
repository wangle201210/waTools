import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isTokenHistory, parseSentinelHosts, parseTokenUserIDs, rememberTokenQueries } from '../src/lib/token.ts'

test('Token userIDs preserve large integers, canonicalise and deduplicate in input order', () => {
  assert.deepEqual(parseTokenUserIDs(' 101\r\n\n00202\n101\n18446744073709551615 '), ['101', '202', '18446744073709551615'])
  assert.deepEqual(parseTokenUserIDs(' \n '), [])
  for (const value of ['1 2', '1,2', '-1', '1.2', 'abc', '18446744073709551616']) assert.throws(() => parseTokenUserIDs(value))
  assert.throws(() => parseTokenUserIDs(Array.from({ length: 1001 }, (_, index) => String(index)).join('\n')))
})

test('Token history retains connection context and promotes queried users without saving token values', () => {
  const connection = { mode: 'standalone', host: 'localhost:6379', db: 0, sentinelHosts: [], masterName: '' }
  const old = rememberTokenQueries([], ['101', '202'], connection, '2026-11-25T01:00:00.000Z')
  const updated = rememberTokenQueries(old, ['202'], connection, '2026-11-25T02:00:00.000Z')
  assert.deepEqual(updated.map(entry => entry.userID), ['202', '101'])
  assert.equal(updated[0].lastQueriedAt, '2026-11-25T02:00:00.000Z')
  const anotherDB = rememberTokenQueries(updated, ['202'], { ...connection, db: 1 }, '2026-11-25T03:00:00.000Z')
  assert.equal(anotherDB.length, 3)
  assert.equal(anotherDB[0].db, 1)
  assert.equal(isTokenHistory(anotherDB), true)
  assert.equal(isTokenHistory([{ userID: '1', token: 'not-a-history-record' }]), false)
  assert.equal(updated.some(entry => Object.hasOwn(entry, 'token')), false)
})

test('Sentinel hosts accept newline or JSON arrays and history retains the full configuration', () => {
  assert.deepEqual(parseSentinelHosts('s1:26379\ns2:26379,s1:26379'), ['s1:26379', 's2:26379'])
  assert.deepEqual(parseSentinelHosts('["s1:26379","s2:26379"]'), ['s1:26379', 's2:26379'])
  assert.throws(() => parseSentinelHosts('[1]'))
  assert.throws(() => parseSentinelHosts('[invalid]'))
  const connection = { mode: 'sentinel', host: '', db: 0, sentinelHosts: ['s1:26379', 's2:26379'], masterName: 'test-master' }
  const history = rememberTokenQueries([], ['101'], connection, '2026-11-25T01:00:00Z')
  const repeated = rememberTokenQueries(history, ['101'], { ...connection, sentinelHosts: ['s2:26379', 's1:26379'] }, '2026-11-25T02:00:00Z')
  assert.equal(repeated.length, 1)
  assert.deepEqual(repeated[0].sentinelHosts, ['s2:26379', 's1:26379'])
  assert.equal(repeated[0].masterName, 'test-master')
  assert.equal(isTokenHistory(repeated), true)
})
