function shortMeaning(rawMeaning = '') {
  const withoutPartOfSpeech = rawMeaning.replace(/^[A-Za-z./]+\s+/, '')
  const concise = withoutPartOfSpeech
    .replace(/^[（(][^()（）]*[）)]\s*/, '')
    // Keep short objects such as 交（朋友）; omit lengthy usage notes.
    .replace(/[（(]([^()（）]*)[）)]/g, (_, note) => /^[㐀-鿿]{1,4}$/.test(note) ? '（' + note + '）' : '')
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

  // Rank by recorded sense frequency; retain enough senses to reach 90%.
  for (const item of ranked) {
    if (selected.length && covered >= total * 0.9) break
    // Unclassified occurrences do not establish coverage of a usable meaning.
    if (!item.meaning?.trim() || /无法可靠判断|需人工确认/.test(item.meaning)) continue
    selected.push(item)
    covered += item.count
  }

  if (!selected.length) {
    selected.push({ meaning: source.length ? '义项待核对' : word.meaning || '', partOfSpeech: '' })
  }

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

  return { groups, covered, total, meetsCoverage: total > 0 && covered >= total * 0.9 }
}
