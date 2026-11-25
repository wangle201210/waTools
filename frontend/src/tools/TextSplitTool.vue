<script setup lang="ts">
import { computed, onUnmounted, ref, toRefs } from 'vue'
import { ElAlert, ElButton, ElCard, ElCheckbox, ElDivider, ElInput, ElSegmented, ElSplitter, ElSplitterPanel, ElTag } from 'element-plus'
import CopyButton from '../components/CopyButton.vue'
import { isPanelSize, useStoredState } from '../composables/useStoredState'
import { restoreLogText, splitText, type SplitOptions } from '../lib/text'

const mediaQuery = window.matchMedia('(max-width: 760px)')
const compact = ref(mediaQuery.matches)
const updateCompact = () => { compact.value = mediaQuery.matches }
mediaQuery.addEventListener('change', updateCompact)
onUnmounted(() => mediaQuery.removeEventListener('change', updateCompact))
const { input, mode, leftSize, rightSize } = toRefs(useStoredState('text', {
  input: '', mode: 'log' as 'log' | 'split', leftSize: '50%' as string | number, rightSize: '50%' as string | number,
}, { mode: value => ['log', 'split'].includes(String(value)), leftSize: isPanelSize, rightSize: isPanelSize }))
function resetSizes() { leftSize.value = '50%'; rightSize.value = '50%' }
function rememberRatio(_index: number, sizes: number[]) {
  const total = sizes[0] + sizes[1]
  if (total > 0) { leftSize.value = `${sizes[0] / total * 100}%`; rightSize.value = `${sizes[1] / total * 100}%` }
}
const modes = [{ label: '日志还原', value: 'log' }, { label: '按分隔符分行', value: 'split' }]
const options = useStoredState<SplitOptions>('text-options', { escapedNewlines: true, spaces: true, tabs: true, commas: false, semicolons: false, custom: '', trim: true, removeEmpty: true, unique: false })
const output = computed(() => mode.value === 'log' ? restoreLogText(input.value) : splitText(input.value, options).join('\n'))
const lineCount = computed(() => output.value ? output.value.split('\n').length : 0)
const separators = [
  { key: 'escapedNewlines', label: '字面量 \\n / \\r\\n' },
  { key: 'spaces', label: '空格' },
  { key: 'tabs', label: 'Tab 制表符' },
  { key: 'commas', label: '逗号 , ，' },
  { key: 'semicolons', label: '分号 ; ；' },
] as const
function example() {
  input.value = mode.value === 'log'
    ? '[StateMachine] panic when doTimeoutCallback, currentState: 6, stack: goroutine 123 [running]:\\nruntime/debug.Stack()\\n\\t/usr/local/go/src/runtime/debug/stack.go:26 +0x5e\\nexample.com/app.(*StateMachine).Run()\\n\\t/app/statemachine.go:180 +0xf0\\n'
    : 'apple banana\\ncherry\\r\\ndate\t葡萄  西瓜'
}
</script>
<template>
  <div class="tool-content">
    <div class="tool-toolbar"><ElSegmented v-model="mode" :options="modes" aria-label="文本处理模式" /><span class="subtle">实时转换</span></div>
    <ElAlert v-if="mode === 'log'" type="info" :closable="false" show-icon title="日志还原会保留普通空格和堆栈缩进"><template #default>将字面量 <code>\n</code> / <code>\r\n</code> 还原为换行，<code>\t</code> 还原为 Tab，不拆分普通空格。</template></ElAlert>
    <ElCard v-else shadow="never" class="options-card">
      <div class="section-label">分隔符 <span class="subtle">原有换行始终保留</span></div>
      <div class="checkbox-row"><ElCheckbox v-for="separator in separators" :key="separator.key" v-model="options[separator.key]" border>{{ separator.label }}</ElCheckbox></div>
      <div class="custom-delimiter"><label for="custom-separator">自定义分隔符</label><ElInput id="custom-separator" v-model="options.custom" placeholder="例如 | 或 ---，按完整文字匹配" clearable spellcheck="false" /></div>
      <ElDivider />
      <div class="checkbox-row"><ElCheckbox v-model="options.trim">去除行首尾空白</ElCheckbox><ElCheckbox v-model="options.removeEmpty">移除空行</ElCheckbox><ElCheckbox v-model="options.unique">去除重复行（保留顺序）</ElCheckbox></div>
    </ElCard>
    <div class="splitter-caption"><span class="subtle">拖动中间分隔线调整两栏大小</span><ElButton link type="primary" @click="resetSizes">恢复等宽</ElButton></div>
    <ElSplitter :layout="compact ? 'vertical' : 'horizontal'" class="text-editor-splitter" @resize-end="rememberRatio">
      <ElSplitterPanel v-model:size="leftSize" min="25%" max="75%">
      <ElCard shadow="never">
        <template #header><div class="card-heading"><label for="split-input">原始文字</label><div><ElButton text type="primary" @click="example">填入示例</ElButton><ElButton text :disabled="!input" @click="input = ''">清空</ElButton></div></div></template>
        <ElInput id="split-input" v-model="input" type="textarea" :rows="17" class="code-editor" :placeholder="mode === 'log' ? '粘贴含有 \\n、\\t 的日志或堆栈' : '粘贴需要按分隔符换行的文字'" spellcheck="false" />
        <div class="editor-caption"><span>{{ input.length.toLocaleString() }} 字符</span><span>保留原始输入</span></div>
      </ElCard>
      </ElSplitterPanel>
      <ElSplitterPanel v-model:size="rightSize" min="25%">
      <ElCard shadow="never">
        <template #header><div class="card-heading"><label for="split-output">{{ mode === 'log' ? '还原结果' : '分行结果' }} <ElTag size="small" effect="plain">{{ lineCount.toLocaleString() }} 行</ElTag></label><CopyButton :value="output" label="复制结果" /></div></template>
        <ElInput id="split-output" :model-value="output" type="textarea" :rows="17" class="code-editor result-editor" :class="{ 'log-editor': mode === 'log' }" readonly placeholder="转换结果将显示在这里" spellcheck="false" />
        <div class="editor-caption"><span>{{ output.length.toLocaleString() }} 字符</span><span>{{ mode === 'log' ? '保留缩进，长行可横向滚动' : '每项一行，可直接复制' }}</span></div>
      </ElCard>
      </ElSplitterPanel>
    </ElSplitter>
  </div>
</template>
