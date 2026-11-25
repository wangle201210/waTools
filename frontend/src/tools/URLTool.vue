<script setup lang="ts">
import { computed, toRefs } from 'vue'
import { ElAlert, ElButton, ElCard, ElCheckbox, ElInput, ElRadioButton, ElRadioGroup, ElTag } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import CopyButton from '../components/CopyButton.vue'
import { useStoredState } from '../composables/useStoredState'
import { convertURL } from '../lib/text'

const { input, mode, formMode } = toRefs(useStoredState('url', { input: '', mode: 'decode' as 'decode' | 'encode', formMode: false }, { mode: value => ['decode', 'encode'].includes(String(value)) }))
const result = computed(() => {
  try { return { value: convertURL(input.value, mode.value, formMode.value), error: '' } }
  catch (error) { return { value: '', error: (error as Error).message } }
})
function example() {
  input.value = mode.value === 'decode'
    ? 'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3D%E4%BD%A0%E5%A5%BD%26page%3D1'
    : 'https://example.com/search?q=你好&page=1'
}
</script>
<template>
  <div class="tool-content">
    <div class="tool-toolbar"><ElRadioGroup v-model="mode" aria-label="URL 转换模式"><ElRadioButton value="decode">URL 解码</ElRadioButton><ElRadioButton value="encode">URL 编码</ElRadioButton></ElRadioGroup><ElCheckbox v-model="formMode">表单模式：+ 与空格互转</ElCheckbox></div>
    <ElCard shadow="never">
      <template #header><div class="card-heading"><label for="url-input">{{ mode === 'decode' ? '待解码内容' : '原始文字' }}</label><div><ElButton text type="primary" @click="example">填入示例</ElButton><ElButton text :disabled="!input" @click="input = ''">清空</ElButton></div></div></template>
      <ElInput id="url-input" v-model="input" type="textarea" :rows="7" class="code-editor" :placeholder="mode === 'decode' ? '粘贴 URL 或百分号编码，例如 %E4%BD%A0%E5%A5%BD' : '输入需要编码的文字或 URL'" spellcheck="false" />
      <div class="editor-caption"><span>{{ input.length.toLocaleString() }} 字符</span><span>输入后自动转换</span></div>
    </ElCard>
    <ElAlert v-if="result.error" :title="result.error" type="error" show-icon :closable="false" />
    <ElCard shadow="never">
      <template #header><div class="card-heading"><label for="url-output">{{ mode === 'decode' ? '解码结果' : '编码结果' }} <ElTag size="small" type="success" effect="plain">{{ mode === 'decode' ? 'Decoded' : 'Encoded' }}</ElTag></label><CopyButton :value="result.value" label="复制结果" /></div></template>
      <ElInput id="url-output" :model-value="result.value" type="textarea" :rows="7" class="code-editor result-editor" readonly placeholder="转换结果将显示在这里" spellcheck="false" />
      <div class="editor-caption"><span>每次解码一层，支持中文及 Unicode</span><ElButton link type="primary" :icon="Refresh" :disabled="!result.value || result.value === input" @click="input = result.value">结果作为输入</ElButton></div>
    </ElCard>
  </div>
</template>
