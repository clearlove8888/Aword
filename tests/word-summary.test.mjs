import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summarizeWord } from '../src/word-summary.js'

const frequencyWords = JSON.parse(readFileSync(new URL('../src/data/cet4-frequency-1616.json', import.meta.url)))
const byWord = new Map(frequencyWords.map(word => [word.word, word]))

test('all 1616 words reach 90% when classified data allows it and flag insufficient coverage', () => {
  assert.equal(frequencyWords.length, 1616)
  for (const word of frequencyWords) {
    const summary = summarizeWord(word)
    const classifiedCount = word.analysis
      .filter(item => item.meaning?.trim() && !/无法可靠判断|需人工确认/.test(item.meaning))
      .reduce((sum, item) => sum + item.count, 0)
    assert.equal(summary.total, word.corpusFrequency, word.word)
    assert.ok(summary.covered <= classifiedCount, word.word)
    if (summary.total > 0 && classifiedCount >= summary.total * 0.9) {
      assert.equal(summary.meetsCoverage, true, word.word)
      assert.ok(summary.covered >= summary.total * 0.9, `${word.word}: ${summary.covered}/${summary.total}`)
    }
    if (classifiedCount < summary.total * 0.9) {
      assert.equal(summary.meetsCoverage, false, word.word)
      assert.equal(summary.covered, classifiedCount, word.word)
    }
    assert.ok(summary.groups.length, word.word)
    assert.ok(summary.groups.every(group => group.meanings.length), word.word)
    if (summary.total === 0) assert.equal(summary.meetsCoverage, false, word.word)
    assert.ok(!summary.groups.some(group => group.meanings.some(meaning => /无法可靠判断|需人工确认/.test(meaning))), word.word)
  }
})

test('the heading keeps only concise meanings and includes another part of speech when needed', () => {
  const average = summarizeWord(byWord.get('average'))
  assert.deepEqual(average.groups, [{ partOfSpeech: 'adj.', meanings: ['平均的', '普通的'] }])
  assert.equal(average.covered, 82)
  assert.equal(average.total, 84)

  const benefit = summarizeWord(byWord.get('benefit'))
  assert.deepEqual(benefit.groups, [
    { partOfSpeech: 'n.', meanings: ['好处'] },
    { partOfSpeech: 'v.', meanings: ['使受益'] },
  ])

  const would = summarizeWord(byWord.get('would'))
  assert.deepEqual(would.groups, [{ partOfSpeech: 'aux.', meanings: ['会', '将要', '总是'] }])
  assert.equal(would.covered, 346)
  assert.equal(would.total, 368)
})

test('a secondary part of speech is included when needed to reach exactly 90%', () => {
  const summary = summarizeWord({
    corpusFrequency: 100,
    analysis: [
      { partOfSpeech: 'v.', meaning: '支撑；支持', count: 11 },
      { partOfSpeech: 'n.', meaning: '支架；支撑物', count: 79 },
      { partOfSpeech: 'adj.', meaning: '支撑的', count: 10 },
    ],
  })
  assert.equal(summary.covered, 90)
  assert.deepEqual(summary.groups, [
    { partOfSpeech: 'n.', meanings: ['支架'] },
    { partOfSpeech: 'v.', meanings: ['支撑'] },
  ])
})

test('concise meanings preserve short clarifiers needed to understand the word', () => {
  const making = summarizeWord(byWord.get('making'))
  const verbs = making.groups.find(group => group.partOfSpeech === 'v.')
  assert.ok(verbs.meanings.includes('交（朋友）'))
  assert.ok(verbs.meanings.includes('发出（声音）'))
  assert.ok(!verbs.meanings.some(meaning => meaning.includes('与名词搭配')))
})

test('uncertain occurrences never inflate coverage or change its denominator', () => {
  const moderate = summarizeWord(byWord.get('moderate'))
  assert.equal(moderate.total, 6)
  assert.equal(moderate.covered, 3)
  assert.equal(moderate.meetsCoverage, false)
  assert.deepEqual(moderate.groups, [{ partOfSpeech: 'adj.', meanings: ['适度的'] }])

  const rum = summarizeWord(byWord.get('rum'))
  assert.equal(rum.total, 16)
  assert.equal(rum.covered, 0)
  assert.equal(rum.meetsCoverage, false)
  assert.deepEqual(rum.groups, [{ partOfSpeech: '', meanings: ['义项待核对'] }])
})

test('words without recorded uses keep a concise definition without claiming coverage', () => {
  const bacterium = summarizeWord(byWord.get('bacterium'))
  assert.equal(bacterium.total, 0)
  assert.equal(bacterium.covered, 0)
  assert.equal(bacterium.meetsCoverage, false)
  assert.deepEqual(bacterium.groups, [{ partOfSpeech: 'n.', meanings: ['细菌'] }])
})
