import type { PanelId } from '../../store/arc'

// Panels register their DOM node so the roaming Arcy can find where to go.
const panels = new Map<PanelId, HTMLElement>()

export function registerPanel(id: PanelId, el: HTMLElement | null): void {
  if (el) panels.set(id, el)
  else panels.delete(id)
}

export function getPanelRect(id: PanelId): DOMRect | null {
  return panels.get(id)?.getBoundingClientRect() ?? null
}
