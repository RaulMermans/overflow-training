export type MotivationQuote = {
  id: string
  text: {
    en: string
    es?: string
  }
  author: string
  source?: string
  tags?: string[]
}

export const QUOTES: MotivationQuote[] = [
  {
    id: 'seneca-imagination-reality',
    text: {
      en: 'We suffer more often in imagination than in reality.',
      es: 'Sufrimos más a menudo en la imaginación que en la realidad.',
    },
    author: 'Seneca',
    source: 'Seneca, Moral Letters to Lucilius, Letter 13',
    tags: ['stoicism', 'mindset', 'resilience'],
  },
  {
    id: 'marcus-fate-become-good',
    text: {
      en: 'Fate is hanging over your head; while you have life, while you may, become good.',
    },
    author: 'Marcus Aurelius',
    source: 'Marcus Aurelius, Meditations',
    tags: ['stoicism', 'character', 'discipline'],
  },
  {
    id: 'epictetus-kind-of-person',
    text: {
      en: 'Tell yourself what kind of person you want to be; and then go ahead with what you are doing.',
      es: 'Di qué tipo de persona quieres ser; luego actúa en consecuencia.',
    },
    author: 'Epictetus',
    source: 'Epictetus, Discourses',
    tags: ['identity', 'action', 'discipline'],
  },
  {
    id: 'marcus-obstacle-is-way',
    text: {
      en: 'A hindrance to a given duty becomes a help; an obstacle in a given path a furtherance.',
      es: 'Un impedimento para el deber se vuelve ayuda; un obstáculo en el camino, avance.',
    },
    author: 'Marcus Aurelius',
    source: 'Marcus Aurelius, Meditations',
    tags: ['resilience', 'stoicism', 'progress'],
  },
  {
    id: 'marcus-fear-never-beginning',
    text: {
      en: 'Fear never beginning to live with Nature.',
    },
    author: 'Marcus Aurelius',
    source: 'Marcus Aurelius, Meditations',
    tags: ['courage', 'nature', 'stoicism'],
  },
  {
    id: 'seneca-difficulties-strengthen',
    text: {
      en: 'Difficulties strengthen the mind, as labor does the body.',
      es: 'Las dificultades fortalecen la mente, como el trabajo al cuerpo.',
    },
    author: 'Seneca',
    source: 'Seneca, Moral Letters to Lucilius',
    tags: ['strength', 'endurance'],
  },
  {
    id: 'epictetus-small-things',
    text: {
      en: 'No great thing is created suddenly.',
      es: 'Nada grande se crea de repente.',
    },
    author: 'Epictetus',
    source: 'Epictetus, Discourses',
    tags: ['consistency', 'patience'],
  },
  {
    id: 'marcus-quality-actions',
    text: {
      en: 'Waste no more time arguing what a good person should be. Be one.',
      es: 'No pierdas más tiempo discutiendo cómo debe ser alguien bueno. Sé uno.',
    },
    author: 'Marcus Aurelius',
    source: 'Marcus Aurelius, Meditations',
    tags: ['action', 'character'],
  },
  {
    id: 'seneca-begin-live-now',
    text: {
      en: 'Begin at once to live, and count each separate day as a separate life.',
    },
    author: 'Seneca',
    source: 'Seneca, Moral Letters to Lucilius',
    tags: ['presence', 'focus'],
  },
  {
    id: 'epictetus-control-things',
    text: {
      en: 'Make the best use of what is in your power, and take the rest as it happens.',
      es: 'Haz el mejor uso de lo que está en tu poder y acepta lo demás como venga.',
    },
    author: 'Epictetus',
    source: 'Epictetus, Discourses',
    tags: ['control', 'acceptance'],
  },
  {
    id: 'marcus-present-task',
    text: {
      en: 'Concentrate every minute on doing what is in front of you with precise and genuine seriousness.',
    },
    author: 'Marcus Aurelius',
    source: 'Marcus Aurelius, Meditations',
    tags: ['focus', 'discipline'],
  },
  {
    id: 'seneca-luck-preparation',
    text: {
      en: 'Luck is what happens when preparation meets opportunity.',
      es: 'La suerte es lo que ocurre cuando la preparación encuentra la oportunidad.',
    },
    author: 'Seneca',
    source: 'Seneca, Moral Letters to Lucilius',
    tags: ['preparation', 'consistency'],
  },
]
