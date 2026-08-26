<script setup>
import { computed } from 'vue'
import { accountLabel, initials, safeColor } from '../lib/core.mjs'

const props = defineProps({
  account: { type: Object, required: true },
  code: { type: String, default: '' },
  nextCode: { type: String, default: '' },
  seconds: { type: Number, default: 0 },
  progress: { type: Number, default: 1 },
  showNext: Boolean,
  trashView: Boolean,
  hasError: Boolean,
})
const emit = defineEmits(['copy', 'context-menu', 'edit', 'favorite', 'drag-start', 'drop'])

const RADIUS = 13
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// 最后 5 秒变红并提示下一个码，避免复制到马上失效的验证码。
const expiring = computed(() => props.account.type === 'totp' && props.seconds <= 5)
const dashOffset = computed(() => CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, props.progress))))
const title = computed(() => props.account.issuer || props.account.name || '未命名')
const subtitle = computed(() => (props.account.issuer ? props.account.name : '') || '')
</script>

<template>
  <article
    class="otp-card"
    :class="{ expiring, invalid: hasError, trashed: trashView }"
    :draggable="!trashView"
    :title="trashView ? accountLabel(account) : `点击复制 ${accountLabel(account)} 的验证码`"
    @click="!trashView && emit('copy', account)"
    @contextmenu.prevent="emit('context-menu', account, $event)"
    @dragstart="emit('drag-start', account.id, $event)"
    @dragover.prevent
    @drop.prevent="emit('drop', account.id)"
  >
    <span class="otp-avatar" :style="{ '--avatar-color': safeColor(account.color) }" aria-hidden="true">
      <img v-if="account.iconType === 'image' && account.iconData" :src="account.iconData" alt="" />
      <template v-else>{{ account.icon || initials(title) }}</template>
    </span>

    <div class="otp-body">
      <div class="otp-heading">
        <h2 :title="title">{{ title }}</h2>
        <i v-if="account.favorite" class="iconfont icon-card otp-flag" title="常用" aria-hidden="true" />
        <i v-if="account.quick" class="iconfont icon-quick-fill otp-flag" title="已注册 uTools 关键字" aria-hidden="true" />
      </div>
      <p v-if="subtitle" class="otp-subtitle" :title="subtitle">{{ subtitle }}</p>
      <p class="otp-code" :class="{ masked: !hasError && code.startsWith('•') }">{{ code }}</p>
      <p v-if="showNext && expiring && nextCode" class="otp-next">下一个 {{ nextCode }}</p>
    </div>

    <div class="otp-timer">
      <template v-if="account.type === 'hotp'">
        <span class="otp-counter" title="HOTP 计数器，复制后自动加一">#{{ account.counter }}</span>
      </template>
      <template v-else>
        <svg class="otp-ring" viewBox="0 0 32 32" aria-hidden="true">
          <circle class="otp-ring-track" cx="16" cy="16" :r="RADIUS" />
          <circle
            class="otp-ring-value"
            cx="16"
            cy="16"
            :r="RADIUS"
            :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="dashOffset"
          />
        </svg>
        <span class="otp-seconds" :aria-label="`${seconds} 秒后刷新`">{{ seconds }}</span>
      </template>
    </div>

    <div class="otp-actions">
      <button type="button" :title="account.favorite ? '取消常用' : '加入常用'" @click.stop="emit('favorite', account)">
        <i class="iconfont icon-card" aria-hidden="true" />
      </button>
      <button type="button" title="编辑" @click.stop="emit('edit', account)">
        <i class="iconfont icon-edit" aria-hidden="true" />
      </button>
    </div>
  </article>
</template>
