<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import words from './data/words.json'
import frequencyWords from './data/cet4-frequency-1616.json'
import listeningWords from './data/cet4-listening-1000.json'
import { isAnswerCorrect, meaningAnswers } from './answer-check.js'
import WordDetails from './components/WordDetails.vue'

function expandListeningWords(items) {
  const expanded = [...items]
  const seen = new Set(items.map(item => item.word.toLocaleLowerCase()))
  let nextId = Math.max(...items.map(item => item.id))

  for (const parent of items) {
    for (const form of parent.forms || []) {
      const word = form.form?.trim()
      const key = word?.toLocaleLowerCase()
      if (!word || seen.has(key)) continue
      seen.add(key)
      nextId += 1
      expanded.push({
        ...parent,
        id: nextId,
        word,
        meaning: parent.meaning,
        meanings: (parent.meanings || []).map(item => ({
          ...item,
          partOfSpeech: form.partOfSpeech || item.partOfSpeech,
          count: 0,
        })),
        forms: [],
        frequency: 0,
        formOf: parent.word,
        formGrammar: form.grammar || '词形',
        formPartOfSpeech: form.partOfSpeech || '',
      })
    }
  }

  return expanded
}

const expandedListeningWords = expandListeningWords(listeningWords)
const libraryStorageKey = 'aword-selected-library-v1'
const libraryOptions = [
  { id: 'core', label: '四级核心词汇' },
  { id: 'cet4-frequency-1616', label: '四级高频1616词' },
  { id: 'cet4-listening-1000', label: '四级听力1000词（英音）' },
]
const storageKeys = {
  core: {
    meanings: 'aword-custom-meanings-v1',
    favorites: 'aword-favorites-v1',
    progress: 'aword-progress-core-v1',
  },
  'cet4-frequency-1616': {
    meanings: 'aword-custom-meanings-cet4-frequency-1616-v1',
    favorites: 'aword-favorites-cet4-frequency-1616-v1',
    progress: 'aword-progress-cet4-frequency-1616-v1',
  },
  'cet4-listening-1000': {
    meanings: 'aword-custom-meanings-cet4-listening-1000-v1',
    favorites: 'aword-favorites-cet4-listening-1000-v1',
    progress: 'aword-progress-cet4-listening-1000-v1',
  },
}

function readSelectedLibrary() {
  try {
    const saved = localStorage.getItem(libraryStorageKey)
    return storageKeys[saved] ? saved : 'core'
  } catch {
    return 'core'
  }
}

const selectedLibrary = ref(readSelectedLibrary())
const libraryWords = computed(() => {
  if (selectedLibrary.value === 'cet4-frequency-1616') return frequencyWords
  if (selectedLibrary.value === 'cet4-listening-1000') return expandedListeningWords
  return words
})
const wordById = computed(() => new Map(libraryWords.value.map(word => [word.id, word])))

function readProgress(library = selectedLibrary.value) {
  try {
    const value = Number(localStorage.getItem(storageKeys[library].progress))
    const length = library === 'cet4-frequency-1616'
      ? frequencyWords.length
      : library === 'cet4-listening-1000' ? expandedListeningWords.length : words.length
    return Number.isInteger(value) && value >= 0 && value < length ? value : 0
  } catch {
    return 0
  }
}

function saveProgress() {
  if (favoriteMode.value) return
  try {
    localStorage.setItem(storageKeys[selectedLibrary.value].progress, String(index.value))
  } catch {
    favoriteMessage.value = '浏览器未能保存学习进度，请检查是否允许本地存储。'
  }
}

const index = ref(readProgress())
const dictation = ref(false)
const favoriteMode = ref(false)
const answer = ref('')
const answerInput = ref(null)
const answerState = ref('idle')
const answerMessage = ref('')
const composing = ref(false)
const audioMessage = ref('')
const reviewWords = ref(new Set())
const customMeanings = ref(readCustomMeanings())
const favoriteIds = ref(readFavorites())
const favoriteMessage = ref('')
const editingMeaning = ref(false)
const meaningDraft = ref('')
const meaningEditor = ref(null)
const meaningError = ref('')
const moreOpen = ref(false)
const detailsPanel = ref(null)

function readCustomMeanings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKeys[selectedLibrary.value].meanings) || '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'string' && value.trim()))
  } catch {
    return {}
  }
}

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKeys[selectedLibrary.value].favorites) || '[]')
    if (!Array.isArray(saved)) return []
    return [...new Set(saved.filter(id => Number.isInteger(id) && wordById.value.has(id)))]
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
  revealed.value = selectedLibrary.value === 'cet4-listening-1000' && !dictation.value
  resetDetailsPosition()
}

function resetDetailsPosition() {
  nextTick(() => {
    if (detailsPanel.value) detailsPanel.value.scrollTop = 0
    if (typeof window !== 'undefined' && window.innerWidth <= 600) window.scrollTo({ top: 0, behavior: 'auto' })
  })
}

function toggleReveal() {
  revealed.value = !revealed.value
  if (revealed.value) nextTick(() => { if (detailsPanel.value) detailsPanel.value.scrollTop = 0 })
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
  if (audio) audio.loop = false
  touchEnabled = false
  resetQuestion()
  favoriteMessage.value = ''
  moreOpen.value = false

  const nextWords = activeWords.value
  const matchingIndex = nextWords.findIndex(word => word.id === currentId)
  index.value = matchingIndex >= 0 ? matchingIndex : 0
  saveProgress()

  playCurrent()
  if (dictation.value) focusAnswer()
}

function changeLibrary(library) {
  if (!storageKeys[library] || library === selectedLibrary.value) return
  saveProgress()
  stopAudio()
  playMode.value = false
  playCount = 0
  dictation.value = false
  favoriteMode.value = false
  selectedLibrary.value = library
  try { localStorage.setItem(libraryStorageKey, library) } catch { /* The app remains usable without persistence. */ }
  customMeanings.value = readCustomMeanings()
  favoriteIds.value = readFavorites()
  reviewWords.value = new Set()
  index.value = readProgress(library)
  jumpQuery.value = ''
  jumpMessage.value = ''
  favoriteMessage.value = ''
  moreOpen.value = false
  resetQuestion()
  playCurrent()
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
  saveProgress()
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
    localStorage.setItem(storageKeys[selectedLibrary.value].meanings, JSON.stringify(updated))
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
const revealed = ref(selectedLibrary.value === 'cet4-listening-1000')
const playMode = ref(false)
const playbackRate = ref(1)
const speedOptions = [0.75, 1, 1.25, 1.5, 2]
const repeatCountOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const repeatCountStorageKey = 'aword-playback-repeat-count-v1'
function readRepeatCount() {
  try {
    const saved = Number(localStorage.getItem(repeatCountStorageKey))
    return repeatCountOptions.includes(saved) ? saved : 5
  } catch {
    return 5
  }
}
const repeatCount = ref(readRepeatCount())
const baseReplayDelay = 400
const textScale = ref(1)
const textScaleOptions = [0.75, 1, 1.25, 1.5]
let playCount = 0
let replayTimer
const jumpQuery = ref('')
const jumpMessage = ref('')
const favoriteWords = computed(() => favoriteIds.value.map(id => wordById.value.get(id)).filter(Boolean))
const activeWords = computed(() => favoriteMode.value ? favoriteWords.value : libraryWords.value)
const current = computed(() => {
  const word = activeWords.value[index.value]
  if (!word) return null
  return { ...word, meaning: customMeanings.value[word.word] ?? word.meaning }
})
const currentForms = computed(() => {
  const seen = new Set()
  return (current.value?.forms || []).filter(item => {
    if (!item.form || item.grammar?.includes('原形')) return false
    const key = [item.form, item.grammar, item.partOfSpeech].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
  '--mobile-word-max': `${48 * textScale.value}px`,
  '--mobile-body-size': `${16 * textScale.value}px`,
  '--mobile-example-size': `${17 * textScale.value}px`,
}))
let audio
let requestId = 0
let loadedWordKey = null
let audioKind = null
let speechUtterance = null
let queuedFormWords = []
let activeAudioWord = null
let touchStartX = 0
let touchStartY = 0
let touchStartTime = 0
let touchEnabled = false
let ignoreClicksUntil = 0

function stopAudio() {
  clearTimeout(replayTimer)
  replayTimer = undefined
  requestId++
  audio?.pause()
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
  speechUtterance = null
  queuedFormWords = []
  activeAudioWord = null
  playing.value = false
}

function currentWordKey() {
  return current.value ? `${selectedLibrary.value}:${current.value.id}` : ''
}

function playWithSystemVoice(request, word = current.value?.word) {
  if (!current.value || typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    if (request === requestId) audioMessage.value = '此词暂无录音，当前浏览器也不支持系统语音。'
    return
  }
  audioKind = 'speech'
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = selectedLibrary.value === 'cet4-listening-1000' ? 'en-GB' : 'en-US'
  utterance.rate = playbackRate.value
  utterance.onstart = () => {
    if (request === requestId) playing.value = true
  }
  utterance.onend = () => {
    if (request !== requestId) return
    playing.value = false
    handleAudioEnded()
  }
  utterance.onerror = () => {
    if (request === requestId) {
      playing.value = false
      audioMessage.value = '未能播放系统语音，请点击“播放单词”重试。'
    }
  }
  speechUtterance = utterance
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

async function playCurrent({ wordOnly = false } = {}) {
  if (!audio || !current.value) return
  stopAudio()
  const request = ++requestId
  playing.value = false
  loadedWordKey = currentWordKey()
  activeAudioWord = current.value.word
  queuedFormWords = !wordOnly && selectedLibrary.value === 'cet4-listening-1000'
    ? [...new Set(currentForms.value.map(item => item.form).filter(form => form && form.toLocaleLowerCase() !== current.value.word.toLocaleLowerCase()))]
    : []
  const audioId = selectedLibrary.value === 'core' ? current.value.id : current.value.audioId
  audioMessage.value = ''
  audioKind = audioId ? 'recording' : 'remote'
  if (audioId) {
    const filename = `${String(audioId - 1).padStart(6, '0')}_en.mp3`
    audio.src = `${import.meta.env.BASE_URL}audio/${filename}`
  } else {
    audio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(current.value.word)}&type=2`
  }
  audio.loop = false
  audio.playbackRate = playbackRate.value
  try {
    await audio.play()
    if (request === requestId) playing.value = true
  } catch {
    if (request === requestId) audioMessage.value = '自动播放受限，请点击“播放单词”手动播放。'
  }
}

function handleWordClick() {
  if (Date.now() < ignoreClicksUntil) return
  replayWord()
}

function replayWord() {
  if (!audio || !current.value) return
  playCount = 0
  playCurrent({ wordOnly: true })
}

async function togglePause() {
  if (!audio || !current.value) return
  if (replayTimer) {
    clearTimeout(replayTimer)
    replayTimer = undefined
    playing.value = false
    return
  }
  if (loadedWordKey !== currentWordKey()) {
    playCount = 0
    playCurrent()
    return
  }
  if (audioKind === 'speech') {
    if (playing.value) stopAudio()
    else playCurrent()
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
  if (audioKind === 'speech' && playing.value) playCurrent()
  if (replayTimer) scheduleReplay()
}

function updateRepeatCount() {
  if (!repeatCountOptions.includes(repeatCount.value)) repeatCount.value = 5
  playCount = 0
  try { localStorage.setItem(repeatCountStorageKey, String(repeatCount.value)) } catch { /* Keep the setting usable for this session. */ }
}

function playNextFormWord() {
  const word = queuedFormWords.shift()
  if (!word || !audio) return false
  const request = ++requestId
  activeAudioWord = word
  audioKind = 'remote'
  audioMessage.value = ''
  audio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`
  audio.loop = false
  audio.playbackRate = playbackRate.value
  audio.play().then(() => {
    if (request === requestId) playing.value = true
  }).catch(() => {
    if (request === requestId) audioMessage.value = '自动播放受限，请点击“播放单词”手动播放。'
  })
  return true
}

function replayDelay() {
  return baseReplayDelay / playbackRate.value
}

function scheduleReplay() {
  clearTimeout(replayTimer)
  playing.value = true
  replayTimer = setTimeout(() => {
    replayTimer = undefined
    playCurrent()
  }, replayDelay())
}

function handleAudioEnded() {
  if (playNextFormWord()) return
  if (!dictation.value && !playMode.value) {
    playing.value = false
    return
  }
  if (playMode.value) {
    playCount += 1
    if (playCount >= repeatCount.value) {
      playCount = 0
      if (!activeWords.value.length) return
      index.value = (index.value + 1) % activeWords.value.length
      saveProgress()
      revealed.value = selectedLibrary.value === 'cet4-listening-1000'
      resetDetailsPosition()
    }
  }
  scheduleReplay()
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
  stopAudio()
  playCount = 0
  index.value = targetIndex
  saveProgress()
  if (dictation.value) resetQuestion()
  revealed.value = selectedLibrary.value === 'cet4-listening-1000' && !dictation.value
  moreOpen.value = false
  resetDetailsPosition()
  jumpMessage.value = ''
  favoriteMessage.value = ''
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  playCurrent()
  if (dictation.value) focusAnswer()
}

function moveWord(step) {
  if (dictation.value) return
  if (!activeWords.value.length) return
  stopAudio()
  playCount = 0
  index.value = (index.value + step + activeWords.value.length) % activeWords.value.length
  saveProgress()
  revealed.value = selectedLibrary.value === 'cet4-listening-1000'
  resetDetailsPosition()
  favoriteMessage.value = ''
  playCurrent()
}

function toggleFavorite() {
  if (!current.value) return
  const currentId = current.value.id
  const removing = favoriteIds.value.includes(currentId)
  const updated = removing
    ? favoriteIds.value.filter(id => id !== currentId)
    : [...favoriteIds.value, currentId]

  try {
    localStorage.setItem(storageKeys[selectedLibrary.value].favorites, JSON.stringify(updated))
  } catch {
    favoriteMessage.value = '浏览器未能保存收藏，请检查是否允许本地存储后重试。'
    return
  }

  if (favoriteMode.value && removing) stopAudio()
  favoriteIds.value = updated
  favoriteMessage.value = ''

  if (favoriteMode.value && removing) {
    index.value = Math.min(index.value, favoriteWords.value.length - 1)
    if (index.value < 0) index.value = 0
    revealed.value = selectedLibrary.value === 'cet4-listening-1000'
    if (!favoriteWords.value.length) playMode.value = false
    else playCurrent()
  }
}

function handleTouchStart(event) {
  if (dictation.value || event.target.closest('input, button, select, textarea, summary, details, [contenteditable="true"]')) {
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
  if (elapsed > 800 || Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return
  ignoreClicksUntil = Date.now() + 400
  moveWord(deltaX < 0 ? 1 : -1)
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
    toggleReveal()
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
    if (audioKind === 'remote' && loadedWordKey === currentWordKey()) {
      const request = ++requestId
      playWithSystemVoice(request, activeAudioWord || current.value.word)
      return
    }
    audioMessage.value = '录音加载失败，请点击“播放单词”重试。'
  })
  audio.addEventListener('ended', handleAudioEnded)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
  playCurrent()
})

onBeforeUnmount(() => {
  clearTimeout(advanceTimer)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  stopAudio()
  if (audio) {
    audio.removeAttribute('src')
    audio.load()
    loadedWordKey = null
    audio = undefined
  }
})
</script>
<template>
  <main
    class="word-page has-toolbar"
    :class="{ 'has-study-actions': !dictation && current, 'dictation-page': dictation }"
    aria-label="单词学习"
    :style="displayStyle"
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
    @click="handlePageClick"
  >
    <header class="top-toolbar">
      <div class="toolbar-primary">
        <label class="library-control" for="library-select">
          <span>词库</span>
          <select id="library-select" :value="selectedLibrary" @change="changeLibrary($event.target.value)">
            <option v-for="library in libraryOptions" :key="library.id" :value="library.id">{{ library.label }}</option>
          </select>
        </label>
        <button type="button" class="more-toggle" :aria-expanded="moreOpen" aria-controls="more-panel" @click="moreOpen = !moreOpen">
          {{ moreOpen ? '收起' : '更多' }}
        </button>
      </div>
      <div class="study-mode" role="group" aria-label="学习模式">
        <button type="button" :aria-pressed="!dictation && !favoriteMode" @click="switchMode('study')">学习模式</button>
        <button type="button" :aria-pressed="dictation" @click="switchMode('dictation')">听音写义</button>
        <button type="button" :aria-pressed="favoriteMode" @click="switchMode('favorites')">收藏模式</button>
      </div>
      <form id="more-panel" class="more-panel" :class="{ 'is-open': moreOpen }" @submit.prevent="jumpToTarget">
        <div class="jump-control">
          <label for="jump-query">单词跳转</label>
          <div>
            <input id="jump-query" v-model="jumpQuery" type="text" inputmode="text" placeholder="输入序号或单词" autocomplete="off" :disabled="!current" />
            <button type="submit" :disabled="!current">跳转</button>
          </div>
        </div>
        <button type="button" class="mode-toggle" :disabled="dictation || !current" :aria-pressed="playMode" @click="togglePlayMode">
          {{ playMode ? '停止播放模式' : '开启播放模式' }}
        </button>
        <label class="speed-control">
          <span>播放速度与间隔</span>
          <select v-model.number="playbackRate" @change="updatePlaybackRate" aria-label="播放速度和间隔">
            <option v-for="speed in speedOptions" :key="speed" :value="speed">{{ speed }}×</option>
          </select>
        </label>
        <label class="size-control">
          <span>文字大小</span>
          <select v-model.number="textScale" aria-label="文字大小">
            <option v-for="scale in textScaleOptions" :key="scale" :value="scale">{{ scale }}×</option>
          </select>
        </label>
        <label class="repeat-control">
          <span>每词播放次数</span>
          <select v-model.number="repeatCount" @change="updateRepeatCount" aria-label="每词播放次数">
            <option v-for="count in repeatCountOptions" :key="count" :value="count">{{ count }} 次</option>
          </select>
        </label>
        <p v-if="jumpMessage" class="jump-message" role="status">{{ jumpMessage }}</p>
      </form>
    </header>
    <section v-if="!dictation && current" class="word-stage">
      <h1 class="word-content" @click="handleWordClick" title="播放单词">{{ current.word }}</h1>
      <p v-if="current.formOf" class="word-origin-note" :class="{ 'listening-word-origin-note': selectedLibrary === 'cet4-listening-1000' }">词性变化：{{ current.formOf }} 的 {{ current.formGrammar }}</p>
      <div v-if="currentForms.length" class="word-forms" :class="{ 'listening-word-forms': selectedLibrary === 'cet4-listening-1000' }" aria-label="词形变化">
        <span class="word-forms-title">词形变化</span>
        <span v-for="(item, itemIndex) in currentForms" :key="`${item.form}-${item.partOfSpeech}-${item.grammar}-${itemIndex}`"
          class="word-form-chip">
          <strong>{{ item.form }}</strong>
          <span>{{ [item.grammar, item.partOfSpeech].filter(Boolean).join(' · ') }}</span>
        </span>
      </div>
    </section>
    <div v-if="dictation && current" class="word-meta dictation-meta">
      <button type="button" class="audio-toggle" :aria-pressed="playing" @click="togglePause">{{ playing ? '暂停发音' : '播放发音' }}</button>
      <button type="button" class="favorite-toggle" :class="{ active: isCurrentFavorite }" :aria-pressed="isCurrentFavorite" @click="toggleFavorite">
        <span aria-hidden="true">{{ isCurrentFavorite ? '★' : '☆' }}</span>{{ isCurrentFavorite ? '取消收藏' : '收藏' }}
      </button>
      <span class="word-number">{{ index + 1 }} / {{ activeWords.length }}</span>
    </div>
    <p v-if="audioMessage" class="audio-message" role="status">{{ audioMessage }}</p>
    <p v-if="favoriteMessage" class="favorite-message" role="status">{{ favoriteMessage }}</p>
    <section v-if="favoriteMode && !current" class="empty-favorites" aria-live="polite">
      <h1>暂无收藏单词</h1>
      <p>切换到学习模式，在顶部点击“收藏”添加单词。</p>
    </section>
    <div v-if="!dictation && current" class="study-bottom-actions">
      <div class="word-meta study-meta">
        <button type="button" class="audio-toggle" @click="replayWord">播放单词</button>
        <button type="button" class="favorite-toggle" :class="{ active: isCurrentFavorite }"
          :aria-pressed="isCurrentFavorite" @click="toggleFavorite">
          <span aria-hidden="true">{{ isCurrentFavorite ? '★' : '☆' }}</span>
          {{ isCurrentFavorite ? '取消收藏' : '收藏' }}
        </button>
        <span class="word-number">{{ index + 1 }} / {{ activeWords.length }}</span>
      </div>
      <button type="button" class="reveal-button" @click="toggleReveal">
        {{ revealed ? '隐藏释义与例句' : '显示中文释义与例句' }}
      </button>
    </div>
    <section v-if="dictation && current" class="dictation-panel">
      <div class="answer-context">
        <div class="quiz-prompt">
          <h1 class="word-content" @click="handleWordClick" :title="playing ? '暂停播放' : '播放录音'">{{ current.word }}</h1>
          <p v-if="current.formOf" class="word-origin-note" :class="{ 'listening-word-origin-note': selectedLibrary === 'cet4-listening-1000' }">词性变化：{{ current.formOf }} 的 {{ current.formGrammar }}</p>
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
        <WordDetails :key="`${selectedLibrary}:${current.id}:quiz`" :word="current" />
      </div>
    </section>
    <section v-if="!dictation && current && revealed" ref="detailsPanel" class="details" aria-live="polite">
      <WordDetails :key="`${selectedLibrary}:${current.id}:study`" :word="current" />
    </section>
  </main>
</template>
