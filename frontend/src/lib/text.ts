export function convertURL(input: string, mode: 'decode' | 'encode', formMode = false): string {
  if (mode === 'encode') {
    try {
      const result = encodeURIComponent(input)
      return formMode ? result.replace(/%20/g, '+') : result
    } catch {
      throw new Error('文字中包含无效的 Unicode 字符，请检查输入。')
    }
  }
  try {
    return decodeURIComponent(formMode ? input.replace(/\+/g, ' ') : input)
  } catch {
    throw new Error('无法解码：存在不完整的 % 转义或无效的 UTF-8 编码，请检查输入。')
  }
}

export interface SplitOptions {
  escapedNewlines: boolean
  spaces: boolean
  tabs: boolean
  commas: boolean
  semicolons: boolean
  custom: string
  trim: boolean
  removeEmpty: boolean
  unique: boolean
}

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function splitText(input: string, options: SplitOptions): string[] {
  if (!input) return []
  const patterns = ['\\r\\n?|\\n']
  if (options.custom) patterns.unshift(escapePattern(options.custom))
  if (options.escapedNewlines) patterns.push(...['\\r\\n', '\\n', '\\r'].map(escapePattern))
  if (options.spaces) patterns.push('[^\\S\\r\\n\\t]+')
  if (options.tabs) patterns.push('\\t+')
  if (options.commas) patterns.push('[,，]')
  if (options.semicolons) patterns.push('[;；]')
  let lines = input.split(new RegExp(patterns.join('|'), 'gu'))
  if (options.trim) lines = lines.map(line => line.trim())
  if (options.removeEmpty) lines = lines.filter(line => line.length > 0)
  return options.unique ? [...new Set(lines)] : lines
}

// Interpret only log formatting escapes. Preserve all other text, spaces and indentation.
export function restoreLogText(input: string): string {
  const escapes: Record<string, string> = { '\\r\\n': '\n', '\\n': '\n', '\\r': '\n', '\\t': '\t' }
  return input.replace(/\r\n?/g, '\n').replace(/\\r\\n|\\[nrt]/g, value => escapes[value])
}
