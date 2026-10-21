/**
 * 阶段5 部署后自检脚本
 * 零第三方依赖，Node.js 原生 fetch
 * 用法：node deploy-check.mjs --base=http://127.0.0.1:8000
 */
const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=http://127.0.0.1:8000').slice(7)
const abort = (ms) => AbortSignal.timeout(ms)

function ok(label, pass, detail = '') {
  const s = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`[${s}] ${label}${detail ? ' → ' + detail : ''}`)
  return pass
}

async function health() {
  const r = await fetch(`${BASE}/api/v1/health`, { signal: abort(5000) })
  if (!r.ok) return ok('健康检查', false, `status=${r.status}`)
  const d = await r.json().catch(() => ({}))
  const p = d.code === 200 && d.data?.version
  return ok('健康检查', p, `version=${d.data?.version} store=${d.data?.store}`)
}

async function login() {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123456' }),
    signal: abort(5000),
  })
  if (!r.ok) return ok('登录', false, `status=${r.status}`)
  const d = await r.json().catch(() => ({}))
  const t = d.data?.token || ''
  const jwt = t.startsWith('eyJ')
  return ok('登录', jwt, `tokenType=${d.data?.tokenType} expiresIn=${d.data?.expiresIn}s`)
}

async function mysql(store) {
  const pass = store === 'mysql'
  return ok('MySQL 持久化', pass, `store=${store}`)
}

async function staticFile() {
  const r = await fetch(`${BASE}/`, { signal: abort(5000) })
  const html = await r.text().catch(() => '')
  const hasApp = html.includes('<div id="app">') || html.includes('patrol')
  return ok('前端 SPA 托管', hasApp, `content-length=${html.length}`)
}

async function main() {
  console.log(`Deploy check: ${BASE}\n`)
  const h = await health()
  const s = h ? await (async () => {
    const r = await fetch(`${BASE}/api/v1/health`, { signal: abort(5000) })
    const d = await r.json().catch(() => ({}))
    return d.data?.store
  })() : 'unknown'
  await mysql(s)
  await login()
  await staticFile()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
