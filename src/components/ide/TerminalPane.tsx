import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { runCommand, isCrossOriginIsolated } from '../../services/webcontainer'
import { runGit } from '../../services/gitShim'
import { setTerminalWriter } from '../../services/terminalBus'
import { useArc } from '../../store/arc'

const THEME = {
  background: '#1f1e1b',
  foreground: '#ece7df',
  cursor: '#cc785c',
  selectionBackground: '#3a352d',
  black: '#1f1e1b',
  brightBlack: '#a09d96',
  blue: '#5db8a6',
  brightBlue: '#7fccbb',
  green: '#5db872',
  yellow: '#d4a017',
  red: '#c64545',
  cyan: '#5db8a6',
  magenta: '#c79bdc',
  white: '#ece7df',
}

const PROMPT = '\r\n\x1b[38;2;204;120;92marc\x1b[0m \x1b[38;2;160;157;150m~/$\x1b[0m '

async function dispatch(cmd: string, term: Terminal, bumpTree: () => void) {
  const args = cmd.split(/\s+/).filter(Boolean)
  if (args[0] === 'clear') {
    term.clear()
    return
  }
  if (args[0] === 'git') {
    const out = await runGit(args.slice(1))
    if (out) term.writeln(out.replace(/\n/g, '\r\n'))
    bumpTree()
    return
  }
  const { exitCode } = await runCommand('jsh', ['-c', cmd], (chunk) => term.write(chunk))
  if (exitCode !== 0) term.writeln(`\x1b[38;2;198;69;69m[exit ${exitCode}]\x1b[0m`)
  bumpTree()
}

export function TerminalPane() {
  const ref = useRef<HTMLDivElement>(null)
  const bumpTree = useArc((s) => s.bumpTree)

  useEffect(() => {
    if (!ref.current) return
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'JetBrains Mono Variable, monospace',
      fontSize: 12.5,
      theme: THEME,
      lineHeight: 1.2,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(ref.current)
    setTimeout(() => {
      try {
        fit.fit()
      } catch {
        /* container not sized yet */
      }
    }, 0)

    term.writeln('\x1b[38;2;160;157;150mArc terminal — npm, node, and git are available.\x1b[0m')
    if (!isCrossOriginIsolated()) {
      term.writeln('\x1b[38;2;198;69;69mWorkspace engine unavailable (cross-origin isolation is off).\x1b[0m')
    }
    term.write(PROMPT)

    // Let the agent stream its command output into this terminal (marked).
    setTerminalWriter((d) => term.write(d))

    let line = ''
    let busy = false
    const onData = term.onData((d) => {
      if (busy) return
      for (const ch of d) {
        if (ch === '\r') {
          term.write('\r\n')
          const cmd = line.trim()
          line = ''
          if (!cmd) {
            term.write(PROMPT)
            continue
          }
          busy = true
          dispatch(cmd, term, bumpTree)
            .catch((e: unknown) => {
              const msg = (e as { userMessage?: string })?.userMessage ?? (e instanceof Error ? e.message : String(e))
              term.writeln(`\x1b[38;2;198;69;69m${msg}\x1b[0m`)
            })
            .finally(() => {
              busy = false
              term.write(PROMPT)
            })
        } else if (ch === '\x7f') {
          if (line.length > 0) {
            line = line.slice(0, -1)
            term.write('\b \b')
          }
        } else if (ch >= ' ') {
          line += ch
          term.write(ch)
        }
      }
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    })
    ro.observe(ref.current)

    return () => {
      setTerminalWriter(null)
      onData.dispose()
      ro.disconnect()
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col bg-dark-2">
      <div className="flex h-8 items-center gap-2 border-b border-dark-hairline bg-dark px-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-on-dark-soft">Terminal</span>
        <span className="rounded bg-dark-3 px-1.5 py-0.5 font-mono text-[10px] text-on-dark-soft">arc ~</span>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden p-2" />
    </div>
  )
}
