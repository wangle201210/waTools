<script setup lang="ts">
import { computed, onUnmounted, ref, toRefs } from 'vue'
import { ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElForm, ElFormItem, ElInput, ElOption, ElSelect, ElTabPane, ElTabs, ElTag } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import CopyButton from '../components/CopyButton.vue'
import { useStoredState } from '../composables/useStoredState'
import { formatDate, formatTimestampDate, formatTimestampISO, parseDate, parseTimestamp, timestampValues, type TimestampUnit, type TimeZone, type TimeUnit } from '../lib/time'

const unitLabels: Record<TimeUnit, string> = { seconds: '秒', milliseconds: '毫秒', microseconds: '微秒', nanoseconds: '纳秒' }
const units = [{ value: 'seconds', label: '秒（s）' }, { value: 'milliseconds', label: '毫秒（ms）' }, { value: 'microseconds', label: '微秒（μs）' }, { value: 'nanoseconds', label: '纳秒（ns）' }] satisfies { value: TimeUnit; label: string }[]
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, 1000)
onUnmounted(() => clearInterval(timer))
const { zone, unit, direction, timestamp, date } = toRefs(useStoredState('timestamp', {
  zone: 'local' as TimeZone, unit: 'auto' as TimestampUnit, direction: 'timestamp', timestamp: '', date: '',
}, {
  zone: value => ['local', 'utc', 'beijing'].includes(String(value)),
  unit: value => ['auto', ...units.map(item => item.value)].includes(String(value)),
  direction: value => ['timestamp', 'date'].includes(String(value)),
}))
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const currentDate = computed(() => formatDate(now.value, zone.value))
const timestampResult = computed(() => {
  if (!timestamp.value.trim()) return { error: '', date: '', iso: '', unit: '' }
  try {
    const parsed = parseTimestamp(timestamp.value, unit.value)
    return { error: '', date: formatTimestampDate(parsed.nanoseconds, zone.value, parsed.precision), iso: formatTimestampISO(parsed.nanoseconds, parsed.precision), unit: unitLabels[parsed.unit] }
  } catch (error) { return { error: (error as Error).message, date: '', iso: '', unit: '' } }
})
const dateResult = computed(() => {
  const empty = { seconds: '', milliseconds: '', microseconds: '', nanoseconds: '' }
  if (!date.value.trim()) return { error: '', ...empty }
  try {
    return { error: '', ...timestampValues(parseDate(date.value, zone.value).nanoseconds) }
  } catch (error) { return { error: (error as Error).message, ...empty } }
})
function useNow() {
  const current = BigInt(Date.now())
  timestamp.value = unit.value === 'nanoseconds' ? String(current * 1_000_000n)
    : unit.value === 'microseconds' ? String(current * 1_000n)
      : unit.value === 'milliseconds' ? String(current) : String(current / 1_000n)
}
</script>
<template>
  <div class="tool-content">
    <ElCard shadow="never" class="current-time-card">
      <div class="current-time-bar"><div><span class="subtle">当前时间</span><strong class="mono">{{ currentDate }}</strong></div><div class="current-epoch"><span class="subtle">Unix 秒</span><span class="mono">{{ Math.floor(now / 1000) }}</span><CopyButton :value="String(Math.floor(now / 1000))" label="复制当前时间戳" /></div></div>
    </ElCard>
    <ElCard shadow="never">
      <template #header><div class="card-heading"><span>时间转换</span><ElSelect v-model="zone" aria-label="转换时区" class="zone-select"><ElOption :label="`本地时区 · ${localZone}`" value="local" /><ElOption label="北京时间 · UTC+08:00" value="beijing" /><ElOption label="UTC · 世界协调时" value="utc" /></ElSelect></div></template>
      <ElTabs v-model="direction">
        <ElTabPane label="时间戳 → 日期" name="timestamp">
          <ElForm label-position="top" class="conversion-form" @submit.prevent>
            <ElFormItem label="Unix 时间戳" :error="timestampResult.error">
              <div class="field-row"><ElInput id="timestamp-input" v-model="timestamp" aria-label="Unix 时间戳" class="mono-input" placeholder="输入秒 / 毫秒 / 微秒 / 纳秒时间戳" :maxlength="64" clearable spellcheck="false" /><ElSelect v-model="unit" aria-label="时间戳单位" class="unit-select"><ElOption label="自动识别" value="auto" /><ElOption v-for="item in units" :key="item.value" :label="item.label" :value="item.value" /></ElSelect><ElButton type="primary" :icon="RefreshRight" @click="useNow">当前时间</ElButton></div>
            </ElFormItem>
            <div class="input-help"><span>自动识别常见 10 / 13 / 16 / 19 位时间戳，历史日期请手动选单位。当前时间精度为毫秒。</span><ElButton link type="primary" @click="timestamp = '1700000000'; unit = 'auto'">填入示例</ElButton></div>
          </ElForm>
          <div class="section-label">转换结果 <ElTag v-if="timestampResult.unit" size="small" type="info">按{{ timestampResult.unit }}转换</ElTag></div>
          <ElDescriptions :column="1" border :label-width="135"><ElDescriptionsItem label="所选时区"><div class="description-result"><output class="mono">{{ timestampResult.date || '—' }}</output><CopyButton :value="timestampResult.date" label="复制日期" /></div></ElDescriptionsItem><ElDescriptionsItem label="ISO 8601 · UTC"><div class="description-result"><output class="mono">{{ timestampResult.iso || '—' }}</output><CopyButton :value="timestampResult.iso" label="复制 ISO 日期" /></div></ElDescriptionsItem></ElDescriptions>
        </ElTabPane>
        <ElTabPane label="日期 → 时间戳" name="date">
          <ElForm label-position="top" class="conversion-form" @submit.prevent>
            <ElFormItem label="日期与时间" :error="dateResult.error"><div class="field-row"><ElInput id="date-input" v-model="date" aria-label="日期与时间" class="mono-input" placeholder="2026-11-25 15:30:00.123456789" clearable spellcheck="false" /><ElButton type="primary" plain :icon="RefreshRight" @click="date = currentDate">当前日期</ElButton></div></ElFormItem>
            <p class="input-help">按所选时区解释，格式为 YYYY-MM-DD HH:mm:ss，支持 1–9 位小数，最高纳秒精度。</p>
          </ElForm>
          <div class="section-label">转换结果 <span class="subtle">低精度单位向下取整</span></div>
          <ElDescriptions :column="1" border :label-width="135"><ElDescriptionsItem v-for="item in units" :key="item.value" :label="`${unitLabels[item.value]}级时间戳`"><div class="description-result"><output class="mono">{{ dateResult[item.value] || '—' }}</output><CopyButton :value="dateResult[item.value]" :label="`复制${unitLabels[item.value]}级时间戳`" /></div></ElDescriptionsItem></ElDescriptions>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>
