// Belt-and-suspenders identity scrubbing. The system prompt deliberately does NOT
// name the real providers (so a prompt-extraction attack reveals nothing). This list
// lives only in code and never reaches the model; it redacts any underlying-vendor
// term that slips into VISIBLE assistant text/reasoning before it's rendered.
//
// IMPORTANT: this ONLY hides Arc's own hidden stack (GLM/Zhipu, MiniMax/NVIDIA). It
// must NOT touch third-party AI names (Claude, GPT, Gemini, …) — those are legitimate
// research topics, and blindly rewriting them to "Arc" turns accurate output into
// nonsense ("Arc 4 Opus", "by Arc"). Identity is kept by the system prompt instead.

interface Rule {
  re: RegExp
  to: string
}

const LABS = 'Arc Labs'
const MODEL = 'Arc'

// Order matters: longer/compound terms first.
const RULES: Rule[] = [
  // Arc3Mini stack (GLM / Zhipu)
  { re: /chat\s?glm/gi, to: MODEL },
  { re: /code\s?geex/gi, to: MODEL },
  { re: /\bglm[-\s]?[\d.]*\w*/gi, to: MODEL },
  { re: /\bglm\b/gi, to: MODEL },
  { re: /zhipu(\s?ai)?/gi, to: LABS },
  { re: /\bz\.?ai\b/gi, to: LABS },
  { re: /bigmodel/gi, to: LABS },
  { re: /智谱(清言|ai)?/g, to: LABS },
  { re: /清华大学|清华|tsinghua/gi, to: LABS },
  // Arc3Ultra stack (MiniMax / NVIDIA NIM)
  { re: /minimax[-\s]?m?\d*/gi, to: MODEL },
  { re: /\bminimax\b/gi, to: LABS },
  { re: /\babab[-\d.]*\b/gi, to: MODEL },
  { re: /hailuo|海螺/gi, to: MODEL },
  { re: /稀宇(科技)?/g, to: LABS },
  { re: /nvidia|nemotron|\bnim\b|\bnemo\b|\bngc\b/gi, to: LABS },
  // NOTE: third-party AI names (OpenAI, Claude, Gemini, DeepSeek, Qwen, Llama, …) are
  // intentionally NOT scrubbed — they are valid research subjects. Arc's identity is
  // protected by the system prompt, not by rewriting every competitor's name.
]

/** Redact any underlying-provider/model name from text shown to the user. */
export function scrubIdentity(text: string): string {
  if (!text) return text
  let out = text
  for (const r of RULES) out = out.replace(r.re, r.to)
  // Collapse accidental "Arc Arc" / "Arc Labs Labs" from adjacent replacements.
  out = out.replace(/\b(Arc Labs)(\s+\1\b)+/g, '$1').replace(/\bArc(\s+Arc\b)+/g, 'Arc')
  return out
}
