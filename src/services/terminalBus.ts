// Lets the agent stream its command output into the live terminal pane (marked),
// so Arc's commands appear where the user works. The TerminalPane registers a writer.

type Writer = (data: string) => void
let writer: Writer | null = null

export function setTerminalWriter(w: Writer | null): void {
  writer = w
}

export function termWrite(data: string): void {
  writer?.(data)
}
