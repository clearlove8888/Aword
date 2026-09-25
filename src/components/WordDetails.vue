<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  word: { type: Object, required: true },
})

const expandedSenses = ref(new Set())
watch(() => props.word.id, () => { expandedSenses.value = new Set() })

const isFrequencyWord = computed(() => Array.isArray(props.word.meanings))
const isListeningWord = computed(() => props.word.source === '四级听力高频词_词性释义.xlsx')

const summary = computed(() => {
  const source = props.word.analysis?.length ? props.word.analysis : props.word.meanings || []
  const primary = source.reduce((best, item) => !best || (item.count || 0) > (best.count || 0) ? item : best, null)
  const rawMeaning = primary?.meaning || props.word.meaning || ''
  const partOfSpeech = primary?.partOfSpeech || rawMeaning.match(/^([A-Za-z./]+)\s+/)?.[1] || ''
  const meaning = rawMeaning
    .replace(/^[A-Za-z./]+\s+/, '')
    .replace(/^[（(][^()（）]*[）)]\s*/, '')
    .replace(/[（(][^()（）]*[）)]/g, '')
    .split(/[；;，,|]/)[0].trim()
  return { partOfSpeech, meaning: meaning || rawMeaning }
})

function isUsableCollocationExample(text) {
  const value = text.trim()
  const words = value.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []
  if (words.length < 4 || value.length > 360) return false
  // Some source rows contain a vocabulary bank prepended to the real passage.
  if (/^(?:[a-z][a-z'-]*\s+){8,}[A-Z]/.test(value)) return false
  return true
}

const commonCollocations = computed(() => {
  const grouped = new Map()

  for (const item of props.word.collocations || []) {
    const phrase = item.phrase?.trim()
    const meaning = item.meaning?.trim()
    const sourceExamples = Array.isArray(item.examples) ? item.examples : [item.example]
    const examples = sourceExamples
      .map(example => typeof example === 'string' ? { text: example.trim(), translation: '' } : {
        text: example?.text?.trim() || '',
        translation: example?.translation?.trim() || '',
      })
      .filter(example => example.text && isUsableCollocationExample(example.text))

    if (!phrase || !meaning || !examples.length) continue

    const phraseKey = phrase.toLocaleLowerCase()
    if (!grouped.has(phraseKey)) {
      grouped.set(phraseKey, { phrase, count: item.count || 0, senses: [] })
    }

    const group = grouped.get(phraseKey)
    group.count = Math.max(group.count, item.count || 0)
    let sense = group.senses.find(entry => entry.meaning === meaning)
    if (!sense) {
      if (group.senses.length >= 2) continue
      sense = { meaning, examples: [] }
      group.senses.push(sense)
    }

    for (const example of examples) {
      if (sense.examples.length >= 1 || group.senses.reduce((total, entry) => total + entry.examples.length, 0) >= 2) break
      if (!sense.examples.some(entry => entry.text === example.text)) sense.examples.push(example)
    }
  }

  return [...grouped.values()].filter(item => item.senses.some(sense => sense.examples.length))
})
const senses = computed(() => {
  if (!isFrequencyWord.value) {
    return [{
      partOfSpeech: '',
      meaning: props.word.meaning,
      count: 0,
      percentage: '',
      note: '',
      examples: [
        { text: props.word.example, translation: props.word.translation },
        { text: props.word.example2, translation: props.word.translation2 },
      ].filter(item => item.text).slice(0, 2),
    }]
  }
  const analysis = props.word.analysis || []
  const source = analysis.length ? analysis : props.word.meanings
  return source.map(item => {
    const examples = []
    const seen = new Set()
    const addExample = (example, translation = '') => {
      if (!example || seen.has(example) || examples.length >= 2) return
      seen.add(example)
      examples.push({ text: example, translation })
    }
    addExample(item.example)
    const matchingMeaning = (props.word.meanings || []).find(meaning => meaning.partOfSpeech === item.partOfSpeech)
    for (const example of item.examples || matchingMeaning?.examples || []) addExample(example.text, example.translation)
    const sourceExample = item.example || item.examples?.[0]?.text
    const collocation = sourceExample && (props.word.collocations || []).find(entry => {
      const phraseMeaning = entry.meaning?.split(/[；;，,（(]/)[0].replace(/[…·]/g, '').trim()
      return entry.phrase && phraseMeaning?.length >= 2 &&
        item.meaning?.includes(phraseMeaning) &&
        entry.example?.trim() === sourceExample.trim() &&
        !item.meaning.toLocaleLowerCase().includes(entry.phrase.toLocaleLowerCase())
    })
    return {
      partOfSpeech: item.partOfSpeech,
      meaning: item.meaning,
      count: item.count,
      percentage: item.percentage,
      note: item.note || '',
      phrase: collocation?.phrase || '',
      examples,
    }
  })
})

function toggleSenseExamples(index) {
  const updated = new Set(expandedSenses.value)
  if (updated.has(index)) updated.delete(index)
  else updated.add(index)
  expandedSenses.value = updated
}
</script>

<template>
  <div class="word-details" :class="{ 'frequency-details': isFrequencyWord }">
    <section v-if="isListeningWord" class="listening-summary-section" aria-label="中文释义">
      <div class="listening-meaning-list">
        <p v-for="(item, itemIndex) in senses" :key="`listening-meaning-${itemIndex}`" class="meaning">
          {{ item.meaning || word.meaning }}
        </p>
      </div>
    </section>

    <section v-else class="detail-section summary-section">
      <h2 class="word-summary"><span v-if="summary.partOfSpeech">{{ summary.partOfSpeech }}</span>{{ summary.meaning }}</h2>
      <div class="detail-list sense-list">
        <article v-for="(item, itemIndex) in senses" :key="`${item.partOfSpeech}-${itemIndex}`" class="detail-card sense-card">
          <div class="detail-card-heading">
            <strong v-if="item.partOfSpeech" class="part-of-speech">{{ item.partOfSpeech }}</strong>
            <span v-if="item.count || item.percentage" class="frequency-note">
              <template v-if="item.count">{{ item.count }} 次</template><template v-if="item.count && item.percentage"> · </template>{{ item.percentage }}
            </span>
          </div>
          <p class="sense-meaning">{{ item.meaning || word.meaning }}<span v-if="item.phrase" class="sense-phrase">（{{ item.phrase }}）</span></p>
          <div class="sense-actions">
            <button v-if="item.examples.length" type="button" class="sense-examples-toggle"
              :aria-expanded="expandedSenses.has(itemIndex)" @click="toggleSenseExamples(itemIndex)">
              {{ expandedSenses.has(itemIndex) ? '收起例句' : `展开例句（${item.examples.length}）` }}
            </button>
          </div>
          <div v-if="expandedSenses.has(itemIndex)" class="sense-examples">
            <article v-for="example in item.examples" :key="example.text" class="sense-example">
              <p class="example-text">{{ example.text }}</p>
              <p v-if="example.translation" class="translation">{{ example.translation }}</p>
            </article>
          </div>
        </article>
      </div>
    </section>

    <template v-if="isFrequencyWord">
      <details v-if="commonCollocations.length" class="detail-disclosure collocations-disclosure">
        <summary>常用搭配 <span>{{ commonCollocations.length }}</span></summary>
        <div class="detail-list compact-list collocation-list">
          <article v-for="item in commonCollocations" :key="item.phrase" class="detail-card collocation-card">
            <div class="detail-card-heading">
              <strong>{{ item.phrase }}</strong>
              <span v-if="item.count">{{ item.count }} 次</span>
            </div>
            <div class="collocation-senses">
              <section v-for="(sense, senseIndex) in item.senses" :key="sense.meaning" class="collocation-sense">
                <p class="collocation-meaning">
                  <span>四级常考义<span v-if="item.senses.length > 1"> {{ senseIndex + 1 }}</span></span>
                  {{ sense.meaning }}
                </p>
                <div v-for="example in sense.examples" :key="example.text" class="collocation-example">
                  <span>真题语境例句</span>
                  <p>{{ example.text }}</p>
                  <p v-if="example.translation" class="translation">{{ example.translation }}</p>
                </div>
              </section>
            </div>
          </article>
        </div>
      </details>
    </template>
  </div>
</template>
