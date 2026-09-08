<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const words = [
  { word: 'abandon', phonetic: '/əˈbændən/', type: 'v.', meaning: '放弃；抛弃', example: 'Never abandon your dreams.', translation: '永远不要放弃你的梦想。' },
  { word: 'ability', phonetic: '/əˈbɪləti/', type: 'n.', meaning: '能力；才能', example: 'Everyone has the ability to learn.', translation: '每个人都有学习的能力。' },
  { word: 'beyond', phonetic: '/bɪˈjɒnd/', type: 'prep.', meaning: '超出；在……之外', example: 'The mountains are beyond the river.', translation: '群山在河的另一边。' },
  { word: 'discover', phonetic: '/dɪˈskʌvə(r)/', type: 'v.', meaning: '发现；发觉', example: 'Discover something new every day.', translation: '每天发现一些新事物。' },
  { word: 'essential', phonetic: '/ɪˈsenʃl/', type: 'adj.', meaning: '必不可少的；本质的', example: 'Water is essential for life.', translation: '水是生命不可或缺的。' },
]
const index = ref(0)
const revealed = ref(false)
const ratings = ref({})
const message = ref('')
const current = computed(() => words[index.value])
const reviewed = computed(() => Object.keys(ratings.value).length)
const progress = computed(() => reviewed.value / words.length * 100)
function move(step) {
  window.speechSynthesis?.cancel()
  index.value = (index.value + step + words.length) % words.length
  revealed.value = false
  message.value = ''
}
function rate(value) {
  ratings.value[current.value.word] = value
}
function speak() {
  if (!('speechSynthesis' in window)) {
    message.value = '当前浏览器暂不支持发音。'
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(current.value.word)
  utterance.lang = 'en-US'
  utterance.rate = 0.85
  utterance.onerror = (event) => {
    if (!['canceled', 'interrupted'].includes(event.error)) message.value = '发音暂时不可用，请稍后重试。'
  }
  window.speechSynthesis.speak(utterance)
}
onBeforeUnmount(() => window.speechSynthesis?.cancel())
</script>

<template>
  <div class="app-shell">
    <header class="header">
      <a class="brand" href="./" aria-label="Aword 首页"><span class="brand-icon">a.</span>Aword</a>
      <span class="header-caption">每天一点，记得更久。</span>
      <span class="edition">学习预览版</span>
    </header>

    <main>
      <div class="section-heading"><div><span class="eyebrow">ONE WORD AT A TIME</span><h1>专注眼前的这个词。</h1><p>先回忆，再揭晓。让每一次学习都留下印象。</p></div><span class="book-tag">CET-4 · 示例词库</span></div>
      <section class="workspace" aria-label="单词学习">
        <div class="session-bar"><span><i></i> 今日练习</span><span>已标记 <strong>{{ reviewed }}</strong> / {{ words.length }} 词</span></div>
        <div class="progress-track" role="progressbar" :aria-valuenow="reviewed" :aria-valuemax="words.length" aria-valuemin="0" aria-label="已标记单词数"><div :style="{ width: progress + '%' }"></div></div>
        <article class="word-card" :key="current.word">
          <div class="word-number">WORD {{ String(index + 1).padStart(2, '0') }} <span>/ {{ String(words.length).padStart(2, '0') }}</span></div>
          <h2>{{ current.word }}</h2>
          <div class="pronunciation"><span>{{ current.phonetic }}</span><button class="sound-button" @click="speak" aria-label="播放单词发音"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg></button></div>
          <div class="answer-area">
            <template v-if="revealed"><p class="meaning"><span>{{ current.type }}</span> {{ current.meaning }}</p><div class="example"><p>{{ current.example }}</p><p>{{ current.translation }}</p></div></template>
            <div v-else class="recall"><span class="recall-symbol">✧</span><p>这个单词，你还记得吗？</p><span>给自己一点时间，试着回忆它的意思。</span></div>
          </div>
          <button class="reveal-button" @click="revealed = !revealed">{{ revealed ? '隐藏释义' : '显示释义与例句' }} <span>{{ revealed ? '−' : '+' }}</span></button>
          <p class="audio-message" role="status">{{ message }}</p>
        </article>
        <div class="assessment"><span>记忆程度</span><div class="rating-buttons"><button v-for="rating in ['不认识', '有点模糊', '认识']" :key="rating" :disabled="!revealed" :aria-pressed="ratings[current.word] === rating" :class="{ selected: ratings[current.word] === rating }" @click="rate(rating)"><span>{{ rating === '认识' ? '✓' : rating === '有点模糊' ? '≈' : '○' }}</span>{{ rating }}</button></div><span class="rating-note" aria-live="polite">{{ ratings[current.word] ? '已标记：' + ratings[current.word] : revealed ? '选择你对这个词的熟悉程度' : '揭晓释义后，记录你的记忆程度' }}</span></div>
      </section>
      <nav class="word-navigation" aria-label="切换单词"><button @click="move(-1)"><span>←</span> 上一个</button><span>{{ index + 1 }} / {{ words.length }}</span><button @click="move(1)">下一个 <span>→</span></button></nav>
      <p class="footer-note">不急着记住所有单词，先认真记住这一个。</p>
    </main>
    <footer>Aword <span>·</span> Learn one word at a time.</footer>
  </div>
</template>
