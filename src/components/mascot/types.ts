// Arcy — the Arc Labs mascot. A small creature of contained azure arc-light who
// roams the workspace and acts out whatever the agent is really doing.

/** What Arcy is currently doing — driven by the real agent/tool event stream. */
export type ArcyActivity =
  | 'idle' // gentle bob at the home perch
  | 'thinking' // reasoning — taps chin, thought bubble
  | 'coding' // writing/editing a file — typing on a keyboard, </> glyphs
  | 'building' // running a command / npm install — turning a wrench, sweat
  | 'researching' // web search / deep research — peers through a magnifier (scan beam)
  | 'planning' // drafting the plan — ticks a clipboard checklist
  | 'fixing' // an error surfaced — startled, sprays an extinguisher, sweat + "!"
  | 'pulling' // dragging a panel open (launch reveal) — straining grip, sweat flying
  | 'success' // a task/build completed — jumps + confetti + ✓
  | 'overdrive' // SUPERCODE — powered up, spectrum aura + lightning

/** Facial expression. Usually derived from the activity, can be forced. */
export type ArcyMood =
  | 'content'
  | 'focused'
  | 'happy'
  | 'determined'
  | 'curious'
  | 'worried'
  | 'strain'
  | 'joy'
  | 'excited'

export const MOOD_FOR_ACTIVITY: Record<ArcyActivity, ArcyMood> = {
  idle: 'content',
  thinking: 'focused',
  coding: 'happy',
  building: 'determined',
  researching: 'curious',
  planning: 'focused',
  fixing: 'worried',
  pulling: 'strain',
  success: 'joy',
  overdrive: 'excited',
}

/** A prop Arcy holds in-hand for the current activity. */
export type PropName =
  | 'keyboard'
  | 'laptop'
  | 'wrench'
  | 'magnifier'
  | 'telescope'
  | 'clipboard'
  | 'extinguisher'
  | 'gauntlet'

export const PROP_FOR_ACTIVITY: Record<ArcyActivity, PropName | null> = {
  idle: null,
  thinking: null,
  coding: 'laptop',
  building: 'wrench',
  researching: 'magnifier',
  planning: 'clipboard',
  fixing: 'extinguisher',
  pulling: null,
  success: null,
  overdrive: 'gauntlet',
}

/** Human-readable status line Arcy "says" while doing each activity (apprentice voice). */
export const ARCY_SAYS: Record<ArcyActivity, string> = {
  idle: 'Ready when you are!',
  thinking: 'Hmm, let me think…',
  coding: 'Writing the code!',
  building: 'Building it now…',
  researching: 'Looking this up…',
  planning: 'Mapping out a plan…',
  fixing: 'Yikes — patching that!',
  pulling: 'Heave… ho!',
  success: 'Ta-da! All done.',
  overdrive: 'SUPERCODE engaged!',
}
