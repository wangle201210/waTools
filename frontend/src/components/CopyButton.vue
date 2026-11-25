<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { Check, DocumentCopy } from '@element-plus/icons-vue'
import { Clipboard, System } from '@wailsio/runtime'

const props = withDefaults(defineProps<{ value: string; label?: string; ariaLabel?: string }>(), { label: '复制' })
const copied = ref(false)
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (loading.value) return
  loading.value = true
  clearTimeout(timer)
  try {
    if (System.IsMac() || System.IsWindows() || System.IsLinux()) await Clipboard.SetText(props.value)
    else await navigator.clipboard.writeText(props.value)
    copied.value = true
    ElMessage.success({ message: '已复制到剪贴板', duration: 1500, grouping: true })
    timer = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    ElMessage.error('复制失败，请手动选择结果复制')
  } finally { loading.value = false }
}
onUnmounted(() => clearTimeout(timer))
</script>
<template>
  <ElButton size="small" :disabled="!value" :loading="loading" :icon="copied ? Check : DocumentCopy" :aria-label="ariaLabel || label" @click="copy">{{ copied ? '已复制' : label }}</ElButton>
</template>
