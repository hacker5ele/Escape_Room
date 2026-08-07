import { VISIONS, type VisionDef } from './story'

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(a|an|the)\s+/, '')
}

export function isVisionAnswerCorrect(id: VisionDef['id'], value: string): boolean {
  const vision = VISIONS.find((v) => v.id === id)
  if (!vision) return false
  return normalize(value) === normalize(vision.answer)
}
