export interface TokenConnection {
  mode: 'standalone' | 'sentinel'
  host: string
  db: number
  sentinelHosts: string[]
  masterName: string
}

export interface TokenHistoryEntry {
  userID: string
  host: string
  db: number
  lastQueriedAt: string
  mode?: 'standalone' | 'sentinel'
  sentinelHosts?: string[]
  masterName?: string
}

export const MAX_TOKEN_USERS = 1000

export function parseTokenUserIDs(input: string): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const [index, line] of input.split(/\r?\n/).entries()) {
    const text = line.trim()
    if (!text) continue
    const canonical = text.replace(/^0+(?=\d)/, '')
    if (!/^\d+$/.test(canonical) || canonical.length > 20 || BigInt(canonical) > 18_446_744_073_709_551_615n) {
      throw new Error(`第 ${index + 1} 行不是有效的 userID，请每行输入一个 64 位非负整数。`)
    }
    const userID = canonical
    if (!seen.has(userID)) { seen.add(userID); result.push(userID) }
  }
  if (result.length > MAX_TOKEN_USERS) throw new Error(`单次最多查询 ${MAX_TOKEN_USERS} 个 userID。`)
  return result
}

export function isTokenHistory(value: unknown): value is TokenHistoryEntry[] {
  return Array.isArray(value) && value.every(entry => entry && typeof entry === 'object'
    && typeof entry.userID === 'string' && /^\d{1,20}$/.test(entry.userID)
    && typeof entry.host === 'string' && Number.isInteger(entry.db) && entry.db >= 0 && entry.db <= 65535
    && (entry.mode === undefined || entry.mode === 'standalone' || entry.mode === 'sentinel')
    && (entry.sentinelHosts === undefined || (Array.isArray(entry.sentinelHosts) && entry.sentinelHosts.every((host: unknown) => typeof host === 'string')))
    && (entry.masterName === undefined || typeof entry.masterName === 'string')
    && typeof entry.lastQueriedAt === 'string' && Number.isFinite(Date.parse(entry.lastQueriedAt)))
}

function historyKey(entry: TokenHistoryEntry): string {
  const address = entry.mode === 'sentinel'
    ? `sentinel/${[...(entry.sentinelHosts || [])].sort().join(',')}/${entry.masterName}`
    : entry.host
  return `${address}/${entry.db}/${entry.userID}`
}

export function rememberTokenQueries(previous: TokenHistoryEntry[], userIDs: string[], connection: TokenConnection, time = new Date().toISOString()): TokenHistoryEntry[] {
  const entries = userIDs.map(userID => ({ ...connection, sentinelHosts: [...connection.sentinelHosts], userID, lastQueriedAt: time }))
  const keys = new Set(entries.map(historyKey))
  return [...entries, ...previous.filter(entry => !keys.has(historyKey(entry)))]
}

export function formatTokenSource(connection: Pick<TokenHistoryEntry, 'mode' | 'host' | 'masterName'>): string {
  return connection.mode === 'sentinel' ? `Sentinel · ${connection.masterName}` : connection.host
}

export function parseSentinelHosts(input: string): string[] {
  const text = input.trim()
  if (!text) return []
  let values: unknown = text.split(/[,\r\n]+/)
  if (text.startsWith('[')) {
    try { values = JSON.parse(text) } catch { throw new Error('Sentinel 节点 JSON 数组格式无效。') }
  }
  if (!Array.isArray(values) || !values.every(value => typeof value === 'string')) throw new Error('Sentinel 节点必须是地址字符串，每行一个或使用 JSON 数组。')
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}
