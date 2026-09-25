function shortMeaning(rawMeaning = '') {
  const withoutPartOfSpeech = rawMeaning.replace(/^[A-Za-z./]+\s+/, '')
  const concise = withoutPartOfSpeech
    .replace(/^[（(][^()（）]*[）)]\s*/, '')
    .replace(/[（(][^()（）]*[）)]/g, '')
    .split(/[；;，,|]/)[0]
    .trim()
  return concise || withoutPartOfSpeech.trim()
}

export function summarizeWord(word) {
  const source = word.analysis?.length ? word.analysis : word.meanings || []
  const ranked = source
    .map((item, index) => ({ ...item, index, count: Number(item.count) || 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
  const total = Number(word.corpusFrequency) || ranked.reduce((sum, item) => sum + item.count, 0)
  const selected = []
  let covered = 0

  for (const item of ranked) {
    if (selected.length && covered >= total * 0.8) break
    selected.push(item)
    covered += item.count
  }

  if (!selected.length) selected.push({ meaning: word.meaning || '', partOfSpeech: '' })

  const groups = []
  for (const item of selected) {
    const rawMeaning = item.meaning || word.meaning || ''
    const partOfSpeech = item.partOfSpeech || rawMeaning.match(/^([A-Za-z./]+)\s+/)?.[1] || ''
    const meaning = shortMeaning(rawMeaning)
    let group = groups.find(entry => entry.partOfSpeech === partOfSpeech)
    if (!group) {
      group = { partOfSpeech, meanings: [] }
      groups.push(group)
    }
    if (meaning && !group.meanings.includes(meaning)) group.meanings.push(meaning)
  }

  return { groups, covered, total }
}
