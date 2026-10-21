/**
 * 阶段5 压力测试脚本（零第三方依赖，Node.js 原生 fetch）
 * 用法：node load-test.mjs --base=http://127.0.0.1:8000 --duration=30 --concurrency=10
 */
const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=http://127.0.0.1:8000').slice(7)
const DURATION_SEC = parseInt((process.argv.find(a => a.startsWith('--duration=')) || '--duration=30').slice(11), 10) || 30
const CONCURRENCY = parseInt((process.argv.find(a => a.startsWith('--concurrency=')) || '--concurrency=10').slice(14), 10) || 10

let token = ''
const results = [] // { ok, ms }
let running = true

async function login() {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123456' }),
  })
  const d = await r.json().catch(() => ({}))
  token = d.data?.token || ''
}

async function once() {
  const t0 = performance.now()
  try {
    const r = await fetch(`${BASE}/api/v1/vehicles`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
    })
    const ok = r.status === 200
    results.push({ ok, ms: performance.now() - t0 })
  } catch (e) {
    results.push({ ok: false, ms: performance.now() - t0 })
  }
}

async function worker() {
  while (running) {
    await once()
    // 极短间隔避免完全空转
    await new Promise(r => setTimeout(r, 10))
  }
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b)
  const i = Math.ceil((p / 100) * s.length) - 1
  return s[Math.max(0, i)]
}

async function main() {
  await login()
  if (!token) { console.error('登录失败，无法压测'); process.exit(1) }
  console.log(`Load test: ${BASE} | concurrency=${CONCURRENCY} | duration=${DURATION_SEC}s\n`)

  const workers = Array.from({ length: CONCURRENCY }, () => worker())
  setTimeout(() => { running = false }, DURATION_SEC * 1000)
  await Promise.all(workers)

  const total = results.length
  const okCount = results.filter(r => r.ok).length
  const times = results.map(r => r.ms)
  const avg = times.reduce((a, b) => a + b, 0) / total
  const min = Math.min(...times)
  const max = Math.max(...times)

  console.log(`总请求数 : ${total}`)
  console.log(`成功数   : ${okCount} (${(okCount/total*100).toFixed(2)}%)`)
  console.log(`失败数   : ${total - okCount}`)
  console.log(`RPS      : ${(total / DURATION_SEC).toFixed(2)}`)
  console.log(`平均耗时 : ${avg.toFixed(2)} ms`)
  console.log(`最小耗时 : ${min.toFixed(2)} ms`)
  console.log(`最大耗时 : ${max.toFixed(2)} ms`)
  console.log(`P50      : ${percentile(times, 50).toFixed(2)} ms`)
  console.log(`P90      : ${percentile(times, 90).toFixed(2)} ms`)
  console.log(`P99      : ${percentile(times, 99).toFixed(2)} ms`)
}

main().catch(e => { console.error(e); process.exit(1) })
