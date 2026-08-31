import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { accountKey, accountLabel, accountMatches, createId, moveItem, normalizeAccount } from '../lib/core.mjs'
import { counterAt, formatCode, generateOtp, remainingSeconds } from '../lib/otp.mjs'
import { buildOtpauthUri, parseOtpauthText } from '../lib/otpauth.mjs'
import { STORAGE_KEY, loadState, prepareState } from '../lib/state.mjs'
import { readStorage, writeStorage } from '../lib/storage.js'

// 界面每 250 毫秒对一次时间，倒计时圆环才走得顺，验证码也能在整点秒立刻翻新。
const TICK_MS = 250

export function useFunOtp() {
  const loaded = loadState({ read: readStorage })
  const state = ref(loaded.state)
  const storageError = ref(loaded.blocked)
  const search = ref('')
  const now = ref(Date.now())
  const toast = reactive({ visible: false, message: '', error: false })
  const codes = reactive({})
  let toastTimer
  let refreshing = false

  const groups = computed(() => state.value.groups)
  const activeGroupId = computed(() => state.value.currentView.startsWith('group:') ? state.value.currentView.slice(6) : '')
  const trashCount = computed(() => state.value.accounts.filter(account => account.deletedAt).length)

  const currentAccounts = computed(() => {
    const active = state.value.accounts.filter(account => !account.deletedAt)
    let accounts
    // 废纸篓要先判断：否则一搜索就跳去搜全部未删除账号，废纸篓里反而搜不到东西。
    if (state.value.currentView === 'trash') accounts = state.value.accounts.filter(account => account.deletedAt)
    else if (search.value.trim() || state.value.currentView === 'all') accounts = active
    else if (state.value.currentView === 'favorites') accounts = active.filter(account => account.favorite)
    else if (state.value.currentView === 'ungrouped') accounts = active.filter(account => !account.groupIds.length)
    else accounts = active.filter(account => account.groupIds.includes(activeGroupId.value))

    const matched = accounts.filter(account => accountMatches(account, search.value, state.value.settings.search))
    const sort = state.value.settings.display.sort
    if (sort === 'manual') return matched
    return matched.slice().sort((a, b) => {
      const left = sort === 'issuer' ? `${a.issuer}${a.name}` : `${a.name}${a.issuer}`
      const right = sort === 'issuer' ? `${b.issuer}${b.name}` : `${b.name}${b.issuer}`
      return left.localeCompare(right, 'zh-Hans-CN')
    })
  })

  function saveState() {
    if (storageError.value) return
    writeStorage(STORAGE_KEY, state.value)
  }

  function showToast(message, error = false) {
    clearTimeout(toastTimer)
    Object.assign(toast, { visible: true, message, error })
    toastTimer = setTimeout(() => { toast.visible = false }, 2600)
  }

  function counterOf(account) {
    return account.type === 'hotp' ? Math.max(0, Number(account.counter) || 0) : counterAt(now.value, account.period)
  }

  // 验证码只在计数器翻页时重算，其余 tick 只是走一下倒计时。
  async function refreshCodes() {
    if (refreshing) return
    refreshing = true
    try {
      for (const account of state.value.accounts) {
        if (account.deletedAt) continue
        const counter = counterOf(account)
        const cached = codes[account.id]
        if (cached && cached.counter === counter && cached.signature === signatureOf(account)) continue
        try {
          const [code, next] = await Promise.all([
            generateOtp({ ...account, counter }),
            generateOtp({ ...account, counter: counter + 1 }),
          ])
          codes[account.id] = { code, next, counter, signature: signatureOf(account), error: '' }
        } catch (error) {
          codes[account.id] = { code: '', next: '', counter, signature: signatureOf(account), error: error.message }
        }
      }
    } finally {
      refreshing = false
    }
  }

  // 改了密钥、位数或算法都要重算，光看计数器会一直用旧值。
  function signatureOf(account) {
    return `${account.secret}|${account.algorithm}|${account.digits}|${account.encoding}`
  }

  function codeOf(account) {
    return codes[account.id] || { code: '', next: '', error: '' }
  }

  function displayCode(account) {
    const entry = codeOf(account)
    if (entry.error) return '密钥错误'
    if (!entry.code) return '······'
    if (state.value.settings.display.maskCode) return '•'.repeat(entry.code.length)
    return formatCode(entry.code, state.value.settings.display.groupDigits)
  }

  function displayNext(account) {
    const entry = codeOf(account)
    return entry.next ? formatCode(entry.next, state.value.settings.display.groupDigits) : ''
  }

  function secondsLeft(account) {
    return account.type === 'hotp' ? 0 : remainingSeconds(now.value, account.period)
  }

  function progressOf(account) {
    if (account.type === 'hotp') return 1
    const period = Number(account.period) || 30
    return Math.max(0, Math.min(1, secondsLeft(account) / period))
  }

  function copyText(text) {
    if (window.utools?.copyText) window.utools.copyText(text)
    else navigator.clipboard?.writeText(text)
  }

  function copyCode(account) {
    const entry = codeOf(account)
    if (entry.error) return showToast(`「${accountLabel(account)}」密钥无效`, true)
    if (!entry.code) return
    copyText(entry.code)
    // HOTP 用一次就该往前走一格，否则下次还是同一个码。
    if (account.type === 'hotp') {
      account.counter = counterOf(account) + 1
      saveState()
      refreshCodes()
    }
    if (state.value.settings.copy.outPlugin && window.utools?.outPlugin) {
      // outPlugin 只退出插件视图，uTools 主搜索框还会弹出来，得先隐藏主窗口才算彻底关掉。
      window.utools?.hideMainWindow?.()
      window.utools.outPlugin()
    } else showToast(`已复制 ${accountLabel(account)} 的验证码`)
  }

  function saveAccount(input) {
    const id = input.id || createId('account')
    const previous = state.value.accounts.find(account => account.id === id)
    const account = normalizeAccount({ ...previous, ...input, id, deletedAt: null })
    if (previous) state.value.accounts[state.value.accounts.indexOf(previous)] = account
    else state.value.accounts.push(account)
    syncQuickFeature(account)
    saveState()
    refreshCodes()
    showToast(previous ? '账号已更新' : '账号已添加')
    return account
  }

  function toggleFavorite(account) {
    account.favorite = !account.favorite
    saveState()
    showToast(account.favorite ? '已加入常用' : '已取消常用')
  }

  function syncQuickFeature(account) {
    if (!window.utools?.setFeature) return
    const code = `copy-otp@${account.id}`
    if (!account.quick || account.deletedAt) return void window.utools.removeFeature?.(code)
    window.utools.setFeature({
      code,
      explain: `复制 ${accountLabel(account)} 的验证码`,
      icon: 'logo.png',
      mainHide: true,
      cmds: [accountLabel(account), account.issuer || account.name].filter(Boolean),
    })
  }

  function toggleQuick(account) {
    account.quick = !account.quick
    syncQuickFeature(account)
    saveState()
    showToast(account.quick ? '已添加到 uTools 关键字' : '已移除 uTools 关键字')
  }

  function moveToTrash(account) {
    account.deletedAt = Date.now()
    account.quick = false
    syncQuickFeature(account)
    saveState()
    showToast('已移到废纸篓，可在废纸篓里恢复')
  }

  function restoreAccount(account) {
    account.deletedAt = null
    saveState()
    refreshCodes()
    showToast('账号已恢复')
  }

  function deleteAccount(account) {
    if (!window.confirm(`永久删除「${accountLabel(account)}」？\n密钥一旦删除无法找回，请确认已在该网站关闭两步验证或已有其他备份。`)) return
    state.value.accounts = state.value.accounts.filter(item => item.id !== account.id)
    delete codes[account.id]
    window.utools?.removeFeature?.(`copy-otp@${account.id}`)
    saveState()
    showToast('账号已永久删除')
  }

  function emptyTrash() {
    const deleted = state.value.accounts.filter(account => account.deletedAt)
    if (!deleted.length) return showToast('废纸篓已经是空的')
    if (!window.confirm(`永久删除废纸篓里的 ${deleted.length} 个账号？密钥无法找回。`)) return
    deleted.forEach(account => delete codes[account.id])
    state.value.accounts = state.value.accounts.filter(account => !account.deletedAt)
    saveState()
    showToast('废纸篓已清空')
  }

  function reorderAccounts(sourceId, targetId) {
    if (state.value.settings.display.sort !== 'manual') return showToast('当前是自动排序，拖动不生效', true)
    state.value.accounts = moveItem(state.value.accounts, sourceId, targetId)
    saveState()
  }

  function setView(view) {
    state.value.currentView = view
    if (view.startsWith('group:')) state.value.lastGroupId = view.slice(6)
    search.value = ''
    saveState()
  }

  function groupCount(groupId) {
    return state.value.accounts.filter(account => !account.deletedAt && account.groupIds.includes(groupId)).length
  }

  function addGroup(name) {
    const trimmed = String(name || '').trim()
    if (!trimmed) return
    state.value.groups.push({ id: createId('group'), name: trimmed })
    saveState()
  }

  function groupAction(id, action, value) {
    const group = state.value.groups.find(item => item.id === id)
    if (!group) return
    if (action === 'rename' && String(value || '').trim()) group.name = String(value).trim()
    if (action === 'delete') {
      if (value !== true && !window.confirm(`删除分组「${group.name}」？组内账号会保留，只是不再属于任何分组。`)) return
      state.value.groups = state.value.groups.filter(item => item.id !== id)
      state.value.accounts.forEach(account => { account.groupIds = account.groupIds.filter(groupId => groupId !== id) })
      if (activeGroupId.value === id) state.value.currentView = 'all'
    }
    if (action === 'up' || action === 'down') {
      const index = state.value.groups.indexOf(group)
      const target = index + (action === 'up' ? -1 : 1)
      if (target >= 0 && target < state.value.groups.length) {
        state.value.groups[index] = state.value.groups[target]
        state.value.groups[target] = group
      }
    }
    saveState()
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.value.theme
  }

  function cycleTheme() {
    const order = ['system', 'light', 'dark']
    state.value.theme = order[(order.indexOf(state.value.theme) + 1) % order.length]
    saveState()
    applyTheme()
    showToast({ system: '跟随系统主题', light: '已切换浅色主题', dark: '已切换深色主题' }[state.value.theme])
  }

  function saveSettings() {
    saveState()
    refreshCodes()
  }

  function exportBackup() {
    const content = JSON.stringify(state.value, null, 2)
    const name = `funotp-${new Date().toISOString().slice(0, 10)}.json`
    if (window.funotp?.saveBackup?.(content, name)) return showToast('备份已导出，请妥善保管')
    downloadFile(content, name, 'application/json')
    showToast('备份已导出，请妥善保管')
  }

  function exportUris() {
    if (!window.confirm('导出的文件里是明文密钥，任何拿到它的人都能生成你的验证码。确定导出吗？')) return
    const content = state.value.accounts.filter(account => !account.deletedAt).map(buildOtpauthUri).join('\n')
    const name = `funotp-uris-${new Date().toISOString().slice(0, 10)}.txt`
    if (window.funotp?.saveBackup?.(content, name)) return showToast('密钥已导出，请妥善保管')
    downloadFile(content, name, 'text/plain')
    showToast('密钥已导出，请妥善保管')
  }

  function downloadFile(content, name, type) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], { type }))
    link.download = name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // 导入永远是「追加 + 去重」：两步验证密钥丢一条就可能锁死一个账号，不做覆盖式导入。
  function importAccounts(list, groupId = '') {
    const existing = new Set(state.value.accounts.map(accountKey))
    const added = []
    for (const item of list) {
      const account = normalizeAccount({ ...item, id: createId('account'), groupIds: groupId ? [groupId] : [] })
      if (existing.has(accountKey(account))) continue
      existing.add(accountKey(account))
      state.value.accounts.push(account)
      added.push(account)
    }
    saveState()
    refreshCodes()
    return added
  }

  function processDataFile(type, content, options = {}) {
    try {
      if (type === 'restore') {
        const { state: restored, dropped } = prepareState(JSON.parse(content))
        state.value = restored
        // 恢复成功即说明拿到了可用数据，可以解除只读保护。
        storageError.value = ''
        saveState()
        applyTheme()
        refreshCodes()
        showToast(dropped ? `备份已恢复，跳过 ${dropped} 条无效账号` : '备份已恢复')
        return true
      }
      const { accounts, errors } = parseOtpauthText(content)
      if (!accounts.length) throw new Error(errors[0] || '没有找到 otpauth:// 链接')
      const added = importAccounts(accounts, options.groupId)
      const skipped = accounts.length - added.length
      showToast(`已导入 ${added.length} 个账号${skipped ? `，跳过 ${skipped} 个重复` : ''}${errors.length ? `，${errors.length} 条无法识别` : ''}`)
      return true
    } catch (error) {
      showToast(error.message, true)
      return false
    }
  }

  function setupUtools({ addAccount }) {
    window.utools?.setExpendHeight?.(558)
    window.utools?.setSubInput?.(({ text }) => { search.value = text || '' }, '搜索账号', true)
    state.value.accounts.forEach(syncQuickFeature)

    window.funotp?.onEnter(async action => {
      window.utools?.setExpendHeight?.(558)
      if (action.code?.startsWith('copy-otp@')) {
        const account = state.value.accounts.find(item => item.id === action.code.slice(9))
        if (!account) return
        await refreshCodes()
        copyText(codeOf(account).code)
        window.utools?.hideMainWindow?.()
        window.utools?.outPlugin?.()
        return
      }
      if (action.code === 'add-otp') {
        const { accounts } = parseOtpauthText(String(action.payload || ''))
        if (accounts.length === 1) addAccount(accounts[0])
        else if (accounts.length > 1) showToast(`已导入 ${importAccounts(accounts).length} 个账号`)
        return
      }
      if (action.code === 'search-otp') search.value = String(action.payload || '')
    })

    window.utools?.onMainPush?.(({ payload }) => state.value.accounts
      .filter(account => !account.deletedAt && accountMatches(account, payload, state.value.settings.search))
      .slice(0, 8)
      .map(account => ({
        icon: 'logo.png',
        text: formatCode(codeOf(account).code, true) || '计算中…',
        title: accountLabel(account),
        accountId: account.id,
      })),
    async ({ option }) => {
      const account = state.value.accounts.find(item => item.id === option.accountId)
      if (!account) return
      await refreshCodes()
      copyText(codeOf(account).code)
      return true
    })
  }

  const timer = setInterval(() => {
    now.value = Date.now()
    refreshCodes()
  }, TICK_MS)
  onBeforeUnmount(() => clearInterval(timer))

  applyTheme()
  refreshCodes()

  return {
    state, search, now, toast, storageError, codes, groups, activeGroupId, trashCount, currentAccounts,
    codeOf, displayCode, displayNext, secondsLeft, progressOf, copyCode, copyText,
    saveAccount, toggleFavorite, toggleQuick, moveToTrash, restoreAccount, deleteAccount, emptyTrash,
    reorderAccounts, setView, groupCount, addGroup, groupAction, cycleTheme, saveSettings,
    exportBackup, exportUris, importAccounts, processDataFile, setupUtools, showToast, refreshCodes,
  }
}
