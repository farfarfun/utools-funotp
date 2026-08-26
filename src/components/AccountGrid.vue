<script setup>
import AccountCard from './AccountCard.vue'
import emptyImage from '../assets/empty.svg'
import emptyDarkImage from '../assets/empty-dark.svg'

defineProps({
  accounts: { type: Array, required: true },
  otp: { type: Object, required: true },
  columns: { type: Number, default: 0 },
  showNext: Boolean,
  trashView: Boolean,
  showAdd: Boolean,
  emptyText: { type: String, default: '还没有账号' },
})
const emit = defineEmits(['add', 'copy', 'edit', 'favorite', 'context-menu', 'drag-start', 'drop'])
</script>

<template>
  <section class="card-list" aria-live="polite">
    <div
      v-if="accounts.length"
      class="otp-grid"
      :style="columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : null"
    >
      <AccountCard
        v-for="account in accounts"
        :key="account.id"
        :account="account"
        :code="otp.displayCode(account)"
        :next-code="otp.displayNext(account)"
        :seconds="otp.secondsLeft(account)"
        :progress="otp.progressOf(account)"
        :show-next="showNext"
        :trash-view="trashView"
        :has-error="Boolean(otp.codeOf(account).error)"
        @copy="emit('copy', $event)"
        @edit="emit('edit', $event)"
        @favorite="emit('favorite', $event)"
        @context-menu="(account, event) => emit('context-menu', account, event)"
        @drag-start="(id, event) => emit('drag-start', id, event)"
        @drop="emit('drop', $event)"
      />
      <button v-if="showAdd" class="add-item" type="button" aria-label="添加账号" @click="emit('add')">
        <i class="iconfont icon-add" aria-hidden="true" />
      </button>
    </div>
    <div v-else class="otp-empty">
      <img class="empty-image-light" :src="emptyImage" alt="" />
      <img class="empty-image-dark" :src="emptyDarkImage" alt="" />
      <span>{{ emptyText }}</span>
      <button v-if="showAdd" type="button" class="button primary" @click="emit('add')">添加账号</button>
    </div>
  </section>
</template>
