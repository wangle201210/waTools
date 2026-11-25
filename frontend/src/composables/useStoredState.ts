import { reactive, ref, watch } from 'vue'

export const persistenceError = ref('')
const storageErrors = new Map<string, string>()
function reportStorageError(key: string, message = '') {
  if (message) storageErrors.set(key, message)
  else storageErrors.delete(key)
  persistenceError.value = storageErrors.values().next().value || ''
}

type Validators<T> = Partial<Record<keyof T, (value: unknown) => boolean>>

// Persist only user inputs and settings, never derived values or the live clock.
export function useStoredState<T extends object>(key: string, defaults: T, validators: Validators<T> = {}): T {
  const storageKey = `watools:v1:${key}`
  const initial = { ...defaults }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const field of Object.keys(defaults) as Array<keyof T>) {
        const value = saved[field]
        const valid = validators[field] ? validators[field]!(value) : typeof value === typeof defaults[field]
        if (valid) initial[field] = value
      }
    }
  } catch {
    reportStorageError(key, '无法读取本地保存的数据，已使用默认值。请确认应用可以访问本地存储。')
  }
  const state = reactive(initial) as T
  watch(state, () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
      reportStorageError(key)
    } catch {
      reportStorageError(key, '本次修改未能保存到本机，请检查可用存储空间；当前输入仍可复制。')
    }
  }, { deep: true, flush: 'sync' })
  return state
}

export function isPanelSize(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  return typeof value === 'string' && /^\d+(?:\.\d+)?%$/.test(value) && Number.parseFloat(value) >= 25 && Number.parseFloat(value) <= 75
}
