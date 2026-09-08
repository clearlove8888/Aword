<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import words from './data/words.json'

const index = ref(0)
const playing = ref(false)
const revealed = ref(false)
const playMode = ref(false)
let playCount = 0
const jumpQuery = ref('')
const jumpMessage = ref('')
const current = computed(() => words[index.value])
const wordSize = computed(() => `${Math.min(18, 145 / Math.max(current.value.word.length, 1))}vw`)
let audio
let requestId = 0

function stopAudio() {
  requestId++
  audio?.pause()
  playing.value = false
}

async function playCurrent() {
  if (!audio) return
  const request = ++requestId
  audio.pause()
  playing.value = false
  const filename = `${String(current.value.id - 1).padStart(6, '0')}_en.mp3`
  audio.src = `${import.meta.env.BASE_URL}audio/${filename}`
  audio.loop = !playMode.value
  try {
    await audio.play()
    if (request === requestId) playing.value = true
  } catch {
    // Clicking the word retries playback when autoplay is unavailable.
  }
}

function toggleAudio() {
  if (playing.value) stopAudio()
  else playCurrent()
}

function handleAudioEnded() {
  if (!playMode.value) {
    playing.value = false
    return
  }
  playCount += 1
  if (playCount >= 5) {
    playCount = 0
    index.value = (index.value + 1) % words.length
  }
  playCurrent()
}

function togglePlayMode() {
  playMode.value = !playMode.value
  playCount = 0
  stopAudio()
  if (playMode.value) playCurrent()
}

function jumpToTarget() {
  const query = jumpQuery.value.trim()
  if (!query) return
  const numeric = /^\d+$/.test(query) ? Number(query) : null
  let targetIndex = numeric !== null
    ? (numeric >= 1 && numeric <= words.length ? numeric - 1 : -1)
    : words.findIndex((item) => item.word.toLowerCase() === query.toLowerCase())
  if (targetIndex < 0) {
    jumpMessage.value = numeric !== null ? `请输入 1-${words.length} 之间的序号` : '没有找到这个单词'
    return
  }
  const resume = playing.value
  stopAudio()
  playCount = 0
  index.value = targetIndex
  revealed.value = false
  jumpMessage.value = ''
  if (resume) playCurrent()
}

function onKeydown(event) {
  if (event.target instanceof HTMLInputElement) return
  if (event.key === '0') {
    revealed.value = !revealed.value
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const resume = playing.value
  stopAudio()
  playCount = 0
  index.value = (index.value + (event.key === 'ArrowRight' ? 1 : -1) + words.length) % words.length
  revealed.value = false
  if (resume) playCurrent()
}

onMounted(() => {
  audio = new Audio()
  audio.preload = 'auto'
  audio.addEventListener('error', () => { playing.value = false })
  audio.addEventListener('ended', handleAudioEnded)
  window.addEventListener('keydown', onKeydown)
  playCurrent()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopAudio()
  if (audio) {
    audio.removeAttribute('src')
    audio.load()
    audio = undefined
  }
})
</script>
<style>
.word-page {
  display: flex;
  height: 100vh;
}
</style>
<template>
  <main class="word-page" aria-label="单词学习">
    <h1
      class="word-content"
      :style="{ '--word-size': wordSize }"
      @click="toggleAudio"
      :title="playing ? '暂停播放' : '播放录音'"
    >{{ current.word }}</h1>
    <form class="jump-form" @submit.prevent="jumpToTarget">
      <label for="jump-query">跳转到</label>
      <input id="jump-query" v-model="jumpQuery" type="text" inputmode="text" placeholder="输入序号或单词" autocomplete="off" />
      <button type="submit">跳转</button>
      <button type="button" class="mode-toggle" :aria-pressed="playMode" @click="togglePlayMode">
        {{ playMode ? '停止播放模式' : '播放模式' }}
      </button>
      <p v-if="jumpMessage" class="jump-message" role="status">{{ jumpMessage }}</p>
    </form>
    <button class="reveal-button" @click="revealed = !revealed">
      {{ revealed ? '隐藏释义与例句' : '显示中文释义与例句' }}
    </button>
    <section v-if="revealed" class="details" aria-live="polite">
      <p class="meaning">{{ current.meaning }}</p>
      <div class="examples">
        <div v-if="current.example" class="example">
          <p>{{ current.example }}</p>
          <p>{{ current.translation }}</p>
        </div>
        <div v-if="current.example2" class="example">
          <p>{{ current.example2 }}</p>
          <p>{{ current.translation2 }}</p>
        </div>
      </div>
    </section>
  </main>
</template>
