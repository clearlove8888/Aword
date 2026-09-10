// Match complete meaning units, never a substring of a Chinese answer.
export function normalizeAnswer(value) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/\b(?:n|v|vt|vi|adj|adv|pron|prep|conj|interj|num|art|aux)\./g, '')
    .replace(/[\s\p{P}]/gu, '')
}

export function meaningAnswers(meaning) {
  return meaning.replace(/\b(?:n|v|vt|vi|adj|adv|pron|prep|conj|interj|num|art|aux)\./gi, ';')
    .split(/[；;，,、/\n]+/).map(normalizeAnswer).filter(Boolean)
}

const synonyms = {
  space: ['宇宙空间'],
  unite: ['联合', '团结', '团结起来'],
  universe: ['宇宙'],
}

export function isAnswerCorrect(answer, word, extraAnswers = []) {
  const units = meaningAnswers(answer)
  const accepted = new Set([
    ...meaningAnswers(word.meaning),
    ...(synonyms[word.word.toLowerCase()] || []).map(normalizeAnswer),
    ...extraAnswers.map(normalizeAnswer),
  ])
  return units.length > 0 && units.every(unit => accepted.has(unit))
}
