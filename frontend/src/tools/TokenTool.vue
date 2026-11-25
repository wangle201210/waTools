<script setup lang="ts">
import { computed, ref, toRefs } from 'vue'
import { ElAlert, ElButton, ElCard, ElEmpty, ElForm, ElFormItem, ElInput, ElInputNumber, ElPagination, ElRadioButton, ElRadioGroup, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import CopyButton from '../components/CopyButton.vue'
import { useStoredState } from '../composables/useStoredState'
import { formatTokenSource, isTokenHistory, parseSentinelHosts, parseTokenUserIDs, rememberTokenQueries, type TokenHistoryEntry, type TokenConnection } from '../lib/token'
import { TokenService } from '../../bindings/github.com/wangle201210/waTools/be'
import type { TokenResult } from '../../bindings/github.com/wangle201210/waTools/be/models'

const { host, db, input, history, historySearch, mode, sentinelHostsText, masterName } = toRefs(useStoredState('token', {
  host: '', db: 0, input: '', history: [] as TokenHistoryEntry[], historySearch: '',
  mode: 'standalone' as 'standalone' | 'sentinel', masterName: '',
  sentinelHostsText: '',
}, {
  db: value => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 65535,
  history: isTokenHistory, mode: value => value === 'standalone' || value === 'sentinel',
}))
const loading = ref(false)
const error = ref('')
const results = ref<TokenResult[]>([])
const source = ref('')
const queried = ref(false)
const historyPage = ref(1)
const parsed = computed(() => {
  try { return { ids: parseTokenUserIDs(input.value), error: '' } }
  catch (error) { return { ids: [] as string[], error: (error as Error).message } }
})
const sentinelNodes = computed(() => {
  try { return { hosts: parseSentinelHosts(sentinelHostsText.value), error: '' } }
  catch (cause) { return { hosts: [] as string[], error: (cause as Error).message } }
})
const mapping = computed(() => results.value.filter(row => row.status === 'success').map(row => `${row.userID}: ${row.token}`).join('\n'))
const filteredHistory = computed(() => history.value.filter(entry => entry.userID.includes(historySearch.value.trim())))
const historyRows = computed(() => filteredHistory.value.slice((historyPage.value - 1) * 8, historyPage.value * 8))
const statusLabels: Record<string, string> = { success: '已找到', missing: '未找到', empty: 'Token 为空', error: '读取失败' }
const statusTypes = { success: 'success', missing: 'info', empty: 'warning', error: 'danger' } as const

async function query() {
  if (loading.value) return
  error.value = ''
  if (parsed.value.error || !parsed.value.ids.length) { error.value = parsed.value.error || '请至少输入一个 userID，每行一个。'; return }
  const address = host.value.trim()
  if (!Number.isInteger(db.value) || db.value < 0 || db.value > 65535) { error.value = '请输入有效的 Redis DB（0–65535）。'; return }
  if (mode.value === 'standalone' && !address) { error.value = '请输入 Redis 地址。'; return }
  if (mode.value === 'sentinel' && (sentinelNodes.value.error || !sentinelNodes.value.hosts.length || !masterName.value.trim())) {
    error.value = sentinelNodes.value.error || '请填写 Sentinel 节点和 Master 名称。'; return
  }
  const connection: TokenConnection = { mode: mode.value, host: address, db: db.value, sentinelHosts: [...sentinelNodes.value.hosts], masterName: masterName.value.trim() }
  const request = { ...connection, userIDs: [...parsed.value.ids] }
  history.value = rememberTokenQueries(history.value, request.userIDs, connection)
  historyPage.value = 1
  results.value = []
  queried.value = true
  source.value = `${formatTokenSource(connection)} / DB ${db.value}`
  loading.value = true
  try { results.value = await TokenService.Query(request) ?? [] }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}
function fillHistory(entry: TokenHistoryEntry, run = false) {
  if (loading.value) return
  mode.value = entry.mode || 'standalone'
  if (entry.sentinelHosts?.length) sentinelHostsText.value = entry.sentinelHosts.join('\n')
  if (entry.masterName) masterName.value = entry.masterName
  host.value = entry.host
  db.value = entry.db
  input.value = entry.userID
  if (run) void query()
}
function fillAllHistory() {
  input.value = [...new Set(filteredHistory.value.map(entry => entry.userID))].join('\n')
}
</script>
<template>
  <div class="tool-content">
    <ElCard shadow="never">
      <template #header><div class="card-heading"><span>Redis 查询</span><ElTag type="info" effect="plain">l:usr:token:{userID}</ElTag></div></template>
      <ElForm label-position="top" @submit.prevent="query">
        <ElFormItem label="连接模式"><ElRadioGroup v-model="mode" :disabled="loading"><ElRadioButton value="standalone">直连 Redis</ElRadioButton><ElRadioButton value="sentinel">Sentinel</ElRadioButton></ElRadioGroup></ElFormItem>
        <div class="token-connection"><ElFormItem v-if="mode === 'standalone'" label="Redis 地址"><ElInput id="redis-host" v-model="host" aria-label="Redis 地址" placeholder="redis.example.com:6379" :disabled="loading" clearable spellcheck="false" /></ElFormItem><ElFormItem v-else label="Master 名称"><ElInput v-model="masterName" aria-label="Sentinel Master 名称" placeholder="例如 redis-master" :disabled="loading" clearable spellcheck="false" /></ElFormItem><ElFormItem label="DB"><ElInputNumber v-model="db" aria-label="Redis DB" :min="0" :max="65535" :precision="0" :disabled="loading" controls-position="right" /></ElFormItem></div>
        <ElFormItem v-if="mode === 'sentinel'" label="Sentinel 节点（每行一个，也支持 JSON 数组）" :error="sentinelNodes.error"><ElInput v-model="sentinelHostsText" aria-label="Sentinel 节点" type="textarea" :rows="3" class="code-editor" placeholder="sentinel-1.example.com:26379&#10;sentinel-2.example.com:26379" :disabled="loading" spellcheck="false" /></ElFormItem>
        <ElFormItem label="用户 ID（每行一个）" :error="parsed.error"><ElInput id="token-userids" v-model="input" aria-label="用户 ID（每行一个）" type="textarea" :rows="5" class="code-editor" placeholder="123456&#10;234567&#10;345678" :disabled="loading" spellcheck="false" @keydown.ctrl.enter.prevent="query" @keydown.meta.enter.prevent="query" /></ElFormItem>
        <div class="tool-toolbar"><div class="token-query-actions"><ElButton type="primary" :icon="Search" :loading="loading" :disabled="!parsed.ids.length || !!parsed.error" native-type="submit">查询 token</ElButton><ElButton :disabled="loading || !input" @click="input = ''">清空输入</ElButton><span class="subtle">{{ parsed.ids.length }} 个 userID · 自动去重</span></div><span v-if="parsed.ids.length" class="subtle mono">Key 示例：l:usr:token:{{ parsed.ids[0] }}</span></div>
      </ElForm>
    </ElCard>
    <ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <ElCard shadow="never">
      <template #header><div class="card-heading"><span>查询结果 <ElTag v-if="results.length" size="small" effect="plain">{{ results.filter(row => row.status === 'success').length }} / {{ results.length }} 已找到</ElTag></span><CopyButton :value="mapping" label="复制 userID: token 映射" /></div></template>
      <p v-if="source" class="token-result-source subtle">{{ source }}</p>
      <ElTable v-if="results.length || loading" :data="results" row-key="userID" stripe table-layout="fixed" aria-label="Token 查询结果">
        <ElTableColumn prop="userID" label="userID" width="155"><template #default="{ row }"><span class="mono">{{ row.userID }}</span></template></ElTableColumn>
        <ElTableColumn prop="token" label="token" min-width="240"><template #default="{ row }"><span class="token-value mono">{{ row.token || '—' }}</span></template></ElTableColumn>
        <ElTableColumn label="状态" min-width="170"><template #default="{ row }"><ElTag :type="statusTypes[row.status as keyof typeof statusTypes] || 'info'" size="small">{{ statusLabels[row.status] || row.status }}</ElTag><p v-if="row.message" class="token-row-message">{{ row.message }}</p></template></ElTableColumn>
        <ElTableColumn label="操作" width="150" align="center" class-name="token-actions-column" fixed="right"><template #default="{ row }"><CopyButton :value="row.status === 'success' ? row.token : ''" label="复制 token" :aria-label="`复制 ${row.userID} 的 token`" /></template></ElTableColumn>
      </ElTable>
      <ElEmpty v-else :description="queried ? '本次查询没有结果' : '输入 userID 后点击查询'" :image-size="70" />
    </ElCard>
    <ElCard shadow="never">
      <template #header><div class="card-heading"><span>查询历史 <ElTag size="small" type="info" effect="plain">{{ history.length }}</ElTag></span><div class="token-history-actions"><ElInput v-model="historySearch" aria-label="搜索历史 userID" placeholder="搜索 userID" size="small" clearable @input="historyPage = 1" /><ElButton size="small" :disabled="loading || !filteredHistory.length" @click="fillAllHistory">全部填入</ElButton></div></div></template>
      <ElTable v-if="history.length" :data="historyRows" size="small" stripe aria-label="UserID 查询历史"><ElTableColumn prop="userID" label="userID" min-width="145" /><ElTableColumn label="Redis" min-width="180"><template #default="{ row }"><span class="mono">{{ formatTokenSource(row as TokenHistoryEntry) }} / {{ row.db }}</span></template></ElTableColumn><ElTableColumn label="最近查询" min-width="165"><template #default="{ row }">{{ new Date(row.lastQueriedAt).toLocaleString() }}</template></ElTableColumn><ElTableColumn label="操作" width="150" fixed="right"><template #default="{ row }"><ElButton size="small" text :disabled="loading" @click="fillHistory(row as TokenHistoryEntry)">回填</ElButton><ElButton size="small" text type="primary" :disabled="loading" @click="fillHistory(row as TokenHistoryEntry, true)">查询</ElButton></template></ElTableColumn></ElTable>
      <ElEmpty v-else description="查询过的 userID 会保存在本机，可回填或再次查询" :image-size="60" />
      <ElPagination v-if="filteredHistory.length > 8" v-model:current-page="historyPage" :page-size="8" :total="filteredHistory.length" layout="prev, pager, next, total" class="token-history-pagination" />
    </ElCard>
  </div>
</template>
