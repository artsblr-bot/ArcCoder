import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches render-time crashes so one broken component can't blank the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface it for debugging; the fallback UI handles the user-facing part.
    console.error('Arc Coder crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-screen place-items-center bg-canvas px-6 text-center text-ink">
        <div className="max-w-md">
          <div className="mb-3 font-display text-2xl tracking-tight">Something arced out.</div>
          <p className="mb-1 text-[14px] text-body">Arc Coder hit an unexpected error and stopped rendering.</p>
          <p className="mb-5 font-mono text-[12px] text-muted">{this.state.error.message}</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => location.reload()}
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-canvas transition hover:opacity-90"
            >
              Reload
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-hairline px-4 py-2 text-[13px] text-body transition hover:text-ink"
            >
              Try to recover
            </button>
          </div>
        </div>
      </div>
    )
  }
}
