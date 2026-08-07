export interface VisionDef {
  id: 'monastery' | 'urban' | 'boardGame' | 'battlefield' | 'desolation'
  title: string
  question: string
  choices?: readonly string[]
  answer: string
  reward: 'hint' | 'wand'
  onSolved: string
  color: string
  x: number
  z: number
  interaction?: 'click-image' | 'sequence' | 'spot-difference' | 'memory-match'
  boxGlb: string
  finalGate?: boolean
}

export const PRIZE_GLB = '/rooms/room-04/prize/cacti.glb'

export const WORLD = {
  startZ: 9,
  endZ: -195,
  speed: 6,
} as const

const PATH_FREQUENCY = 0.03
const PATH_AMPLITUDE = 2.2

export function pathCenterX(z: number): number {
  return Math.sin((WORLD.startZ - z) * PATH_FREQUENCY) * PATH_AMPLITUDE
}

export const VISION_TIMER = 30

export const GUARDIAN_HOMES: readonly { x: number; z: number }[] = [
  { x: -25, z: -8 },
  { x: -33, z: -55 },
  { x: 28, z: -85 },
]

export const VISIONS: readonly VisionDef[] = [
  {
    id: 'monastery',
    title: 'The Monastery Vision',
    question: 'The bell tower remembers its own call. Listen, then ring it back.',
    answer: 'the pattern',
    reward: 'hint',
    onSolved: 'The bells ring once, unbidden. A fragment of the wizard’s hold breaks loose.',
    color: '#9fc9ff',
    x: -35,
    z: -1,
    interaction: 'sequence',
    boxGlb: '/rooms/room-04/boxes/monastery.glb',
  },
  {
    id: 'urban',
    title: 'The Urban Vision',
    question: 'Someone in this building is still awake. Find the window with the warm red light.',
    answer: 'the odd one',
    reward: 'hint',
    onSolved: 'The skyline flickers and folds into smoke. Something you needed to know surfaces.',
    color: '#ffcf7a',
    x: 40,
    z: -31,
    interaction: 'spot-difference',
    boxGlb: '/rooms/room-04/boxes/urban.glb',
  },
  {
    id: 'boardGame',
    title: "The Diviner's Table",
    question: 'The table pairs what belongs together. Turn the carved tiles and find every match.',
    answer: 'every pair',
    reward: 'hint',
    onSolved: 'The carved pieces fall still at once. The last of the hidden knowledge is yours.',
    color: '#ff9fd1',
    x: -45,
    z: -61,
    interaction: 'memory-match',
    boxGlb: '/rooms/room-04/boxes/boardGame.glb',
  },
  {
    id: 'battlefield',
    title: 'The Battlefield Vision',
    question: 'Click on the thing that remembers every blow but never fought.',
    answer: 'a scar',
    reward: 'wand',
    onSolved: 'From the cratered earth, something surfaces — an arcane-infused wand, still warm.',
    color: '#ff5a5a',
    x: 38,
    z: -91,
    interaction: 'click-image',
    boxGlb: '/rooms/room-04/boxes/battlefield.glb',
  },
  {
    id: 'desolation',
    title: 'The Desolation Vision',
    question: 'It cannot be seen, cannot be felt, cannot be heard, cannot be smelt. It lies behind stars and under hills, and empty holes it fills. It comes out first and follows after, ends life, kills laughter. What am I?',
    choices: ['Silence', 'Death', 'Dark', 'Night'],
    answer: 'dark',
    reward: 'hint',
    onSolved: 'For a moment the ruin goes still, and the last fragment of the wizard’s hold breaks loose.',
    color: '#c9c9c9',
    x: -25,
    z: -115,
    boxGlb: '/rooms/room-04/boxes/desolation.glb',
    finalGate: true,
  },
]

export const STORY = {
  ambientWizardLines: [
    'Wind stirs a scatter of paper through the empty street.',
    'A shutter creaks somewhere above, then falls still.',
    'Dust drifts through a shaft of grey light between the buildings.',
  ],
} as const
