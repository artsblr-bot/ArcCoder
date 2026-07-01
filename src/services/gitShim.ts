import git from 'isomorphic-git'
import { getContainer } from './webcontainer'

// WebContainers ship no `git` binary, so we back a small `git` command with
// isomorphic-git running over an adapter on the container's filesystem. The Arc
// terminal intercepts lines starting with `git ` and routes them here; the agent
// uses the same helpers via its git tool.

const DIR = '/'
const AUTHOR = { name: 'Arc', email: 'arc@arclabs.dev' }

function enoent(path: string): Error {
  const e = new Error(`ENOENT: no such file or directory, '${path}'`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

interface StatLike {
  type: 'file' | 'dir'
  mode: number
  size: number
  ino: number
  mtimeMs: number
  ctimeMs: number
  uid: number
  gid: number
  dev: number
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

function statOf(type: 'file' | 'dir', size: number): StatLike {
  const now = Date.now()
  return {
    type,
    mode: type === 'dir' ? 0o040000 : 0o100644,
    size,
    ino: 0,
    mtimeMs: now,
    ctimeMs: now,
    uid: 1,
    gid: 1,
    dev: 1,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir',
    isSymbolicLink: () => false,
  }
}

/** isomorphic-git FsClient backed by the WebContainer filesystem. */
async function makeFs() {
  const wc = await getContainer()
  const fs = wc.fs
  return {
    promises: {
      async readFile(path: string, opts?: string | { encoding?: string }) {
        const enc = typeof opts === 'string' ? opts : opts?.encoding
        let data: Uint8Array
        try {
          data = await fs.readFile(path)
        } catch {
          throw enoent(path)
        }
        return enc && /utf-?8/i.test(enc) ? new TextDecoder().decode(data) : data
      },
      async writeFile(path: string, data: string | Uint8Array) {
        await fs.writeFile(path, data as string)
      },
      async unlink(path: string) {
        await fs.rm(path, { force: true })
      },
      async readdir(path: string) {
        try {
          return (await fs.readdir(path)) as string[]
        } catch {
          throw enoent(path)
        }
      },
      async mkdir(path: string) {
        await fs.mkdir(path, { recursive: true })
      },
      async rmdir(path: string) {
        await fs.rm(path, { recursive: true, force: true })
      },
      async stat(path: string): Promise<StatLike> {
        try {
          const data = await fs.readFile(path)
          return statOf('file', data.length)
        } catch {
          /* not a file */
        }
        try {
          await fs.readdir(path)
          return statOf('dir', 0)
        } catch {
          throw enoent(path)
        }
      },
      async lstat(path: string): Promise<StatLike> {
        return this.stat(path)
      },
      async readlink(path: string): Promise<string> {
        throw enoent(path)
      },
      async symlink() {
        throw new Error('symlink not supported')
      },
    },
  }
}

// ── Named helpers (also used by the agent's git tool) ────────────────────────────
export async function gitInit(): Promise<string> {
  const fs = await makeFs()
  await git.init({ fs, dir: DIR, defaultBranch: 'main' })
  return 'Initialized empty Git repository in /.git/'
}

export async function gitAddAll(): Promise<string> {
  const fs = await makeFs()
  const status = await git.statusMatrix({ fs, dir: DIR })
  let added = 0
  for (const [filepath, , worktree] of status) {
    if (worktree === 0) await git.remove({ fs, dir: DIR, filepath })
    else await git.add({ fs, dir: DIR, filepath })
    added++
  }
  return `Staged ${added} change(s).`
}

export async function gitCommit(message: string): Promise<string> {
  const fs = await makeFs()
  const sha = await git.commit({ fs, dir: DIR, message: message || 'update', author: AUTHOR })
  const branch = (await git.currentBranch({ fs, dir: DIR })) || 'main'
  return `[${branch} ${sha.slice(0, 7)}] ${message || 'update'}`
}

export async function gitStatus(): Promise<string> {
  const fs = await makeFs()
  const matrix = await git.statusMatrix({ fs, dir: DIR })
  const lines: string[] = []
  for (const [filepath, head, workdir, stage] of matrix) {
    if (head === 1 && workdir === 1 && stage === 1) continue // unchanged
    let tag = 'modified'
    if (head === 0 && workdir === 2) tag = stage === 0 ? 'untracked' : 'new file'
    else if (workdir === 0) tag = 'deleted'
    lines.push(`  ${tag.padEnd(9)} ${filepath}`)
  }
  const branch = (await git.currentBranch({ fs, dir: DIR })) || 'main'
  return lines.length ? `On branch ${branch}\nChanges:\n${lines.join('\n')}` : `On branch ${branch}\nnothing to commit, working tree clean`
}

export async function gitLog(limit = 15): Promise<string> {
  const fs = await makeFs()
  const commits = await git.log({ fs, dir: DIR, depth: limit })
  if (!commits.length) return 'no commits yet'
  return commits.map((c) => `${c.oid.slice(0, 7)} ${c.commit.message.split('\n')[0]}`).join('\n')
}

export async function gitBranches(): Promise<string> {
  const fs = await makeFs()
  const branches = await git.listBranches({ fs, dir: DIR })
  const current = await git.currentBranch({ fs, dir: DIR })
  return branches.map((b) => `${b === current ? '* ' : '  '}${b}`).join('\n') || '* main'
}

export async function gitBranchCreate(name: string, checkout = true): Promise<string> {
  const fs = await makeFs()
  await git.branch({ fs, dir: DIR, ref: name, checkout })
  return checkout ? `Switched to a new branch '${name}'` : `Created branch '${name}'`
}

export async function gitCheckout(ref: string): Promise<string> {
  const fs = await makeFs()
  await git.checkout({ fs, dir: DIR, ref })
  return `Switched to branch '${ref}'`
}

// ── `git ...` command dispatcher (for the terminal) ──────────────────────────────
export async function runGit(args: string[]): Promise<string> {
  const [sub, ...rest] = args
  try {
    switch (sub) {
      case 'init':
        return await gitInit()
      case 'add':
        return await gitAddAll()
      case 'commit': {
        const mi = rest.indexOf('-m')
        const message = mi >= 0 ? rest.slice(mi + 1).join(' ').replace(/^["']|["']$/g, '') : 'update'
        return await gitCommit(message)
      }
      case 'status':
        return await gitStatus()
      case 'log':
        return await gitLog()
      case 'branch':
        if (rest[0] && !rest[0].startsWith('-')) return await gitBranchCreate(rest[0], false)
        return await gitBranches()
      case 'checkout': {
        if (rest[0] === '-b' && rest[1]) return await gitBranchCreate(rest[1], true)
        if (rest[0]) return await gitCheckout(rest[0])
        return 'usage: git checkout <ref> | git checkout -b <new-branch>'
      }
      case undefined:
        return 'usage: git <init|add|commit|status|log|branch|checkout>'
      default:
        return `git: '${sub}' is not supported in Arc’s workspace yet.`
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `git error: ${msg}`
  }
}
