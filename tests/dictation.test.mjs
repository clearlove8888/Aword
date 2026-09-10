import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, computed } from 'vue'
import { isAnswerCorrect, meaningAnswers } from '../src/answer-check.js'

const words = JSON.parse(readFileSync(new URL('../src/data/words.json', import.meta.url)))
const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  .split('<script setup>')[1].split('</script>')[0]
  .replace(/^import .*$/gm, '').replaceAll('import.meta.env.BASE_URL', "'/Aword/'")

function createSession(storage = new Map(), failSave = false) {
  let mounted
  let disposed
  let timerId = 0
  const timers = new Map()
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
    ref, computed, words, isAnswerCorrect, meaningAnswers, Audio,
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
    setTimeout: fn => { timers.set(++timerId, fn); return timerId },
    clearTimeout: id => timers.delete(id),
  })
  vm.runInContext(source + `\nglobalThis.session = {
    dictation, answer, answerState, answerMessage, revealed, current, index, composing,
    reviewWords, playMode, toggleDictation, checkAnswer, showAnswer, acceptMyAnswer,
    nextQuestion, moveWord, handlePageClick, handleAudioEnded, onKeyup, onKeydown,
    jumpToTarget, jumpQuery, jumpMessage,
    editingMeaning, meaningDraft, meaningError, saveMeaning,
    togglePause, playing,
    get audio() { return audio },
  }`, context)
  mounted()
  return { ...context.session, timers, dispose: () => disposed() }
}

test('opening the page stays silent until playback is requested', async () => {
  const s = createSession()
  await new Promise(setImmediate)
  assert.equal(s.audio.plays.length, 0)
  assert.equal(s.audio.paused, true)
  assert.equal(s.playing.value, false)
  await s.togglePause()
  await new Promise(setImmediate)
  assert.equal(s.audio.plays.length, 1)
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
  assert.equal(s.audio.loop, true)
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
  assert.equal(s.audio.loop, true)
  await s.togglePause()
  s.jumpQuery.value = '2'
  s.jumpToTarget()
  await new Promise(setImmediate)
  assert.equal(s.audio.loop, true)
  assert.equal(s.playing.value, true)
  assert.match(s.audio.src, /000002_en.mp3$/)
  s.dispose()
})

test('IME, wrong answers, revealing and self-assessment', () => {
  const s = createSession()
  s.toggleDictation()
  s.answer.value = '空间'
  s.composing.value = true
  s.checkAnswer()
  assert.equal(s.answerState.value, 'idle')
  s.composing.value = false
  s.answer.value = '地方'
  s.checkAnswer()
  assert.equal(s.answerState.value, 'incorrect')
  assert.equal(s.index.value, 0)
  assert.equal(s.reviewWords.value.size, 1)
  assert.equal(s.timers.size, 0)
  s.showAnswer()
  assert.equal(s.answerState.value, 'shown')
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
  assert.equal(s.audio.loop, true)
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
