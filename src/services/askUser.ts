import { nanoid } from 'nanoid'
import { useArc } from '../store/arc'

// Lets a tool pause the agent loop to ask the user, then resume with their answer.
let resolver: ((answer: string) => void) | null = null

export function askUser(question: string, options: string[] = []): Promise<string> {
  return new Promise((resolve) => {
    // If a question was already pending, release it first.
    resolver?.('(superseded)')
    resolver = resolve
    useArc.getState().setPendingQuestion({ id: nanoid(6), question, options })
  })
}

export function submitAnswer(answer: string): void {
  const r = resolver
  resolver = null
  useArc.getState().setPendingQuestion(null)
  if (answer.trim()) useArc.getState().pushTimeline({ kind: 'user', text: answer })
  r?.(answer)
}

export function cancelQuestion(): void {
  const r = resolver
  resolver = null
  useArc.getState().setPendingQuestion(null)
  r?.('(no answer — proceed with your best judgment)')
}
