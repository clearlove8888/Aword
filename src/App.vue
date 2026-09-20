<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import words from './data/words.json'
import { isAnswerCorrect, meaningAnswers } from './answer-check.js'

const wordById = new Map(words.map(word => [word.id, word]))
const index = ref(0)
const dictation = ref(false)
const favoriteMode = ref(false)
const answer = ref('')
const answerInput = ref(null)
const answerState = ref('idle')
const answerMessage = ref('')
const composing = ref(false)
const audioMessage = ref('')
const reviewWords = ref(new Set())
const meaningStorageKey = 'aword-custom-meanings-v1'
const favoriteStorageKey = 'aword-favorites-v1'
const customMeanings = ref(readCustomMeanings())
const favoriteIds = ref(readFavorites())
const favoriteMessage = ref('')
const editingMeaning = ref(false)
const meaningDraft = ref('')
const meaningEditor = ref(null)
const meaningError = ref('')

function readCustomMeanings() {
  try {
    const saved = JSON.parse(localStorage.getItem(meaningStorageKey) || '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'string' && value.trim()))
  } catch {
    return {}
  }
}

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoriteStorageKey) || '[]')
    if (!Array.isArray(saved)) return []
    return [...new Set(saved.filter(id => Number.isInteger(id) && wordById.has(id)))]
  } catch {
    return []
  }
}
let advanceTimer

function resetQuestion() {
  clearTimeout(advanceTimer)
  editingMeaning.value = false
  meaningDraft.value = ''
  meaningError.value = ''
  answer.value = ''
  answerState.value = 'idle'
  answerMessage.value = ''
  composing.value = false
  audioMessage.value = ''
  revealed.value = false
}

function focusAnswer() {
  nextTick(() => answerInput.value?.focus({ preventScroll: true }))
}

function switchMode(mode) {
  const currentId = current.value?.id
  stopAudio()
  playMode.value = false
  playCount = 0
  dictation.value = mode === 'dictation'
  favoriteMode.value = mode === 'favorites'
  if (audio) audio.loop = true
  touchEnabled = false
  resetQuestion()
  favoriteMessage.value = ''

  const nextWords = activeWords.value
  const matchingIndex = nextWords.findIndex(word => word.id === currentId)
  index.value = matchingIndex >= 0 ? matchingIndex : 0

  if (dictation.value) {
    playCurrent()
    focusAnswer()
  }
}

function toggleDictation() {
  switchMode(dictation.value ? 'study' : 'dictation')
}

function nextQuestion() {
  if (editingMeaning.value) return
  if (!dictation.value || !['correct', 'shown'].includes(answerState.value)) return
  moveQuestion(1)
}

function moveQuestion(step) {
  if (!dictation.value || editingMeaning.value) return
  if (!activeWords.value.length) return
  stopAudio()
  playCount = 0
  index.value = (index.value + step + activeWords.value.length) % activeWords.value.length
  resetQuestion()
  playCurrent()
  focusAnswer()
}

function markCorrect() {
  stopAudio()
  answerState.value = 'correct'
  answerMessage.value = '回答正确！即将进入下一词'
  advanceTimer = setTimeout(nextQuestion, 800)
}

function checkAnswer() {
  if (composing.value || editingMeaning.value) return
  if (answerState.value === 'correct') return nextQuestion()
  if (!answer.value.trim()) {
    answerMessage.value = '请先填写中文释义'
    return
  }
  if (isAnswerCorrect(answer.value, current.value)) {
    markCorrect()
  } else {
    clearTimeout(advanceTimer)
    answerState.value = 'shown'
    answerMessage.value = '回答错误，正确释义和例句如下。你可以修改答案后重新检查。'
    reviewWords.value.add(current.value.id)
    focusAnswer()
  }
}

function showAnswer() {
  clearTimeout(advanceTimer)
  answerState.value = 'shown'
  answerMessage.value = '已加入待复习，可修改答案后重新检查，或进入下一词'
  reviewWords.value.add(current.value.id)
}

function acceptMyAnswer() {
  if (!['incorrect', 'shown'].includes(answerState.value)) return
  stopAudio()
  clearTimeout(advanceTimer)
  meaningDraft.value = current.value.meaning
  if (answer.value.trim() && !isAnswerCorrect(answer.value, current.value)) {
    meaningDraft.value += `；${answer.value.trim()}`
  }
  meaningError.value = ''
  editingMeaning.value = true
  nextTick(() => meaningEditor.value?.focus({ preventScroll: true }))
}

function saveMeaning() {
  if (!editingMeaning.value || composing.value) return
  const value = meaningDraft.value.trim()
  if (!meaningAnswers(value).length || !/[\u3400-\u9fff]/.test(value)) {
    meaningError.value = '请填写中文释义，多个含义用分号分开。'
    return
  }
  const updated = { ...customMeanings.value, [current.value.word]: value }
  try {
    localStorage.setItem(meaningStorageKey, JSON.stringify(updated))
  } catch {
    meaningError.value = '浏览器未能保存，请检查是否允许本地存储后重试。'
    return
  }
  customMeanings.value = updated
  editingMeaning.value = false
  reviewWords.value.delete(current.value.id)
  markCorrect()
}
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
const favoriteWords = computed(() => favoriteIds.value.map(id => wordById.get(id)).filter(Boolean))
const activeWords = computed(() => favoriteMode.value ? favoriteWords.value : words)
const current = computed(() => {
  const word = activeWords.value[index.value]
  if (!word) return null
  return { ...word, meaning: customMeanings.value[word.word] ?? word.meaning }
})
const isCurrentFavorite = computed(() => current.value ? favoriteIds.value.includes(current.value.id) : false)
const displayStyle = computed(() => ({
  '--quiz-word-size': `${84 * textScale.value}px`,
  '--quiz-word-fit-size': `${180 / Math.max(current.value?.word.length || 1, 1)}cqi`,
  '--desktop-quiz-word-fit-size': `${90 / Math.max(current.value?.word.length || 1, 1)}cqi`,
  '--word-size': `${Math.min(
    18 * textScale.value,
    165 / Math.max(current.value?.word.length || 1, 1),
  )}vw`,
  '--desktop-word-size': `${Math.min(
    18 * textScale.value,
    165 / Math.max(current.value?.word.length || 1, 1),
  ) * 0.5}vw`,
  '--desktop-meaning-size': `${Math.min(
    18 * textScale.value,
    165 / Math.max(current.value?.word.length || 1, 1),
  ) * 0.25}vw`,
  '--desktop-quiz-word-size': `${84 * textScale.value * 0.5}px`,
  '--desktop-quiz-meaning-size': `${84 * textScale.value * 0.25}px`,
  '--meaning-size': `${38 * textScale.value}px`,
  '--example-size': `${24 * textScale.value}px`,
  '--translation-size': `${20 * textScale.value}px`,
}))
let audio
let requestId = 0
let loadedWordId = null
let touchStartX = 0
let touchStartY = 0
let touchStartTime = 0
let touchEnabled = false
let ignoreClicksUntil = 0

function stopAudio() {
  requestId++
  audio?.pause()
  playing.value = false
}

async function playCurrent() {
  if (!audio || !current.value) return
  const request = ++requestId
  audio.pause()
  playing.value = false
  const wordId = current.value.id
  const filename = `${String(wordId - 1).padStart(6, '0')}_en.mp3`
  loadedWordId = wordId
  audio.src = `${import.meta.env.BASE_URL}audio/${filename}`
  audio.loop = dictation.value || !playMode.value
  audio.playbackRate = playbackRate.value
  audioMessage.value = ''
  try {
    await audio.play()
    if (request === requestId) playing.value = true
  } catch {
    if (request === requestId) audioMessage.value = '未能播放录音，请点击播放重试。'
  }
}

function handleWordClick() {
  if (Date.now() < ignoreClicksUntil) return
  togglePause()
}

async function togglePause() {
  if (!audio) return
  if (loadedWordId !== current.value.id) {
    playCount = 0
    playCurrent()
    return
  }
  if (!audio.paused) {
    requestId++
    audio.pause()
    playing.value = false
    return
  }
  if (!audio.src) {
    playCurrent()
    return
  }
  const request = ++requestId
  audioMessage.value = ''
  try {
    await audio.play()
    if (request === requestId) playing.value = true
  } catch {
    if (request === requestId) {
      playing.value = false
      audioMessage.value = '未能播放录音，请点击播放重试。'
    }
  }
}

function updatePlaybackRate() {
  if (audio) audio.playbackRate = playbackRate.value
}

function handleAudioEnded() {
  if (dictation.value || !playMode.value) {
    playing.value = false
    return
  }
  playCount += 1
  if (playCount >= 5) {
    playCount = 0
    if (!activeWords.value.length) return
    index.value = (index.value + 1) % activeWords.value.length
    revealed.value = false
  }
  playCurrent()
}

function togglePlayMode() {
  if (dictation.value || !current.value) return
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
    ? (numeric >= 1 && numeric <= activeWords.value.length ? numeric - 1 : -1)
    : activeWords.value.findIndex((item) => item.word.toLowerCase() === query.toLowerCase())
  if (targetIndex < 0) {
    jumpMessage.value = numeric !== null ? `请输入 1-${activeWords.value.length} 之间的序号` : '当前列表中没有这个单词'
    return
  }
  const resume = playing.value
  stopAudio()
  playCount = 0
  index.value = targetIndex
  if (dictation.value) resetQuestion()
  revealed.value = false
  jumpMessage.value = ''
  favoriteMessage.value = ''
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  if (dictation.value) {
    playCurrent()
    focusAnswer()
  } else if (resume) playCurrent()
}

function moveWord(step) {
  if (dictation.value) return
  if (!activeWords.value.length) return
  const resume = playing.value
  stopAudio()
  playCount = 0
  index.value = (index.value + step + activeWords.value.length) % activeWords.value.length
  revealed.value = false
  favoriteMessage.value = ''
  if (resume || playMode.value) playCurrent()
}

function toggleFavorite() {
  if (!current.value) return
  const currentId = current.value.id
  const removing = favoriteIds.value.includes(currentId)
  const updated = removing
    ? favoriteIds.value.filter(id => id !== currentId)
    : [...favoriteIds.value, currentId]

  try {
    localStorage.setItem(favoriteStorageKey, JSON.stringify(updated))
  } catch {
    favoriteMessage.value = '浏览器未能保存收藏，请检查是否允许本地存储后重试。'
    return
  }

  const resume = favoriteMode.value && (playing.value || playMode.value)
  if (favoriteMode.value && removing) stopAudio()
  favoriteIds.value = updated
  favoriteMessage.value = removing ? '已取消收藏' : '已收藏当前单词'

  if (favoriteMode.value && removing) {
    index.value = Math.min(index.value, favoriteWords.value.length - 1)
    if (index.value < 0) index.value = 0
    revealed.value = false
    if (!favoriteWords.value.length) playMode.value = false
    else if (resume) playCurrent()
  }
}

function handleTouchStart(event) {
  if (dictation.value || event.target.closest('input, button, select, .details')) {
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
  ignoreClicksUntil = Date.now() + 400
  moveWord(deltaY < 0 ? 1 : -1)
}

function handlePageClick(event) {
  if (dictation.value) return
  if (Date.now() < ignoreClicksUntil) return
  if (event.target !== event.currentTarget) return
  const mobilePointer = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900
  if (mobilePointer) moveWord(1)
}

function dictationShortcut(event, released = false) {
  if (event.isComposing || event.keyCode === 229 || composing.value || editingMeaning.value) return
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
  const target = event.target
  if (target?.closest('textarea, select, [contenteditable="true"]')) return
  const input = target?.closest('input')
  if (input && input.id !== 'meaning-answer') return
  if (event.key === 'Escape' && !released) {
    input?.blur()
    return
  }
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') {
    event.preventDefault()
    if (released) {
      if (answerState.value === 'correct') clearTimeout(advanceTimer)
      else showAnswer()
    }
    return
  }
  if (released || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  // Keep caret movement while editing an answer; empty/read-only inputs allow navigation.
  if (input && input.value && !input.readOnly) return
  event.preventDefault()
  if (!event.repeat) moveQuestion(event.key === 'ArrowRight' ? 1 : -1)
}

function onKeydown(event) {
  if (dictation.value) return dictationShortcut(event)
  if (event.target.closest('input, textarea')) return
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0' || event.code === 'Space' || event.key === ' ') {
    event.preventDefault()
    return
  }
  if (event.target.closest('button, select')) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  moveWord(event.key === 'ArrowRight' ? 1 : -1)
}

function onKeyup(event) {
  if (dictation.value) return dictationShortcut(event, true)
  if (event.target.closest('input, textarea')) return
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') {
    event.preventDefault()
    revealed.value = !revealed.value
    return
  }
  if (event.target.closest('button, select')) return
  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault()
    togglePause()
  }
}

onMounted(() => {
  audio = new Audio()
  audio.preload = 'auto'
  audio.addEventListener('error', () => {
    playing.value = false
    audioMessage.value = '录音加载失败，请联网后重试。'
  })
  audio.addEventListener('ended', handleAudioEnded)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
})

onBeforeUnmount(() => {
  clearTimeout(advanceTimer)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  stopAudio()
  if (audio) {
    audio.removeAttribute('src')
    audio.load()
    loadedWordId = null
    audio = undefined
  }
})
</script>
<template>
  <main
    class="word-page has-toolbar"
    :class="{ 'dictation-page': dictation }"
    aria-label="单词学习"
    :style="displayStyle"
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
    @click="handlePageClick"
  >
    <h1
      v-if="!dictation && current"
      class="word-content"
      @click="handleWordClick"
      :title="playing ? '暂停播放' : '播放录音'"
    >{{ current.word }}</h1>
    <header class="top-toolbar">
    <form class="jump-form" @submit.prevent="jumpToTarget">
      <label for="jump-query">跳转到</label>
      <input id="jump-query" v-model="jumpQuery" type="text" inputmode="text" placeholder="输入序号或单词" autocomplete="off" :disabled="!current" />
      <button type="submit" :disabled="!current">跳转</button>
      <button type="button" class="mode-toggle" :disabled="dictation || !current" :aria-pressed="playMode" @click="togglePlayMode">
        {{ playMode ? '停止播放模式' : '播放模式' }}
      </button>
      <div class="study-mode" role="group" aria-label="学习模式">
        <button type="button" :aria-pressed="!dictation && !favoriteMode" @click="switchMode('study')">学习模式</button>
        <button type="button" :aria-pressed="dictation" @click="switchMode('dictation')">听音写义</button>
        <button type="button" :aria-pressed="favoriteMode" @click="switchMode('favorites')">收藏模式</button>
      </div>
      <p v-if="jumpMessage" class="jump-message" role="status">{{ jumpMessage }}</p>
    </form>
    <div class="word-meta">
      <button type="button" class="favorite-toggle" :class="{ active: isCurrentFavorite }" :disabled="!current"
        :aria-pressed="isCurrentFavorite" @click="toggleFavorite">
        <span aria-hidden="true">{{ isCurrentFavorite ? '★' : '☆' }}</span>
        {{ isCurrentFavorite ? '取消收藏' : '收藏' }}
      </button>
      <span class="word-number">{{ current ? index + 1 : 0 }} / {{ activeWords.length }}</span>
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
    </header>
    <p v-if="favoriteMessage" class="favorite-message" role="status">{{ favoriteMessage }}</p>
    <section v-if="favoriteMode && !current" class="empty-favorites" aria-live="polite">
      <h1>暂无收藏单词</h1>
      <p>切换到学习模式，在顶部点击“收藏”添加单词。</p>
    </section>
    <button v-if="!dictation && current" class="reveal-button" @click="revealed = !revealed">
      {{ revealed ? '隐藏释义与例句' : '显示中文释义与例句' }}
    </button>
    <section v-if="dictation && current" class="dictation-panel">
      <div class="answer-context">
        <div class="quiz-prompt">
          <h1 class="word-content" @click="handleWordClick" :title="playing ? '暂停播放' : '播放录音'">{{ current.word }}</h1>
        </div>
        <div class="answer-entry">
          <label for="meaning-answer">中文释义</label>
          <input id="meaning-answer" ref="answerInput" v-model="answer" form="dictation-answer-form" autocomplete="off"
            placeholder="输入中文释义" :readonly="answerState === 'correct'"
            @compositionstart="composing = true" @compositionend="composing = false"
            @keydown.enter="($event.isComposing || composing || $event.keyCode === 229) && $event.preventDefault()" />
        </div>
      </div>
      <div class="dictation-actions">
        <button type="button" :aria-pressed="playing" @click="togglePause">{{ playing ? '暂停' : '播放' }}</button>
      </div>
      <p v-if="audioMessage" role="status">{{ audioMessage }}</p>
      <form id="dictation-answer-form" class="answer-form" @submit.prevent="checkAnswer">
        <p class="answer-feedback" :class="{ correct: answerState === 'correct' }" role="status">{{ answerMessage }}</p>
        <div class="dictation-actions">
          <button type="submit" class="primary-action" :disabled="editingMeaning">{{ answerState === 'correct' ? '下一个单词' : answerState === 'shown' ? '重新检查' : '检查答案' }}</button>
          <button v-if="answerState === 'shown'" type="button" :disabled="editingMeaning" @click="nextQuestion">下一个单词</button>
          <button v-if="!['correct', 'shown'].includes(answerState)" type="button" :disabled="editingMeaning" @click="showAnswer">查看答案</button>
          <button v-if="['incorrect', 'shown'].includes(answerState)" type="button" :disabled="editingMeaning" @click="acceptMyAnswer">我的也对 · 修改释义</button>
        </div>
      </form>
      <form v-if="editingMeaning" class="meaning-editor" @submit.prevent="saveMeaning">
        <label for="custom-meaning">修改 {{ current.word }} 的中文释义</label>
        <p>可补充或修改含义，用“；”分隔。保存后本题算对，后续显示和判题使用新释义。</p>
        <textarea id="custom-meaning" ref="meaningEditor" v-model="meaningDraft" rows="3"
          @compositionstart="composing = true" @compositionend="composing = false" />
        <p>仅保存在当前浏览器，刷新后仍保留。</p>
        <p v-if="meaningError" role="alert">{{ meaningError }}</p>
        <div class="dictation-actions">
          <button type="submit" class="primary-action">保存并算对</button>
          <button type="button" @click="editingMeaning = false; composing = false">取消</button>
        </div>
      </form>
      <div v-if="['correct', 'shown'].includes(answerState)" class="quiz-answer">
        <p class="meaning">{{ current.meaning }}</p>
        <div class="examples">
          <div v-if="current.example" class="example"><p>{{ current.example }}</p><p>{{ current.translation }}</p></div>
          <div v-if="current.example2" class="example"><p>{{ current.example2 }}</p><p>{{ current.translation2 }}</p></div>
        </div>
      </div>
    </section>
    <section v-if="!dictation && current && revealed" class="details" aria-live="polite">
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
