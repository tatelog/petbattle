import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const demoDir = path.join(root, 'public', 'demo')
const workDir = path.join(demoDir, '.submission-video', 'recorded')
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const appUrl = 'http://127.0.0.1:5188/'
const debugPort = 9338
const fps = 15
const recordMode = process.argv.includes('--battle-only') ? 'battle' : 'full'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForHttp(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {
      // The local process may still be starting.
    }
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
        return
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
    })
    this.socket.addEventListener('close', (event) => {
      for (const pending of this.pending.values()) pending.reject(new Error(`Chrome DevTools connection closed (${event.code})`))
      this.pending.clear()
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  once(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(method) ?? []
      const timeout = setTimeout(() => {
        this.listeners.set(method, listeners.filter((item) => item !== handler))
        reject(new Error(`Timed out waiting for ${method}`))
      }, timeoutMs)
      const handler = (params) => {
        clearTimeout(timeout)
        this.listeners.set(method, listeners.filter((item) => item !== handler))
        resolve(params)
      }
      listeners.push(handler)
      this.listeners.set(method, listeners)
    })
  }

  close() {
    this.socket.close()
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result?.value
}

async function navigate(client, url) {
  const loaded = client.once('Page.loadEventFired')
  await client.send('Page.navigate', { url })
  await loaded
  await sleep(500)
}

async function prepareCleanPage(client) {
  await navigate(client, `${appUrl}?motion=full`)
  const loaded = client.once('Page.loadEventFired')
  await evaluate(client, `(() => {
    localStorage.setItem('petbattle-locale', 'en');
    localStorage.setItem('petbattle-theme', 'dark');
    location.reload();
  })()`)
  await loaded
  await sleep(700)
  await evaluate(client, `(() => {
    document.documentElement.dataset.motion = 'full';
    document.body.style.cursor = 'none';
    window.scrollTo(0, 0);
  })()`)
}

async function grindToLevelTwo(client) {
  await navigate(client, `${appUrl}?motion=reduced`)
  const result = await evaluate(client, `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.includes(text));
    const actions = ['Physical', 'Magic', 'Defense'];
    for (let match = 0; match < 12; match += 1) {
      const progress = JSON.parse(localStorage.getItem('petbattle-player-progress-v1') || '{"xp":0}');
      if ((progress.xp || 0) >= 160) return progress;
      const start = button(match === 0 ? 'Start CPU Battle in 3D Colosseum' : 'Rematch') || button('Start CPU Battle in 3D Colosseum');
      if (start && !start.disabled) start.click();
      await sleep(180);
      for (let turn = 0; turn < 36 && !document.querySelector('.result-card'); turn += 1) {
        const action = button(actions[turn % actions.length]);
        if (action && !action.disabled) action.click();
        await sleep(110);
      }
      await sleep(550);
    }
    return JSON.parse(localStorage.getItem('petbattle-player-progress-v1') || '{"xp":0}');
  })()`)
  if (!result || result.xp < 160) throw new Error(`Real battle progression did not reach Level 2: ${JSON.stringify(result)}`)
  return result
}

async function captureClip(client, name, durationSeconds, actions = []) {
  const framesDir = path.join(workDir, `${name}-frames`)
  await rm(framesDir, { recursive: true, force: true })
  await mkdir(framesDir, { recursive: true })
  const totalFrames = Math.ceil(durationSeconds * fps)
  const startedAt = Date.now()
  let actionIndex = 0

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const timelineSeconds = frame / fps
    while (actionIndex < actions.length && timelineSeconds >= actions[actionIndex].at) {
      await evaluate(client, actions[actionIndex].expression)
      actionIndex += 1
    }
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
      fromSurface: true,
      captureBeyondViewport: false,
    })
    await writeFile(
      path.join(framesDir, `frame-${String(frame).padStart(5, '0')}.jpg`),
      Buffer.from(screenshot.data, 'base64'),
    )
    const nextFrameAt = startedAt + ((frame + 1) * 1000 / fps)
    const remaining = nextFrameAt - Date.now()
    if (remaining > 0) await sleep(remaining)
  }

  const output = path.join(workDir, `${name}.mp4`)
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame-%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', '30', '-an', output,
    ], { cwd: root, windowsHide: true, stdio: 'inherit' })
    ffmpeg.once('error', reject)
    ffmpeg.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))
  })
  return output
}

const clickButton = (text) => `(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes(${JSON.stringify(text)}));
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()`

const scrollToSelector = (selector, offset = 0) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return false;
  window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY + ${offset}, behavior: 'smooth' });
  return true;
})()`

let serverProcess
let chromeProcess
let client

try {
  try {
    await waitForHttp(appUrl, 1_500)
  } catch {
    serverProcess = spawn('npm.cmd', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5188'], {
      cwd: root,
      windowsHide: true,
      stdio: 'ignore',
    })
    await waitForHttp(appUrl)
  }

  await mkdir(workDir, { recursive: true })
  const profileDir = path.join('C:\\tmp', `petbattle-record-${process.pid}-${Date.now()}`)
  await mkdir(profileDir, { recursive: true })
  chromeProcess = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    '--disable-crash-reporter',
    '--disable-breakpad',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,720',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--lang=en-US',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    'about:blank',
  ], { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'] })

  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`)
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  const target = targets.find((item) => item.type === 'page')
  if (!target) throw new Error('Chrome page target was not found')
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.open()
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  })

  await prepareCleanPage(client)
  if (recordMode === 'full') {
    await captureClip(client, 'summon', 24, [
    { at: 2.8, expression: scrollToSelector('.summon-panel', -10) },
    { at: 3.2, expression: `(() => { const image = document.querySelector('.pet-visual'); if (!image) return false; image.style.animation = 'none'; void image.offsetWidth; image.style.animation = ''; return true; })()` },
    { at: 10.0, expression: clickButton('Analyze locally') },
    { at: 13.2, expression: `window.scrollBy({ top: 310, behavior: 'smooth' })` },
    { at: 18.0, expression: scrollToSelector('.battle-mode-panel', -70) },
    ])
  } else {
    await evaluate(client, scrollToSelector('.battle-mode-panel', -70))
    await sleep(700)
  }

  await evaluate(client, clickButton('Start CPU Battle in 3D Colosseum'))
  await captureClip(client, 'battle', 30, [
    { at: 6.2, expression: clickButton('Physical') },
    { at: 7.9, expression: clickButton('Magic') },
    { at: 9.6, expression: clickButton('Defense') },
    { at: 11.3, expression: clickButton('Physical') },
    { at: 13.0, expression: clickButton('Magic') },
    { at: 14.7, expression: clickButton('Defense') },
    { at: 16.4, expression: clickButton('Physical') },
    { at: 18.1, expression: clickButton('Magic') },
    { at: 19.8, expression: clickButton('Defense') },
    { at: 21.5, expression: clickButton('Physical') },
    { at: 23.2, expression: clickButton('Magic') },
    { at: 24.9, expression: clickButton('Defense') },
    { at: 26.6, expression: clickButton('Physical') },
  ])

  if (recordMode === 'full') {
    await grindToLevelTwo(client)
    await navigate(client, `${appUrl}?motion=full`)
    await captureClip(client, 'progression', 20, [
    { at: 1.2, expression: scrollToSelector('#evolution-lab', -20) },
    { at: 7.0, expression: `window.scrollBy({ top: 330, behavior: 'smooth' })` },
    { at: 13.0, expression: `window.scrollBy({ top: 300, behavior: 'smooth' })` },
    ])

    await evaluate(client, scrollToSelector('.evolution-quest', -30))
    await captureClip(client, 'evolution', 30, [
    { at: 2.0, expression: `(() => {
      const input = document.querySelector('input[list="theme-examples"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Starlight Owl');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()` },
    { at: 3.2, expression: `(() => {
      const select = document.querySelector('.quest-form select');
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'layers');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()` },
    { at: 4.5, expression: clickButton('Generate guidance and build SVG model') },
    { at: 8.0, expression: `window.scrollBy({ top: 310, behavior: 'smooth' })` },
    { at: 12.0, expression: `(() => {
      const textarea = document.querySelector('.reflection-field textarea');
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, 'I separated the eyes, wings, and glow into layers so the owl stays readable at thumbnail size.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()` },
    { at: 15.0, expression: clickButton('Save as learning evidence and evolve PET') },
    { at: 19.0, expression: `window.scrollBy({ top: 420, behavior: 'smooth' })` },
    { at: 24.0, expression: `window.scrollTo({ top: 0, behavior: 'smooth' })` },
    ])

    await evaluate(client, clickButton('Start CPU Battle in 3D Colosseum'))
    await captureClip(client, 'evolved-battle', 14, [
    { at: 6.2, expression: clickButton('Magic') },
    { at: 8.6, expression: clickButton('Defense') },
    { at: 11.0, expression: clickButton('Physical') },
    ])
  }

  console.log(`Recorded clean demo clips in ${workDir}`)
} finally {
  client?.close()
  chromeProcess?.kill()
  serverProcess?.kill()
}
