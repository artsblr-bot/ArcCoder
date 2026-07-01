import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = 'http://localhost:5173/?ws=1&still=1'
const phase = process.argv[2] || 'a'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SNAKE = `<!doctype html><html><head><meta charset="utf-8"><title>Snake</title>
<style>body{margin:0;background:#181715;display:grid;place-items:center;height:100vh;font-family:system-ui}
canvas{background:#0f0e0d;border:2px solid #cc785c;border-radius:8px}
h1{position:fixed;top:18px;color:#faf9f5;font-family:Georgia,serif;letter-spacing:1px}</style></head>
<body><h1>Snake</h1><canvas id="c" width="400" height="400"></canvas><script>
const c=document.getElementById('c'),x=c.getContext('2d'),G=20;let s=[{x:8,y:8}],d={x:1,y:0},f={x:12,y:8},alive=true;
addEventListener('keydown',e=>{const k=e.key;if(k=='ArrowUp'&&d.y==0)d={x:0,y:-1};if(k=='ArrowDown'&&d.y==0)d={x:0,y:1};if(k=='ArrowLeft'&&d.x==0)d={x:-1,y:0};if(k=='ArrowRight'&&d.x==0)d={x:1,y:0}});
function step(){if(!alive)return;const h={x:s[0].x+d.x,y:s[0].y+d.y};if(h.x<0||h.y<0||h.x>=20||h.y>=20||s.some(p=>p.x==h.x&&p.y==h.y)){alive=false;return}s.unshift(h);if(h.x==f.x&&h.y==f.y){f={x:(Math.random()*20)|0,y:(Math.random()*20)|0}}else s.pop()}
function draw(){x.fillStyle='#0f0e0d';x.fillRect(0,0,400,400);x.fillStyle='#cc785c';x.fillRect(f.x*G,f.y*G,G-2,G-2);x.fillStyle='#5db872';s.forEach(p=>x.fillRect(p.x*G,p.y*G,G-2,G-2));if(!alive){x.fillStyle='#faf9f5';x.font='24px Georgia';x.fillText('Game Over',140,210)}}
setInterval(()=>{step();draw()},120);draw();
</script></body></html>`

const SERVER = `const http=require('http');const fs=require('fs');
http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(fs.readFileSync('index.html','utf8'))}).listen(3000,()=>console.log('Snake server on http://localhost:3000'));`

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'], protocolTimeout: 240000 })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 950 })
page.on('console', (m) => { const t = m.text(); if (/error|fail|exception/i.test(t)) console.log('  [page]', t.slice(0, 160)) })

console.log('→ loading workspace…')
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction('window.crossOriginIsolated === true && !!window.__arc', { timeout: 25000 })
console.log('✓ cross-origin isolated, __arc hook present')
await sleep(5000) // let WebContainer boot + mount

const getState = () =>
  page.evaluate(() => {
    const s = window.__arc.store.getState()
    const k = (kind) => s.timeline.filter((t) => t.kind === kind)
    return {
      status: s.status,
      model: s.model,
      preview: s.previewUrl,
      openFiles: s.openFiles,
      reasoningChars: k('reasoning').reduce((n, t) => n + (t.text?.length || 0), 0),
      plans: k('plan').map((t) => t.title),
      actions: k('action').map((t) => `${t.title} [${t.status}]`),
      assistant: (k('assistant').pop() || {}).text?.slice(0, 160) || '',
      errors: k('error').map((t) => t.text),
    }
  })

if (phase === 'a') {
  console.log('\n=== PHASE A — deterministic plumbing ===')
  await page.evaluate(
    async (snake, server) => {
      const t = window.__arc
      await t.executeTool('write_file', { path: 'index.html', content: snake })
      await t.executeTool('write_file', { path: 'server.js', content: server })
      await t.executeTool('start_dev_server', { command: 'node server.js' })
    },
    SNAKE,
    SERVER,
  )
  console.log('  wrote index.html + server.js, started node server')
  let url = null
  for (let i = 0; i < 40; i++) {
    url = await page.evaluate(() => window.__arc.store.getState().previewUrl)
    if (url) break
    await sleep(1000)
  }
  const st = await getState()
  console.log('  openFiles:', st.openFiles)
  console.log('  previewUrl:', url)
  await sleep(2500)
  await page.screenshot({ path: 'F:/ArcCoder/.e2e-a.png' })
  console.log(url ? '✓ preview is live — screenshot saved' : '✗ no preview URL — server-ready never fired')
}

if (phase === 'b') {
  console.log('\n=== PHASE B — real model build (Arc3Mini, fast) ===')
  await page.evaluate(() => {
    const s = window.__arc.store.getState()
    s.setOverride('arc3mini')
    s.setEffort('low')
  })
  const prompt =
    'Create two files and run them. (1) index.html — a simple Snake game using vanilla JavaScript and a <canvas>. (2) server.js — a Node http server on port 3000 that serves index.html. Use the write_file tool for each file, then use start_dev_server with command "node server.js" to run it. Keep it minimal.'
  await page.evaluate((p) => {
    window.__arc.runTurn(p)
  }, prompt)
  console.log('  prompt sent (Arc3Mini / low effort); polling for up to 150s…')
  let last = ''
  for (let i = 0; i < 30; i++) {
    await sleep(5000)
    const st = await getState()
    const sig = JSON.stringify([st.status, st.actions, st.preview, st.errors, st.plans, st.openFiles])
    if (sig !== last) {
      console.log(`  [${i * 5}s] status=${st.status} preview=${st.preview ? 'YES' : 'no'} files=${st.openFiles.length} reasoning=${st.reasoningChars}c`)
      if (st.plans.length) console.log('        plan:', st.plans.join(' | '))
      if (st.actions.length) console.log('        actions:', st.actions.join(' · '))
      if (st.assistant) console.log('        says:', st.assistant)
      if (st.errors.length) console.log('        ERRORS:', st.errors.join(' | '))
      last = sig
    }
    if (i % 5 === 4) await page.screenshot({ path: 'F:/ArcCoder/.e2e-b.png' })
    if ((st.status === 'idle' || st.status === 'error') && i > 2) break
  }
  const fin = await getState()
  console.log('\n  FINAL:', JSON.stringify(fin, null, 1).slice(0, 1200))
  await sleep(1500)
  await page.screenshot({ path: 'F:/ArcCoder/.e2e-b.png' })
  console.log('  screenshot saved')
}

if (phase === 'c') {
  console.log('\n=== PHASE C — thinking indicator ===')
  await page.evaluate(() => window.__arc.runTurn('Build a full React dashboard app with charts, routing, and a sidebar.'))
  await sleep(7000)
  const st = await getState()
  console.log('  status:', st.status, '· reasoningChars:', st.reasoningChars, '· model:', st.model)
  await page.screenshot({ path: 'F:/ArcCoder/.e2e-think.png' })
  console.log('  screenshot saved (mid-thinking)')
}

if (phase === 'd') {
  console.log('\n=== PHASE D — real landing-page build (Arc3Mini) ===')
  await page.evaluate(() => { const s = window.__arc.store.getState(); s.setOverride('arc3mini'); s.setEffort('medium') })
  await page.evaluate(() => window.__arc.runTurn('Build a simple, attractive landing page for a coffee shop as static files (index.html + styles.css, vanilla). Then start a server so I can preview it.'))
  console.log('  prompt sent; polling up to 150s…')
  let last = ''
  for (let i = 0; i < 30; i++) {
    await sleep(5000)
    const st = await getState()
    const sig = JSON.stringify([st.status, st.actions, st.preview, st.errors, st.openFiles])
    if (sig !== last) {
      console.log(`  [${i * 5}s] status=${st.status} preview=${st.preview ? 'YES' : 'no'} files=${st.openFiles.length} reasoning=${st.reasoningChars}c`)
      if (st.actions.length) console.log('        actions:', st.actions.join(' · '))
      if (st.errors.length) console.log('        ERRORS:', st.errors.join(' | '))
      last = sig
    }
    if (i % 4 === 3) await page.screenshot({ path: 'F:/ArcCoder/.e2e-d.png' })
    if ((st.status === 'idle' || st.status === 'error') && i > 2) break
  }
  const fin = await getState()
  console.log('  FINAL preview:', fin.preview, '· files:', fin.openFiles)
  await sleep(2000)
  await page.screenshot({ path: 'F:/ArcCoder/.e2e-d.png' })
}

if (phase === 'e') {
  console.log('\n=== PHASE E — Arc3Ultra thinking stream ===')
  await page.evaluate(() => { const s = window.__arc.store.getState(); s.setOverride('arc3ultra'); s.setEffort('medium') })
  await page.evaluate(() => window.__arc.runTurn('In two sentences, what makes a good landing page?'))
  for (let i = 0; i < 30; i++) {
    await sleep(5000)
    const st = await getState()
    console.log(`  [${i * 5}s] status=${st.status} reasoning=${st.reasoningChars}c assistant=${st.assistant.length}c`)
    if ((st.status === 'idle' || st.status === 'error') && i > 1) break
  }
  await page.screenshot({ path: 'F:/ArcCoder/.e2e-e.png' })
}

if (phase === 'f') {
  console.log('\n=== PHASE F — static-server fallback (deterministic) ===')
  await page.evaluate(async () => {
    const t = window.__arc
    await t.executeTool('write_file', { path: 'index.html', content: '<!doctype html><html><body style="margin:0;font-family:system-ui;background:#faf9f5;color:#141413;display:grid;place-items:center;height:100vh"><h1 style="font-family:Georgia,serif">☕ Coffee Co.</h1></body></html>' })
    await t.executeTool('write_file', { path: 'styles.css', content: 'body{margin:0}' })
    await t.executeTool('start_dev_server', {})
  })
  let url = null
  for (let i = 0; i < 30; i++) {
    url = await page.evaluate(() => window.__arc.store.getState().previewUrl)
    if (url) break
    await sleep(1000)
  }
  console.log('  previewUrl:', url)
  await sleep(2500)
  await page.screenshot({ path: 'F:/ArcCoder/.e2e-f.png' })
  console.log(url ? '✓ static preview is live' : '✗ no preview URL')
}

if (phase === 'g') {
  console.log('\n=== PHASE G — DuckDuckGo web search ===')
  const out = await page.evaluate(async () => await window.__arc.executeTool('web_search', { query: 'react useEffect cleanup function' }))
  console.log('  ok:', out.ok)
  console.log('  result (first 900 chars):\n' + (out.result || '(empty)').slice(0, 900))
}

if (phase === 'h') {
  console.log('\n=== PHASE H — npm create vite (must NOT hang on the npx prompt) ===')
  const t0 = Date.now()
  const out = await page.evaluate(async () => {
    return await window.__arc.executeTool('run_command', { command: 'npm create vite@latest tdapp -- --template react' })
  })
  console.log(`  finished in ${Math.round((Date.now() - t0) / 1000)}s · ok=${out.ok}`)
  console.log('  output tail:\n' + (out.result || '').slice(-450))
}

if (phase === 'j') {
  console.log('\n=== PHASE J — stdin forwarding probe ===')
  await page.evaluate(
    async () =>
      await window.__arc.executeTool('write_file', {
        path: 'ask.cjs',
        content: "process.stdout.write('ASK: ');process.stdin.once('data',d=>{process.stdout.write('GOT['+d.toString().trim()+']');process.exit(0)});",
      }),
  )
  const r1 = await page.evaluate(async () => await window.__arc.executeTool('run_command', { command: 'node ask.cjs' }))
  console.log(`  run → waiting=${/waiting for input/.test(r1.result)} | ${r1.result.slice(0, 90).replace(/\n/g, ' ')}`)
  const r2 = await page.evaluate(async () => await window.__arc.executeTool('send_input', { input: 'hello{enter}' }))
  console.log(`  send_input → ${r2.result.slice(0, 160).replace(/\n/g, ' ')}`)
}

if (phase === 'i') {
  console.log('\n=== PHASE I — interactive npm create vite (drive the menus) ===')
  const step1 = await page.evaluate(async () => await window.__arc.executeTool('run_command', { command: 'npm create vite@latest tdapp2 -- --template react' }))
  const waiting1 = /waiting for input/.test(step1.result)
  console.log(`  run_command → waiting=${waiting1} ok=${step1.ok}`)
  console.log('  tail:', step1.result.slice(-200).replace(/\n+/g, ' ⏎ '))
  for (let i = 0; i < 6; i++) {
    const more = await page.evaluate(async () => await window.__arc.executeTool('send_input', { input: '{enter}' }))
    const w = /waiting for input/.test(more.result)
    console.log(`  send_input #${i + 1} → waiting=${w} ok=${more.ok} | ${more.result.slice(-120).replace(/\n+/g, ' ⏎ ')}`)
    if (!w) break
  }
  const files = await page.evaluate(async () => await window.__arc.executeTool('list_dir', { path: 'tdapp2' }))
  console.log('  tdapp2 contents:', (files.result || '(none)').replace(/\n/g, ' '))
}

if (phase === 'k') {
  console.log('\n=== PHASE K — read_file returns full large files (no truncation loop) ===')
  const big =
    '<!doctype html>\n<style>\n' +
    Array.from({ length: 300 }, (_, i) => `.row-${i} { color: #${(i % 999).toString().padStart(3, '0')}; padding: ${i}px; }`).join('\n') +
    '\n</style>\n<script>\n' +
    Array.from({ length: 120 }, (_, i) => `function fn${i}(){ return ${i} * 2 }`).join('\n') +
    '\n</script>\n<!-- END-MARKER-9137 -->\n'
  console.log('  file length:', big.length, '(old cap was 8000)')
  await page.evaluate(async (content) => await window.__arc.executeTool('write_file', { path: 'big.html', content }), big)
  const rd = await page.evaluate(async () => await window.__arc.executeTool('read_file', { path: 'big.html' }))
  console.log('  read result length:', rd.result.length)
  console.log('  sees the JS half (fn119):', rd.result.includes('function fn119'))
  console.log('  sees the END marker:', rd.result.includes('END-MARKER-9137'))
}

if (phase === 'l') {
  console.log('\n=== PHASE L — "make it better" refinement does NOT narration-loop ===')
  const basic = `<!doctype html><html><head><title>Snake</title></head><body>
<canvas id="c" width="400" height="400"></canvas>
<script>
const cv=document.getElementById('c'),x=cv.getContext('2d');let s=[{x:10,y:10}],f={x:5,y:5},dx=1,dy=0,sc=0;
function step(){const h={x:s[0].x+dx,y:s[0].y+dy};if(h.x<0||h.x>19||h.y<0||h.y>19){s=[{x:10,y:10}];sc=0;return}s.unshift(h);if(h.x==f.x&&h.y==f.y){sc++;f={x:(Math.random()*20)|0,y:(Math.random()*20)|0}}else s.pop();x.fillStyle='#000';x.fillRect(0,0,400,400);x.fillStyle='#0f0';s.forEach(p=>x.fillRect(p.x*20,p.y*20,18,18));x.fillStyle='#f00';x.fillRect(f.x*20,f.y*20,18,18)}
document.onkeydown=e=>{if(e.key=='ArrowUp'){dx=0;dy=-1}if(e.key=='ArrowDown'){dx=0;dy=1}if(e.key=='ArrowLeft'){dx=-1;dy=0}if(e.key=='ArrowRight'){dx=1;dy=0}};
setInterval(step,120);
</script></body></html>`
  await page.evaluate(async (c) => await window.__arc.executeTool('write_file', { path: 'index.html', content: c }), basic)
  const before = basic.length
  await page.evaluate(() => { const s = window.__arc.store.getState(); s.setOverride('arc3ultra'); s.setEffort('medium') })
  const t0 = Date.now()
  // Fire-and-poll: don't await the turn's promise (that would block on protocolTimeout).
  await page.evaluate(() => {
    window.__arc.runTurn('Make this snake game much better: smooth movement, a particle burst when eating food, sound effects via WebAudio, a start screen, score + high score, and mobile controls. Keep it a single index.html.')
    return true
  })
  await new Promise((r) => setTimeout(r, 2000))
  // Poll until the turn finishes (status back to idle/error) or a hard cap.
  for (let i = 0; i < 100; i++) {
    const st = await page.evaluate(() => window.__arc.store.getState().status)
    if (st === 'idle' || st === 'error') break
    await new Promise((r) => setTimeout(r, 3000))
  }
  const elapsed = Math.round((Date.now() - t0) / 1000)
  const info = await page.evaluate(async () => {
    const s = window.__arc.store.getState()
    const tl = s.timeline
    const tools = tl.filter((t) => t.kind === 'action').map((t) => t.tool)
    const completed = tools.includes('complete')
    const content = await window.__arc.executeTool('read_file', { path: 'index.html' })
    return { status: s.status, items: tl.length, tools, completed, len: content.result.length }
  })
  console.log(`  elapsed: ${elapsed}s  (old build hung ~2006s)`)
  console.log(`  final status: ${info.status}`)
  console.log(`  tool calls: ${info.tools.join(', ')}`)
  console.log(`  called complete: ${info.completed}`)
  console.log(`  index.html: ${before} -> ${info.len} chars`)
}

await browser.close()
console.log('done.')
