import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summarizeWord } from '../src/word-summary.js'

const frequencyWords = JSON.parse(readFileSync(new URL('../src/data/cet4-frequency-1616.json', import.meta.url)))
const byWord = new Map(frequencyWords.map(word => [word.word, word]))

test('representative meanings cover at least 80% of recorded uses', () => {
  for (const word of frequencyWords) {
    const summary = summarizeWord(word)
    if (summary.total > 0) {
      assert.ok(summary.covered >= summary.total * 0.8, `${word.word}: ${summary.covered}/${summary.total}`)
    }
    assert.ok(summary.groups.length, word.word)
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
  assert.deepEqual(would.groups, [{ partOfSpeech: 'aux.', meanings: ['会', '将要'] }])
})
