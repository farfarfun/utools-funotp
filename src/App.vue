<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AccountDialog from './components/AccountDialog.vue'
import AccountGrid from './components/AccountGrid.vue'
import AppHeader from './components/AppHeader.vue'
import ContextMenu from './components/ContextMenu.vue'
import GroupDialog from './components/GroupDialog.vue'
import QrDialog from './components/QrDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { useFunOtp } from './composables/useFunOtp.js'
import { accountLabel } from './lib/core.mjs'

const otp = useFunOtp()
const { state, storageError, toast, groups, activeGroupId, trashCount, currentAccounts } = otp

const accountDialog = ref(null)
const groupDialog = ref(null)
const qrDialog = ref(null)
const settingsDialog = ref(null)
const draggedId = ref(null)
const context = reactive({ visible: false, account: null, x: 0, y: 0 })

const trashView = computed(() => state.value.currentView === 'trash')
const hasUngrouped = computed(() => state.value.accounts.some(account => !account.deletedAt && !account.groupIds.length))
const emptyText = computed(() => {
  if (otp.search.value.trim()) return '没有匹配的账号'
  return {
    trash: '废纸篓是空的',
    favorites: '还没有标记为常用的账号',
    ungrouped: '所有账号都已分组',
  }[state.value.currentView] || '还没有账号，扫一下网站给的二维码就能添加'
})

const contextItems = computed(() => {
  const account = context.account
  if (!account) return []
  if (account.deletedAt) {
    return [
      { action: 'restore', label: '恢复', icon: 'icon-back' },
      { action: 'delete', label: '永久删除', icon: 'icon-delete', danger: true },
    ]
  }
  return [
    { action: 'copy', label: '复制验证码', icon: 'icon-remarks' },
    { action: 'copy-next', label: '复制下一个', icon: 'icon-totop', divided: true },
    { action: 'edit', label: '编辑', icon: 'icon-edit' },
    { action: 'favorite', label: account.favorite ? '取消常用' : '加入常用', icon: 'icon-card' },
    { action: 'quick', label: account.quick ? '移除关键字' : '注册 uTools 关键字', icon: account.quick ? 'icon-quick-fill' : 'icon-quick' },
    { action: 'qr', label: '导出二维码', icon: 'icon-move', divided: true },
    { action: 'trash', label: '移到废纸篓', icon: 'icon-delete', danger: true },
  ]
})

function openContextMenu(account, event) {
  Object.assign(context, { visible: true, account, x: event.clientX, y: event.clientY })
}

function closeContextMenu() {
  context.visible = false
  context.account = null
}

function handleContextAction(action) {
  const account = context.account
  closeContextMenu()
  if (!account) return
  if (action === 'copy') otp.copyCode(account)
  if (action === 'copy-next') {
    const next = otp.codeOf(account).next
    if (!next) return otp.showToast('验证码还没算出来，请稍等', true)
    otp.copyText(next)
    otp.showToast(`已复制 ${accountLabel(account)} 的下一个验证码`)
  }
  if (action === 'edit') accountDialog.value.open(account)
  if (action === 'favorite') otp.toggleFavorite(account)
  if (action === 'quick') otp.toggleQuick(account)
  if (action === 'qr') qrDialog.value.open(account)
  if (action === 'trash') otp.moveToTrash(account)
  if (action === 'restore') otp.restoreAccount(account)
  if (action === 'delete') otp.deleteAccount(account)
}

function handleDragStart(id, event) {
  draggedId.value = id
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function handleDrop(targetId) {
  if (!draggedId.value || draggedId.value === targetId) return
  otp.reorderAccounts(draggedId.value, targetId)
  draggedId.value = null
}

function handleImport(accounts) {
  const added = otp.importAccounts(accounts, activeGroupId.value)
  otp.showToast(`已导入 ${added.length} 个账号${accounts.length - added.length ? `，跳过 ${accounts.length - added.length} 个重复` : ''}`)
}

function handleDataFile(type, content, options) {
  if (otp.processDataFile(type, content, options)) settingsDialog.value.close()
}

function copyUri(uri) {
  otp.copyText(uri)
  otp.showToast('链接已复制，请尽快粘贴并清空剪贴板')
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  document.addEventListener('click', closeContextMenu)
  document.addEventListener('keydown', handleKeydown)
  otp.setupUtools({ addAccount: draft => accountDialog.value.open(draft) })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="app-shell">
    <AppHeader
      :groups="groups"
      :current-view="state.currentView"
      :theme="state.theme"
      :rounded="state.settings.navbar.rounded"
      :has-ungrouped="hasUngrouped"
      @select="otp.setView"
      @manage="groupDialog.open()"
      @add="accountDialog.open()"
      @cycle-theme="otp.cycleTheme"
      @settings="settingsDialog.open()"
    />

    <div v-if="storageError" class="storage-alert" role="alert">
      <span>{{ storageError }}为避免覆盖原有密钥，已暂停写入。请从备份恢复。</span>
      <button type="button" @click="settingsDialog.open()">从备份恢复</button>
    </div>

    <main class="main">
      <div class="main-view">
        <div v-if="trashView" class="special-view-header">
          <span class="special-view-title danger">
            <i class="iconfont icon-dust" aria-hidden="true" />废纸篓
            <small>删除后密钥无法找回</small>
          </span>
          <button v-if="trashCount" type="button" class="text-button danger-text" @click="otp.emptyTrash">清空废纸篓</button>
        </div>

        <AccountGrid
          :accounts="currentAccounts"
          :otp="otp"
          :columns="state.settings.display.columns"
          :show-next="state.settings.display.showNext"
          :trash-view="trashView"
          :show-add="!trashView && !otp.search.value.trim()"
          :empty-text="emptyText"
          @add="accountDialog.open()"
          @copy="otp.copyCode"
          @edit="accountDialog.open($event)"
          @favorite="otp.toggleFavorite"
          @context-menu="openContextMenu"
          @drag-start="handleDragStart"
          @drop="handleDrop"
        />
      </div>
    </main>

    <button
      class="trash-button"
      type="button"
      :aria-label="trashView ? '返回全部账号' : '打开废纸篓'"
      :title="trashView ? '返回' : '废纸篓'"
      @click="otp.setView(trashView ? 'all' : 'trash')"
    >
      <span class="trash-badge">
        <i class="iconfont" :class="trashView ? 'icon-back' : 'icon-dust'" aria-hidden="true" />
        <sup v-if="trashCount && !trashView">{{ trashCount }}</sup>
      </span>
    </button>

    <ContextMenu v-if="context.visible" :items="contextItems" :x="context.x" :y="context.y" @select="handleContextAction" />
    <div v-if="toast.visible" class="toast" :class="{ error: toast.error }" role="status" aria-live="polite">{{ toast.message }}</div>

    <AccountDialog
      ref="accountDialog"
      :groups="groups"
      :default-group-id="activeGroupId"
      @save="otp.saveAccount"
      @import="handleImport"
      @message="otp.showToast"
    />
    <GroupDialog ref="groupDialog" :groups="groups" :group-count="otp.groupCount" @add="otp.addGroup" @action="otp.groupAction" />
    <QrDialog ref="qrDialog" @copy="copyUri" @message="otp.showToast" />
    <SettingsDialog
      ref="settingsDialog"
      :settings="state.settings"
      :groups="groups"
      :account-count="state.accounts.filter(account => !account.deletedAt).length"
      :backup-data="state"
      @save-settings="otp.saveSettings"
      @export="otp.exportBackup"
      @export-uris="otp.exportUris"
      @data-file="handleDataFile"
      @message="otp.showToast"
    />
  </div>
</template>
