const UNAVAILABLE = 'Web search is temporarily unavailable. Do not invent sources or facts — tell the user search is unavailable right now.'

interface DdgTopic {
  Text?: string
  FirstURL?: string
}
/** DuckDuckGo Instant Answer API — quick facts/definitions (key-free, via /ddg proxy). */
async function ddgInstant(query: string): Promise<string> {
  try {
    const res = await fetch(`/ddg/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=arccoder`)
    if (!res.ok) return ''
    const d = (await res.json()) as {
      Answer?: string
      Heading?: string
      AbstractText?: string
      AbstractURL?: string
      RelatedTopics?: DdgTopic[]
    }
    const parts: string[] = []
    if (d.Answer) parts.push(String(d.Answer))
    if (d.AbstractText) parts.push(`${d.Heading ? `${d.Heading}: ` : ''}${d.AbstractText}${d.AbstractURL ? ` (${d.AbstractURL})` : ''}`)
    const related = (d.RelatedTopics ?? [])
      .filter((t) => t && t.Text)
      .slice(0, 4)
      .map((t) => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ''}`)
    if (related.length) parts.push(`Related:\n${related.join('\n')}`)
    return parts.join('\n\n').trim()
  } catch {
    return ''
  }
}

interface WikiHit {
  title?: string
  snippet?: string
}
/** Wikipedia full-text search — broad, reliable, CORS-enabled (no proxy, no key). */
async function wikipedia(query: string): Promise<string> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`
    const res = await fetch(url)
    if (!res.ok) return ''
    const d = (await res.json()) as { query?: { search?: WikiHit[] } }
    const hits = d?.query?.search ?? []
    return hits
      .filter((h) => h.title)
      .map((h) => {
        const snippet = String(h.snippet ?? '')
          .replace(/<[^>]+>/g, '')
          .replace(/&[a-z]+;/gi, ' ')
          .trim()
        const link = `https://en.wikipedia.org/wiki/${encodeURIComponent(String(h.title).replace(/ /g, '_'))}`
        return `- ${h.title}\n  ${snippet}\n  ${link}`
      })
      .join('\n\n')
  } catch {
    return ''
  }
}

/** Web search across DuckDuckGo (quick answers) + Wikipedia (broad results). Never fabricates. */
export async function webSearch(query: string): Promise<string> {
  const q = query.trim()
  if (!q) return UNAVAILABLE
  const [instant, wiki] = await Promise.all([ddgInstant(q), wikipedia(q)])
  const blocks: string[] = []
  if (instant) blocks.push(`### DuckDuckGo\n${instant}`)
  if (wiki) blocks.push(`### Wikipedia\n${wiki}`)
  return blocks.length ? blocks.join('\n\n') : UNAVAILABLE
}

/** Deeper investigation: a couple of angled searches, synthesized. */
export async function deepResearch(query: string): Promise<string> {
  const angles = [query, `${query} — caveats, tradeoffs, and best current practice`]
  const results = await Promise.all(angles.map((q) => webSearch(q)))
  const real = results.filter((r) => r !== UNAVAILABLE)
  if (real.length === 0) return UNAVAILABLE
  return real.map((r, i) => `## Findings ${i + 1}\n${r}`).join('\n\n')
}
