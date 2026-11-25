export type TimeZone = 'local' | 'utc' | 'beijing'
export type TimeUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds'
export type TimestampUnit = 'auto' | TimeUnit

const pad = (value: number, length = 2) => String(value).padStart(length, '0')
const unitDigits: Record<TimeUnit, number> = { seconds: 0, milliseconds: 3, microseconds: 6, nanoseconds: 9 }
const unitScale: Record<TimeUnit, bigint> = { seconds: 1_000_000_000n, milliseconds: 1_000_000n, microseconds: 1_000n, nanoseconds: 1n }
const maximumNanoseconds = 8_640_000_000_000_000_000_000n

// BigInt division truncates towards zero; dates before the epoch need floor division.
function floorDivide(value: bigint, divisor: bigint): bigint {
  return value / divisor - (value < 0n && value % divisor !== 0n ? 1n : 0n)
}

function dateParts(milliseconds: number, zone: TimeZone): number[] {
  const date = new Date(milliseconds + (zone === 'beijing' ? 8 * 3_600_000 : 0))
  return zone === 'local'
    ? [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]
    : [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()]
}

export function formatDate(milliseconds: number, zone: TimeZone): string {
  const parts = dateParts(milliseconds, zone)
  if (parts.some(part => !Number.isFinite(part))) throw new Error('所选时区的日期超出支持范围，请检查时间戳与单位。')
  const [year, month, day, hour, minute, second, millisecond] = parts
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millisecond, 3)}`
}

export function parseTimestamp(input: string, unit: TimestampUnit = 'auto') {
  const text = input.trim()
  if (text.length > 64 || !/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    throw new Error('请输入有效的数字时间戳，支持秒、毫秒、微秒或纳秒。')
  }
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.')
  const magnitude = BigInt(whole)
  const detectedUnit: TimeUnit = unit === 'auto'
    ? magnitude >= 100_000_000_000_000_000n ? 'nanoseconds'
      : magnitude >= 100_000_000_000_000n ? 'microseconds'
        : magnitude >= 100_000_000_000n ? 'milliseconds' : 'seconds'
    : unit
  const decimalPlaces = 9 - unitDigits[detectedUnit]
  if (fraction.slice(decimalPlaces).replace(/0/g, '')) {
    throw new Error('最多支持纳秒精度：秒 / 毫秒 / 微秒最多保留 9 / 6 / 3 位小数，纳秒请输入整数。')
  }
  const value = magnitude * unitScale[detectedUnit]
    + BigInt(fraction.slice(0, decimalPlaces).padEnd(decimalPlaces, '0') || '0')
  const nanoseconds = negative ? -value : value
  if (nanoseconds < -maximumNanoseconds || nanoseconds > maximumNanoseconds) {
    throw new Error('时间戳超出支持的日期范围，请检查所选单位。')
  }
  const precision = Math.max(3, unitDigits[detectedUnit] + fraction.replace(/0+$/, '').length)
  return { milliseconds: Number(floorDivide(nanoseconds, 1_000_000n)), nanoseconds, unit: detectedUnit, precision }
}

export function formatTimestampDate(nanoseconds: bigint, zone: TimeZone, precision = 9): string {
  const milliseconds = Number(floorDivide(nanoseconds, 1_000_000n))
  const fraction = ((nanoseconds % 1_000_000_000n + 1_000_000_000n) % 1_000_000_000n).toString().padStart(9, '0').slice(0, precision)
  return formatDate(milliseconds, zone).replace(/\.\d{3}$/, `.${fraction}`)
}

export function formatTimestampISO(nanoseconds: bigint, precision = 9): string {
  const milliseconds = Number(floorDivide(nanoseconds, 1_000_000n))
  const fraction = ((nanoseconds % 1_000_000_000n + 1_000_000_000n) % 1_000_000_000n).toString().padStart(9, '0').slice(0, precision)
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, `.${fraction}Z`)
}

export function timestampValues(nanoseconds: bigint): Record<TimeUnit, string> {
  return {
    seconds: String(floorDivide(nanoseconds, unitScale.seconds)),
    milliseconds: String(floorDivide(nanoseconds, unitScale.milliseconds)),
    microseconds: String(floorDivide(nanoseconds, unitScale.microseconds)),
    nanoseconds: String(nanoseconds),
  }
}

export function parseDate(input: string, zone: TimeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/.exec(input.trim())
  if (!match) throw new Error('请使用 YYYY-MM-DD HH:mm:ss 格式，可附加 1–9 位小数（最高纳秒精度）。')
  const fraction = (match[7] || '').padEnd(9, '0')
  const parts = match.slice(1, 7).map(value => Number(value || 0))
  parts.push(Number(fraction.slice(0, 3)))
  const [year, month, day, hour, minute, second, millisecond] = parts
  const date = new Date(0)
  if (zone === 'local') {
    date.setFullYear(year, month - 1, day)
    date.setHours(hour, minute, second, millisecond)
  } else {
    date.setUTCFullYear(year, month - 1, day)
    date.setUTCHours(hour, minute, second, millisecond)
  }
  const milliseconds = date.getTime() - (zone === 'beijing' ? 8 * 3_600_000 : 0)
  if (dateParts(milliseconds, zone).some((part, index) => part !== parts[index])) {
    throw new Error('日期不存在，请检查月、日和时间（包括夏令时）。')
  }
  return { milliseconds, nanoseconds: BigInt(milliseconds) * 1_000_000n + BigInt(fraction.slice(3)) }
}
