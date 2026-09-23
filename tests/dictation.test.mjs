import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, computed } from 'vue'
import { isAnswerCorrect, meaningAnswers } from '../src/answer-check.js'

const words = JSON.parse(readFileSync(new URL('../src/data/words.json', import.meta.url)))
const frequencyWords = JSON.parse(readFileSync(new URL('../src/data/cet4-frequency-1616.json', import.meta.url)))
const listeningWords = JSON.parse(readFileSync(new URL('../src/data/cet4-listening-1000.json', import.meta.url)))
const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  .split('<script setup>')[1].split('</script>')[0]
  .replace(/^import .*$/gm, '').replaceAll('import.meta.env.BASE_URL', "'/Aword/'")

function createSession(storage = new Map(), failSave = false) {
  let mounted
  let disposed
  let timerId = 0
  const timers = new Map()
  const timerDelays = new Map()
  class Audio {
    paused = true
    src = ''
    currentTime = 0
    plays = []
    play() { this.paused = false; this.plays.push(this.src); return Promise.resolve() }
    pause() { this.paused = true }
    addEventListener() {}
    removeAttribute() { this.src = '' }
    load() {}
  }
  const context = vm.createContext({
    ref, computed, words, frequencyWords, listeningWords, isAnswerCorrect, meaningAnswers, Audio,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (failSave) throw new Error('Storage unavailable')
        storage.set(key, value)
      },
    },
    nextTick: fn => Promise.resolve().then(fn),
    onMounted: fn => { mounted = fn },
    onBeforeUnmount: fn => { disposed = fn },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { activeElement: null },
    HTMLElement: class {},
    setTimeout: (fn, delay) => {
      const id = ++timerId
      timers.set(id, () => {
        timers.delete(id)
        timerDelays.delete(id)
        fn()
      })
      timerDelays.set(id, delay)
      return id
    },
    clearTimeout: id => {
      timers.delete(id)
      timerDelays.delete(id)
    },
  })
  vm.runInContext(source + `\nglobalThis.session = {
    dictation, answer, answerState, answerMessage, revealed, current, index, composing, audioMessage,
    reviewWords, playMode, toggleDictation, checkAnswer, showAnswer, acceptMyAnswer,
    nextQuestion, moveWord, handlePageClick, handleTouchStart, handleTouchEnd, handleAudioEnded, onKeyup, onKeydown,
    jumpToTarget, jumpQuery, jumpMessage,
    editingMeaning, meaningDraft, meaningError, saveMeaning,
    togglePause, playing, playbackRate, updatePlaybackRate, replayDelay,
    favoriteMode, favoriteIds, favoriteWords, activeWords, favoriteMessage,
    isCurrentFavorite, switchMode, toggleFavorite,
    selectedLibrary, libraryWords, changeLibrary, saveProgress,
    get audio() { return audio },
  }`, context)
  mounted()
  return { ...context.session, timers, timerDelays, dispose: () => disposed() }
}

test('opening the page automatically plays once and keeps manual playback available', async () => {
  const s = createSession()
  await new Promise(setImmediate)
  assert.equal(s.audio.plays.length, 1)
  assert.equal(s.audio.paused, false)
  assert.equal(s.playing.value, true)
  await s.togglePause()
  assert.equal(s.audio.paused, true)
  await s.togglePause()
  await new Promise(setImmediate)
  assert.equal(s.audio.plays.length, 2)
  assert.equal(s.playing.value, true)
  assert.match(s.audio.src, /000001_en.mp3$/)
  s.dispose()
})

test('complete meaning units, punctuation, synonyms and incorrect fragments', () => {
  assert.equal(isAnswerCorrect('空间', words[0]), true)
  assert.equal(isAnswerCorrect(' 太空。 ', words[0]), true)
  assert.equal(isAnswerCorrect('空间；太空', words[0]), true)
  assert.equal(isAnswerCorrect('空', words[0]), false)
  assert.equal(isAnswerCorrect('空间；苹果', words[0]), false)
  assert.equal(isAnswerCorrect('不是空间', words[0]), false)
  assert.equal(isAnswerCorrect(' ', words[0]), false)
  assert.equal(isAnswerCorrect('团结起来', words[2]), true)
})

test('dictation loops the current word, waits for an answer, and blocks learning navigation', async () => {
  const s = createSession()
  s.toggleDictation()
  await Promise.resolve()
  assert.equal(s.audio.loop, false)
  assert.match(s.audio.src, /000001_en.mp3$/)
  for (let i = 0; i < 5; i++) s.handleAudioEnded()
  s.moveWord(1)
  s.handlePageClick({})
  assert.equal(s.index.value, 0)
  assert.equal(s.revealed.value, false)
  s.answer.value = '空间'
  s.checkAnswer()
  assert.equal(s.answerState.value, 'correct')
  assert.equal(s.timers.size, 1)
  ;[...s.timers.values()][0]()
  assert.equal(s.index.value, 1)
  assert.equal(s.answer.value, '')
  assert.equal(s.answerState.value, 'idle')
  assert.match(s.audio.src, /000002_en.mp3$/)
  assert.equal(s.timers.size, 0)
  s.dispose()
})

test('dictation pause resumes at the same position and new questions auto-play in a loop', async () => {
  const s = createSession()
  s.toggleDictation()
  await new Promise(setImmediate)
  assert.equal(s.playing.value, true)
  s.audio.currentTime = 0.6
  await s.togglePause()
  assert.equal(s.audio.paused, true)
  assert.equal(s.playing.value, false)
  assert.equal(s.audio.currentTime, 0.6)
  await s.togglePause()
  assert.equal(s.audio.paused, false)
  assert.equal(s.playing.value, true)
  assert.equal(s.audio.currentTime, 0.6)
  assert.equal(s.audio.loop, false)
  await s.togglePause()
  s.jumpQuery.value = '2'
  s.jumpToTarget()
  await new Promise(setImmediate)
  assert.equal(s.audio.loop, false)
  assert.equal(s.playing.value, true)
  assert.match(s.audio.src, /000002_en.mp3$/)
  s.dispose()
})

test('playback speed scales audio duration and the replay interval together', async () => {
  const s = createSession()
  s.toggleDictation()
  await new Promise(setImmediate)

  s.handleAudioEnded()
  assert.equal(s.playing.value, true)
  assert.equal([...s.timerDelays.values()][0], 400)

  s.playbackRate.value = 2
  s.updatePlaybackRate()
  assert.equal(s.audio.playbackRate, 2)
  assert.equal([...s.timerDelays.values()][0], 200)

  const replay = [...s.timers.values()][0]
  replay()
  await new Promise(setImmediate)
  assert.equal(s.audio.plays.length, 3)
  assert.equal(s.audio.playbackRate, 2)

  s.handleAudioEnded()
  s.playbackRate.value = 0.75
  s.updatePlaybackRate()
  assert.equal(Math.round([...s.timerDelays.values()][0]), 533)
  s.dispose()
})

test('revealing the answer preserves playback, position, and a manual pause', async () => {
  const s = createSession()
  s.toggleDictation()
  await new Promise(setImmediate)
  s.audio.currentTime = 0.6
  const source = s.audio.src
  const playCalls = s.audio.plays.length

  s.showAnswer()
  assert.equal(s.answerState.value, 'shown')
  assert.equal(s.playing.value, true)
  assert.equal(s.audio.paused, false)
  assert.equal(s.audio.loop, false)
  assert.equal(s.audio.src, source)
  assert.equal(s.audio.currentTime, 0.6)
  assert.equal(s.audio.plays.length, playCalls)

  s.onKeyup(keyEvent('0'))
  assert.equal(s.playing.value, true)
  assert.equal(s.audio.paused, false)

  await s.togglePause()
  s.showAnswer()
  s.onKeyup(keyEvent('0'))
  assert.equal(s.playing.value, false)
  assert.equal(s.audio.paused, true)
  assert.equal(s.audio.currentTime, 0.6)
  assert.equal(s.audio.plays.length, playCalls)
  s.dispose()
})

test('revealing while playback starts does not cancel the pending play request', async () => {
  const s = createSession()
  s.toggleDictation()
  s.onKeyup(keyEvent('0'))
  await new Promise(setImmediate)
  assert.equal(s.answerState.value, 'shown')
  assert.equal(s.playing.value, true)
  assert.equal(s.audio.paused, false)
  assert.equal(s.audio.loop, false)
  s.dispose()
})

test('IME, wrong answers reveal results immediately, and self-assessment', async () => {
  const s = createSession()
  s.toggleDictation()
  await new Promise(setImmediate)
  s.answer.value = '空间'
  s.composing.value = true
  s.checkAnswer()
  assert.equal(s.answerState.value, 'idle')
  s.composing.value = false
  s.answer.value = '地方'
  s.checkAnswer()
  assert.equal(s.answerState.value, 'shown')
  assert.match(s.answerMessage.value, /回答错误/)
  assert.equal(s.playing.value, true)
  assert.equal(s.audio.paused, false)
  assert.equal(s.index.value, 0)
  assert.equal(s.reviewWords.value.size, 1)
  assert.equal(s.timers.size, 0)
  s.acceptMyAnswer()
  assert.equal(s.editingMeaning.value, true)
  assert.match(s.meaningDraft.value, /地方/)
  assert.equal(s.timers.size, 0)
  s.saveMeaning()
  assert.equal(s.answerState.value, 'correct')
  assert.equal(s.reviewWords.value.size, 0)
  s.toggleDictation()
  assert.equal(s.timers.size, 0)
  s.toggleDictation()
  s.answer.value = '地方'
  s.checkAnswer()
  assert.equal(s.answerState.value, 'correct')
  s.dispose()
  assert.equal(s.timers.size, 0)
})

test('manual advance cancels auto advance and leaving mode cancels pending timer', () => {
  const s = createSession()
  s.toggleDictation()
  s.answer.value = '空间'
  s.checkAnswer()
  s.checkAnswer()
  assert.equal(s.index.value, 1)
  assert.equal(s.timers.size, 0)
  s.answer.value = '宇宙'
  s.checkAnswer()
  s.toggleDictation()
  assert.equal(s.dictation.value, false)
  assert.equal(s.audio.loop, false)
  assert.equal(s.playMode.value, false)
  assert.equal(s.timers.size, 0)
  assert.equal(s.index.value, 1)
  s.dispose()
})

test('edited definitions persist across sessions and replace displayed and accepted meanings', () => {
  const storage = new Map()
  const s = createSession(storage)
  s.toggleDictation()
  s.answer.value = '场所'
  s.checkAnswer()
  s.acceptMyAnswer()
  s.meaningDraft.value = '地点；场所'
  s.checkAnswer()
  assert.equal(s.index.value, 0)
  s.saveMeaning()
  assert.equal(s.current.value.meaning, '地点；场所')
  assert.equal(s.answerState.value, 'correct')
  s.dispose()
  const restored = createSession(storage)
  assert.equal(restored.current.value.meaning, '地点；场所')
  restored.toggleDictation()
  restored.answer.value = '场所'
  restored.checkAnswer()
  assert.equal(restored.answerState.value, 'correct')
  assert.equal(isAnswerCorrect('空间', restored.current.value), false)
  assert.equal(words[0].meaning, 'n. 空间；太空')
  restored.dispose()
})

test('invalid edits and storage failures do not advance or change the definition', () => {
  const s = createSession(new Map(), true)
  s.toggleDictation()
  s.showAnswer()
  s.acceptMyAnswer()
  s.meaningDraft.value = '； '
  s.saveMeaning()
  assert.ok(s.meaningError.value)
  s.meaningDraft.value = '场所'
  s.saveMeaning()
  assert.match(s.meaningError.value, /未能保存/)
  assert.equal(s.current.value.meaning, words[0].meaning)
  assert.equal(s.editingMeaning.value, true)
  assert.equal(s.timers.size, 0)
  s.toggleDictation()
  assert.equal(s.editingMeaning.value, false)
  s.dispose()
})

function keyEvent(key, input = null, overrides = {}) {
  return { key, target: { closest: selector => selector === 'input' ? input : null },
    preventDefault() { this.prevented = true }, ...overrides }
}

test('dictation 0 reveals from the answer input and arrow keys load the matching word', () => {
  const s = createSession()
  s.toggleDictation()
  const input = { id: 'meaning-answer', value: '', readOnly: false }
  const zero = keyEvent('0', input)
  s.onKeydown(zero)
  assert.equal(zero.prevented, true)
  assert.equal(s.answerState.value, 'idle')
  s.onKeyup(zero)
  assert.equal(s.answerState.value, 'shown')
  assert.equal(s.reviewWords.value.size, 1)
  s.onKeydown(keyEvent('ArrowRight', input))
  assert.equal(s.index.value, 1)
  assert.equal(s.answerState.value, 'idle')
  assert.match(s.audio.src, /000002_en.mp3$/)
  s.onKeydown(keyEvent('ArrowLeft', input))
  assert.equal(s.index.value, 0)
  assert.match(s.audio.src, /000001_en.mp3$/)
  s.onKeydown(keyEvent('ArrowLeft', input))
  assert.equal(s.index.value, words.length - 1)
  s.dispose()
})

test('shortcuts protect IME and edits, and cancel automatic advancement', () => {
  const s = createSession()
  s.toggleDictation()
  const input = { id: 'meaning-answer', value: '空间', readOnly: false }
  s.onKeydown(keyEvent('ArrowRight', input))
  assert.equal(s.index.value, 0)
  s.onKeyup(keyEvent('0', input, { isComposing: true }))
  assert.equal(s.answerState.value, 'idle')
  s.answer.value = '空间'
  s.checkAnswer()
  s.onKeydown(keyEvent('ArrowRight'))
  assert.equal(s.index.value, 1)
  assert.equal(s.answer.value, '')
  assert.equal(s.timers.size, 0)
  s.answer.value = '宇宙'
  s.checkAnswer()
  s.onKeyup(keyEvent('0'))
  assert.equal(s.timers.size, 0)
  assert.equal(s.answerState.value, 'correct')
  s.showAnswer()
  s.acceptMyAnswer()
  s.onKeydown(keyEvent('ArrowRight'))
  s.onKeyup(keyEvent('0'))
  assert.equal(s.index.value, 1)
  assert.equal(s.editingMeaning.value, true)
  s.dispose()
})

test('dictation jumps by number or word and cancels a pending correct-answer advance', () => {
  const s = createSession()
  s.toggleDictation()
  s.answer.value = '空间'
  s.checkAnswer()
  assert.equal(s.timers.size, 1)
  s.jumpQuery.value = '3'
  s.jumpToTarget()
  assert.equal(s.index.value, 2)
  assert.equal(s.answer.value, '')
  assert.equal(s.answerState.value, 'idle')
  assert.equal(s.timers.size, 0)
  assert.match(s.audio.src, /000003_en.mp3$/)
  s.showAnswer()
  s.jumpQuery.value = ' SPACE '
  s.jumpToTarget()
  assert.equal(s.index.value, 0)
  assert.equal(s.answerState.value, 'idle')
  assert.equal(s.revealed.value, false)
  assert.match(s.audio.src, /000001_en.mp3$/)
  s.answer.value = '尚未提交'
  for (const invalid of ['0', '999999', 'missing-word']) {
    s.jumpQuery.value = invalid
    s.jumpToTarget()
    assert.equal(s.index.value, 0)
    assert.equal(s.answer.value, '尚未提交')
    assert.ok(s.jumpMessage.value)
  }
  s.dispose()
})

test('after revealing, resubmission checks edits without skipping or hiding the answer', () => {
  const s = createSession()
  s.toggleDictation()
  s.answer.value = '错误答案'
  s.showAnswer()
  s.checkAnswer()
  assert.equal(s.index.value, 0)
  assert.equal(s.answerState.value, 'shown')
  assert.equal(s.timers.size, 0)
  s.answer.value = ''
  s.checkAnswer()
  assert.equal(s.index.value, 0)
  assert.equal(s.answerState.value, 'shown')
  s.answer.value = '空间'
  s.checkAnswer()
  assert.equal(s.answerState.value, 'correct')
  assert.equal(s.timers.size, 1)
  ;[...s.timers.values()][0]()
  assert.equal(s.index.value, 1)
  s.showAnswer()
  s.nextQuestion()
  assert.equal(s.index.value, 2)
  s.dispose()
})

test('favorites persist in collection order and can be removed from the top action', () => {
  const storage = new Map()
  const s = createSession(storage)
  s.toggleFavorite()
  assert.equal(s.isCurrentFavorite.value, true)
  assert.deepEqual([...s.favoriteIds.value], [words[0].id])
  s.moveWord(2)
  s.toggleFavorite()
  assert.deepEqual([...s.favoriteIds.value], [words[0].id, words[2].id])
  s.toggleFavorite()
  assert.deepEqual([...s.favoriteIds.value], [words[0].id])
  s.dispose()

  const restored = createSession(storage)
  assert.deepEqual([...restored.favoriteIds.value], [words[0].id])
  restored.dispose()
})

test('favorite mode navigates only favorites and keeps an explicit empty state', () => {
  const s = createSession()
  s.toggleFavorite()
  s.moveWord(2)
  s.toggleFavorite()
  s.switchMode('favorites')
  assert.equal(s.favoriteMode.value, true)
  assert.equal(s.current.value.id, words[2].id)
  assert.equal(s.activeWords.value.length, 2)
  s.moveWord(1)
  assert.equal(s.current.value.id, words[0].id)
  s.jumpQuery.value = '2'
  s.jumpToTarget()
  assert.equal(s.current.value.id, words[2].id)
  s.toggleFavorite()
  assert.equal(s.current.value.id, words[0].id)
  s.toggleFavorite()
  assert.equal(s.current.value, null)
  assert.equal(s.favoriteMode.value, true)
  assert.equal(s.activeWords.value.length, 0)
  s.dispose()
})

test('horizontal swipes navigate left to next and right to previous without hijacking vertical scroll', () => {
  const s = createSession()
  const touch = (x, y, interactive = false) => ({
    changedTouches: [{ clientX: x, clientY: y }],
    target: { closest: () => interactive ? {} : null },
  })

  s.moveWord(1)
  assert.equal(s.index.value, 1)
  s.handleTouchStart(touch(240, 120))
  s.handleTouchEnd(touch(120, 126))
  assert.equal(s.index.value, 2)

  s.handleTouchStart(touch(100, 120))
  s.handleTouchEnd(touch(230, 126))
  assert.equal(s.index.value, 1)

  s.handleTouchStart(touch(120, 100))
  s.handleTouchEnd(touch(128, 220))
  assert.equal(s.index.value, 1)

  s.handleTouchStart(touch(230, 120, true))
  s.handleTouchEnd(touch(100, 120, true))
  assert.equal(s.index.value, 1)
  s.dispose()
})

test('frequency library contains exactly 1616 unique ranked words with linked detail sections', () => {
  assert.equal(frequencyWords.length, 1616)
  assert.equal(new Set(frequencyWords.map(item => item.word.toLowerCase())).size, 1616)
  assert.deepEqual(frequencyWords.map(item => item.rank), Array.from({ length: 1616 }, (_, index) => index + 1))
  assert.equal(frequencyWords[0].word, 'would')
  assert.ok(frequencyWords[0].meaning)
  assert.ok(frequencyWords[0].meanings.length)
  assert.ok(frequencyWords[0].analysis.length)
  assert.ok(frequencyWords[0].forms.length)
  assert.ok(frequencyWords[0].collocations.length)
  assert.ok(frequencyWords[0].meanings[0].examples[0].text)
  assert.equal(frequencyWords[0].meanings[0].examples[0].translation, '')
})

test('listening library contains 1000 words with separate sense rows and requests British audio', async () => {
  assert.equal(listeningWords.length, 1000)
  assert.equal(new Set(listeningWords.map(item => item.word.toLowerCase())).size, 1000)
  assert.ok(listeningWords.every(item => item.meanings?.length && item.meanings.every(sense => sense.partOfSpeech && sense.meaning)))

  const s = createSession()
  s.changeLibrary('cet4-listening-1000')
  await new Promise(setImmediate)
  assert.equal(s.selectedLibrary.value, 'cet4-listening-1000')
  assert.equal(s.activeWords.value.length, 1751)
  assert.equal(s.current.value.word, 'person')
  assert.equal(s.audio.src, 'https://dict.youdao.com/dictvoice?audio=person&type=2')
  assert.equal(s.revealed.value, true)
  const people = s.libraryWords.value.find(item => item.word === 'people')
  assert.equal(people.formOf, 'person')
  assert.equal(people.formGrammar, '词形')
  assert.equal(people.meanings[0].meaning, '人')
  assert.equal(people.meanings[0].count, 0)
  s.jumpQuery.value = 'parents'
  s.jumpToTarget()
  assert.equal(s.current.value.word, 'parents')
  assert.equal(s.current.value.formOf, 'parent')
  assert.equal(s.audio.src, 'https://dict.youdao.com/dictvoice?audio=parents&type=2')
  s.dispose()
})

test('playing a listening word also reads its listed forms in sequence', async () => {
  const s = createSession()
  s.changeLibrary('cet4-listening-1000')
  s.jumpQuery.value = 'far'
  s.jumpToTarget()
  assert.equal(s.audio.src, 'https://dict.youdao.com/dictvoice?audio=far&type=2')
  s.handleAudioEnded()
  assert.equal(s.audio.src, 'https://dict.youdao.com/dictvoice?audio=further&type=2')
  await Promise.resolve()
  assert.equal(s.playing.value, true)
  s.dispose()
})

test('listening word definitions use the original centered Chinese meaning style', () => {
  const details = readFileSync(new URL('../src/components/WordDetails.vue', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.match(details, /v-if="isListeningWord" class="listening-summary-section"/)
  assert.match(details, /class="meaning"/)
  assert.match(details, /v-else class="detail-section summary-section"/)
  assert.doesNotMatch(details, /audio-source-note/)
  assert.match(details, /class="detail-list sense-list"/)
  assert.match(app, /词性变化：\{\{ current\.formOf \}\}/)
  assert.match(app, /listening-word-forms/)
})

test('library progress and favorites persist independently and restore on re-entry', () => {
  const storage = new Map()
  const s = createSession(storage)
  s.toggleFavorite()
  s.moveWord(4)
  assert.equal(storage.get('aword-progress-core-v1'), '4')

  s.changeLibrary('cet4-frequency-1616')
  assert.equal(s.selectedLibrary.value, 'cet4-frequency-1616')
  assert.equal(s.activeWords.value.length, 1616)
  assert.equal(s.current.value.word, 'would')
  assert.deepEqual([...s.favoriteIds.value], [])
  s.toggleFavorite()
  s.jumpQuery.value = '17'
  s.jumpToTarget()
  assert.equal(s.index.value, 16)
  assert.equal(storage.get('aword-progress-cet4-frequency-1616-v1'), '16')
  assert.equal(storage.get('aword-favorites-cet4-frequency-1616-v1'), '[1]')
  s.dispose()

  const restored = createSession(storage)
  assert.equal(restored.selectedLibrary.value, 'cet4-frequency-1616')
  assert.equal(restored.index.value, 16)
  assert.deepEqual([...restored.favoriteIds.value], [1])
  restored.changeLibrary('core')
  assert.equal(restored.index.value, 4)
  assert.deepEqual([...restored.favoriteIds.value], [words[0].id])
  restored.dispose()
})
