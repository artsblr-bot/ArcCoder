// Tolerant JSON extraction for model output: strips code fences and pulls the first
// balanced {...} or [...] block, then JSON.parses it. Returns null on failure.

export function parseLooseJson(raw: string): unknown | null {
  if (!raw) return null
  let s = raw.trim()

  // Strip ```json … ``` / ``` … ``` fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()

  // Fast path.
  try {
    return JSON.parse(s)
  } catch {
    /* fall through to balanced-scan */
  }

  const start = s.search(/[[{]/)
  if (start === -1) return null
  const open = s[start]
  const close = open === '{' ? '}' : ']'

  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        const candidate = s.slice(start, i + 1)
        try {
          return JSON.parse(candidate)
        } catch {
          return null
        }
      }
    }
  }
  return null
}
