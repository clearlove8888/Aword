<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import words from './data/words.json'

const index = ref(0)
const playing = ref(false)
const revealed = ref(false)
const playMode = ref(false)
const playbackRate = ref(1)
const speedOptions = [0.75, 1, 1.25, 1.5, 2]
const textScale = ref(1)
const textScaleOptions = [0.75, 1, 1.25, 1.5]
let playCount = 0
const jumpQuery = ref('')
const jumpMessage = ref('')
const current = computed(() => words[index.value])
const displayStyle = computed(() => ({
  '--word-size': `${Math.min(18, 145 / Math.max(current.value.word.length, 1)) * textScale.value}vw`,
  '--meaning-size': `${34 * textScale.value}px`,
  '--example-size': `${22 * textScale.value}px`,
  '--translation-size': `${18 * textScale.value}px`,
}))
let audio
let requestId = 0
let touchStartX = 0
let touchStartY = 0
let touchStartTime = 0
let touchEnabled = false

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
  audio.playbackRate = playbackRate.value
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

function updatePlaybackRate() {
  if (audio) audio.playbackRate = playbackRate.value
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
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  if (resume) playCurrent()
}

function moveWord(step) {
  const resume = playing.value
  stopAudio()
  playCount = 0
  index.value = (index.value + step + words.length) % words.length
  revealed.value = false
  if (resume || playMode.value) playCurrent()
}

function handleTouchStart(event) {
  if (event.target.closest('input, button, .details')) {
    touchEnabled = false
    return
  }
  const touch = event.changedTouches[0]
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  touchStartTime = Date.now()
  touchEnabled = true
}

function handleTouchEnd(event) {
  if (!touchEnabled) return
  touchEnabled = false
  const touch = event.changedTouches[0]
  const deltaX = touch.clientX - touchStartX
  const deltaY = touch.clientY - touchStartY
  const elapsed = Date.now() - touchStartTime
  if (elapsed > 800 || Math.abs(deltaY) < 48 || Math.abs(deltaY) < Math.abs(deltaX) * 1.2) return
  moveWord(deltaY < 0 ? 1 : -1)
}

function onKeydown(event) {
  if (event.target.closest('input, textarea')) return
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') {
    if (event.repeat) return
    event.preventDefault()
    revealed.value = !revealed.value
    return
  }
  if (event.target.closest('button, select')) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  moveWord(event.key === 'ArrowRight' ? 1 : -1)
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
<template>
  <main
    class="word-page"
    aria-label="单词学习"
    :style="displayStyle"
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
  >
    <h1
      class="word-content"
      @click="toggleAudio"
      :title="playing ? '暂停播放' : '播放录音'"
    >{{ current.word }}</h1>
    <div class="word-meta">
      <span class="word-number">{{ index + 1 }} / {{ words.length }}</span>
      <label class="speed-control">
        <span>速度</span>
        <select v-model.number="playbackRate" @change="updatePlaybackRate" aria-label="播放速度">
          <option v-for="speed in speedOptions" :key="speed" :value="speed">{{ speed }}×</option>
        </select>
      </label>
      <label class="size-control">
        <span>大小</span>
        <select v-model.number="textScale" aria-label="文字大小">
          <option v-for="scale in textScaleOptions" :key="scale" :value="scale">{{ scale }}×</option>
        </select>
      </label>
    </div>
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
