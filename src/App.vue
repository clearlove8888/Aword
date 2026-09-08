<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import words from './data/words.json'

const index = ref(0)
const playing = ref(false)
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
  audio.loop = true
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

function onKeydown(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const resume = playing.value
  stopAudio()
  index.value = (index.value + (event.key === 'ArrowRight' ? 1 : -1) + words.length) % words.length
  if (resume) playCurrent()
}

onMounted(() => {
  audio = new Audio()
  audio.preload = 'auto'
  audio.addEventListener('error', () => { playing.value = false })
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
  height: 100vh;
}
</style>
<template>
  <main class="word-page" aria-label="单词学习">
    <button
      class="word-content"
      :style="{ '--word-size': wordSize }"
      :aria-label="`${current.word}，${playing ? '暂停播放' : '播放录音'}`"
      :aria-pressed="playing"
      @click="toggleAudio"
    >{{ current.word }}</button>
  </main>
</template>
