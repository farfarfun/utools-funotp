import { migrateState, validateState } from './core'
import type { BackupState } from './core'

// 纯状态逻辑：不依赖 vue / uTools，方便直接跑单测。
export const STORAGE_KEY = 'funotp-state-v1'

export interface FunOtpSettings {
  display: { columns: number, groupDigits: boolean, maskCode: boolean, showNext: boolean, sort: string }
  copy: { outPlugin: boolean, copyOnEnter: boolean }
  search: string[]
  navbar: { rounded: number }
}

export interface FunOtpState extends BackupState {
  theme: string
  currentView: string
  lastGroupId: string
  settings: FunOtpSettings
}

export interface LoadedState {
  state: FunOtpState
  blocked: string
  dropped: number
}

export type StateReader = (key: string) => unknown

export const DEFAULT_SETTINGS: FunOtpSettings = {
  // columns 为 0 表示按窗口宽度自适应。
  display: { columns: 0, groupDigits: true, maskCode: false, showNext: true, sort: 'manual' },
  copy: { outPlugin: true, copyOnEnter: false },
  search: ['name', 'issuer', 'note'],
  navbar: { rounded: 36 },
}

/** 创建一份可直接使用的空白应用状态。
 * @returns 含默认设置、分组和账号列表的状态。
 */
export function emptyState(): FunOtpState {
  return {
    version: 1,
    theme: 'system',
    currentView: 'all',
    lastGroupId: '',
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    groups: [],
    accounts: [],
  }
}

/** 补全备份状态缺失的界面设置，并修正失效的当前分组。
 * @param state 已通过基本结构校验的备份状态。
 * @returns 可供界面使用的完整状态。
 */
export function hydrateState(state: BackupState): FunOtpState {
  const hydrated = state as FunOtpState
  const settings = state.settings as Partial<FunOtpSettings> | undefined
  hydrated.settings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    display: { ...DEFAULT_SETTINGS.display, ...settings?.display },
    copy: { ...DEFAULT_SETTINGS.copy, ...settings?.copy },
    navbar: { ...DEFAULT_SETTINGS.navbar, ...settings?.navbar },
    search: settings?.search?.length ? settings.search : DEFAULT_SETTINGS.search.slice(),
  }
  hydrated.theme ||= 'system'
  hydrated.currentView ||= 'all'
  // 记住的分组可能已经被删掉了，回落到「全部」而不是停在空白页。
  if (hydrated.currentView.startsWith('group:') && !hydrated.groups.some(group => group.id === hydrated.currentView.slice(6))) {
    hydrated.currentView = 'all'
  }
  hydrated.lastGroupId = hydrated.currentView.startsWith('group:') ? hydrated.currentView.slice(6) : ''
  return hydrated
}

/** 校验、迁移并补全导入或读取到的备份状态。
 * @param saved 任意来源的待恢复数据。
 * @returns 完整状态及迁移时丢弃的无效账号数量。
 * @throws 备份结构无效时抛出错误。
 */
export function prepareState(saved: unknown): { state: FunOtpState, dropped: number } {
  const { state, dropped } = migrateState(validateState(saved))
  return { state: hydrateState(state), dropped }
}

// 读不出来时绝不能拿空数据顶上——那会在下一次写入时覆盖掉用户的真实密钥。
// 返回 blocked 时由界面提示用户，并暂停一切写入。
/** 从存储读取应用状态，读取或解析失败时返回只读保护状态。
 * @param options.read 按键读取原始数据的函数。
 * @returns 状态、只读错误提示及被迁移丢弃的账号数量。
 */
export function loadState({ read }: { read: StateReader }): LoadedState {
  let saved
  try {
    saved = read(STORAGE_KEY)
  } catch (error) {
    return { state: emptyState(), blocked: `本地数据读取失败：${error.message}。`, dropped: 0 }
  }
  if (!saved) return { state: emptyState(), blocked: '', dropped: 0 }
  try {
    const { state, dropped } = prepareState(saved)
    return { state, blocked: '', dropped }
  } catch (error) {
    return { state: emptyState(), blocked: `本地数据无法解析：${error.message}。`, dropped: 0 }
  }
}
