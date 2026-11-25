<script setup lang="ts">
import { computed, defineAsyncComponent, toRefs } from 'vue'
import { ElAlert, ElConfigProvider, ElIcon, ElMenu, ElMenuItem, ElTag } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { Clock, Link, Document, Key } from '@element-plus/icons-vue'
import { persistenceError, useStoredState } from './composables/useStoredState'
import TimestampTool from './tools/TimestampTool.vue'
import URLTool from './tools/URLTool.vue'
import TextSplitTool from './tools/TextSplitTool.vue'
const TokenTool = defineAsyncComponent(() => import('./tools/TokenTool.vue'))

const tools = [
  { id: 'timestamp', name: '时间戳转换', icon: Clock, description: '在 Unix 时间戳和日期时间之间转换。' },
  { id: 'url', name: 'URL 编解码', icon: Link, description: '解码 URL 中的文字，或将原始文字转换为 URL 编码。' },
  { id: 'token', name: 'Token 查询', icon: Key, description: '批量查询 Redis 中的用户 token，并保存 userID 查询历史。' },
  { id: 'split', name: '文本分行', icon: Document, description: '还原日志中的换行与缩进，或按分隔符整理文本。' },
]
const { activeId } = toRefs(useStoredState('app', { activeId: 'timestamp' }, { activeId: value => tools.some(tool => tool.id === value) }))
const active = computed(() => tools.find(tool => tool.id === activeId.value) || tools[0])
</script>
<template>
  <ElConfigProvider :locale="zhCn">
    <a class="skip-link" href="#main-content">跳转到工具内容</a>
    <div class="app-layout">
      <aside class="app-sidebar">
        <div class="traffic-light-space" />
        <div class="app-brand"><span class="app-logo">w.</span><span>waTools</span></div>
        <p class="menu-heading">常用工具</p>
        <ElMenu :default-active="activeId" class="tool-menu" @select="activeId = $event">
          <ElMenuItem v-for="tool in tools" :key="tool.id" :index="tool.id"><ElIcon><component :is="tool.icon" /></ElIcon><span>{{ tool.name }}</span></ElMenuItem>
        </ElMenu>
        <div class="sidebar-bottom"><ElTag type="info" effect="plain" size="small">自动保存</ElTag><span>v0.1.0</span></div>
      </aside>
      <div class="app-workspace">
        <div class="app-titlebar">waTools <span>/ {{ active.name }}</span></div>
        <main id="main-content" tabindex="-1">
          <header class="tool-header"><h1>{{ active.name }}</h1><p>{{ active.description }}</p></header>
          <ElAlert v-if="persistenceError" :title="persistenceError" type="warning" :closable="false" show-icon class="persistence-alert" />
          <TimestampTool v-show="activeId === 'timestamp'" />
          <URLTool v-show="activeId === 'url'" />
          <TokenTool v-show="activeId === 'token'" />
          <TextSplitTool v-show="activeId === 'split'" />
        </main>
      </div>
    </div>
  </ElConfigProvider>
</template>
