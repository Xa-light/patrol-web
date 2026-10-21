#!/usr/bin/env node
/**
 * SCOUT MINI 巡逻管控平台 · 接口自动化测试
 * ------------------------------------------------------------------
 * 用途：验证前端所依赖的全部后端接口「可用 + 返回结构正确 + 权限生效」，
 *      并串联「登录 → 控制 → 路线 → 任务 → 报警 → 日志」核心业务流。
 *
 * 用法：
 *   node tests/api-test.mjs                       # 默认跑 http://127.0.0.1:8000
 *   node tests/api-test.mjs --base=http://192.168.1.106:8000
 *   node tests/api-test.mjs --allow-motion        # 额外执行会驱动实车的用例
 *
 * 说明：
 *   - 默认跳过 2 个会驱动实车的用例（自主巡逻启动、自动重定位），
 *     避免测试过程把车开走；加 --allow-motion 可纳入。
 *   - 所有用例自带清理：新建的车辆 / 路线 / 任务 / 用户 / 报警都会被删除或关闭，
 *     不污染演示数据。
 *   - 结果同时打印到控制台并写入 tests/report/api-test-result.json。
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'report')
const OUT_FILE = resolve(OUT_DIR, 'api-test-result.json')

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2)
const getArg = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.split('=').slice(1).join('=') : d
}
const BASE = getArg('base', process.env.API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '')
const ALLOW_MOTION = argv.includes('--allow-motion')

/* ---------------- 请求封装 ---------------- */
async function call(method, path, { token, json, body, headers, timeout = 20000 } = {}) {
  const opt = { method, headers: { ...(headers || {}) } }
  if (token) opt.headers.Authorization = `Bearer ${token}`
  if (json !== undefined) {
    opt.headers['Content-Type'] = 'application/json'
    opt.body = JSON.stringify(json)
  } else if (body !== undefined) {
    opt.body = body
  }

  const t0 = performance.now()
  try {
    const res = await fetch(BASE + path, { ...opt, signal: AbortSignal.timeout(timeout) })
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    return { status: res.status, data, text, ms: Math.round(performance.now() - t0) }
  } catch (e) {
    return { status: 0, data: null, text: String(e?.message || e), ms: Math.round(performance.now() - t0) }
  }
}

/* ---------------- 用例执行器 ---------------- */
const results = []
let seq = 0

function short(r) {
  if (r.status === 0) return `连接失败：${r.text}`
  const d = r.data
  if (!d) return r.text ? r.text.slice(0, 60) : '(空响应)'
  const msg = d.message ? `${d.message}` : ''
  const trace = d.traceId ? ` · ${d.traceId}` : ''
  return msg + trace
}

/**
 * @param {object} meta  { mod, name, method, path, expect }
 * @param {Function} fn  返回 { status, ms, pass, note, actual }
 */
async function runCase(meta, fn) {
  const c = { id: ++seq, ...meta }
  try {
    const r = await fn()
    c.status = r.status
    c.ms = r.ms ?? 0
    c.pass = !!r.pass
    c.skipped = !!r.skipped
    c.note = r.note || ''
    c.actual = r.actual || ''
  } catch (e) {
    c.status = 0
    c.ms = 0
    c.pass = false
    c.note = `断言异常：${e.message}`
    c.actual = ''
  }
  results.push(c)
  const flag = c.skipped ? 'SKIP' : c.pass ? 'PASS' : 'FAIL'
  const color = flag === 'PASS' ? '\x1b[32m' : flag === 'SKIP' ? '\x1b[33m' : '\x1b[31m'
  console.log(
    `${color}${flag}\x1b[0m ${String(c.id).padStart(2)} ${String(c.mod).padEnd(8)} ${c.name}` +
      `  \x1b[90m${c.method} ${c.path} → ${c.status} (${c.ms}ms)\x1b[0m` +
      (c.note ? `  \x1b[90m${c.note}\x1b[0m` : '')
  )
  return c
}

/** 正向用例简写：状态码 2xx 且通过可选断言 */
const ok = (method, path, opts = {}, check = null) => async () => {
  const r = await call(method, path, opts)
  let pass = r.status >= 200 && r.status < 300
  let note = ''
  if (pass && check) {
    try {
      check(r)
    } catch (e) {
      pass = false
      note = e.message
    }
  } else if (!pass) {
    note = short(r)
  }
  return { status: r.status, ms: r.ms, pass, note, actual: short(r) }
}

/** 负向用例简写：期望特定状态码 */
const bad = (method, path, expectStatus, opts = {}) => async () => {
  const r = await call(method, path, opts)
  const pass = r.status === expectStatus
  return {
    status: r.status,
    ms: r.ms,
    pass,
    note: pass ? '' : `期望 ${expectStatus}，实际 ${r.status}`,
    actual: short(r),
  }
}

const skip = (reason) => async () => ({
  status: 0,
  ms: 0,
  pass: true,
  skipped: true,
  note: `跳过：${reason}`,
})

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

/* ---------------- 测试数据 ---------------- */
const STAMP = Date.now().toString(36).slice(-5)
const TMP = {
  vehicleCode: `test_${STAMP}`,
  vehicleId: null,
  routeId: null,
  taskId: null,
  alarmId: null,
  userId: null,
  photoId: null,
  uploadUrl: null,
}

const TOKENS = {}
const LOGIN = { admin: ['admin', 'Admin123456'], operator: ['operator', 'Operator123'], viewer: ['viewer', 'Viewer123'] }

// 1×1 像素 JPEG（用于上传接口测试）
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
)

/* ==================================================================
 * 开始
 * ================================================================== */
console.log(`\n\x1b[1mSCOUT MINI 巡逻管控平台 · 接口自动化测试\x1b[0m`)
console.log(`目标服务：${BASE}`)
console.log(`实车动作用例：${ALLOW_MOTION ? '启用' : '跳过（保护实车，可用 --allow-motion 开启）'}\n`)

/* ---------- M1 认证与权限 ---------- */
for (const [role, [u, p]] of Object.entries(LOGIN)) {
  await runCase(
    { mod: '认证', name: `${role} 账号登录`, method: 'POST', path: '/api/v1/auth/login', expect: '200' },
    ok('POST', '/api/v1/auth/login', { json: { username: u, password: p } }, (r) => {
      assert(r.data?.data?.token, '响应缺少 data.token')
      TOKENS[role] = r.data.data.token
    })
  )
}

const T = TOKENS.admin

await runCase(
  { mod: '认证', name: '错误密码被拒绝', method: 'POST', path: '/api/v1/auth/login', expect: '401' },
  bad('POST', '/api/v1/auth/login', 401, { json: { username: 'admin', password: 'wrong-pass-123' } })
)

await runCase(
  { mod: '认证', name: '获取当前用户信息', method: 'GET', path: '/api/v1/auth/me', expect: '200' },
  ok('GET', '/api/v1/auth/me', { token: T }, (r) => {
    assert(r.data?.data?.username === 'admin', '当前用户不是 admin')
    assert(r.data.data.role === 'ADMIN', '角色字段异常')
  })
)

await runCase(
  { mod: '认证', name: '未携带 Token 访问受保护接口', method: 'GET', path: '/api/v1/auth/me', expect: '401' },
  bad('GET', '/api/v1/auth/me', 401)
)

await runCase(
  { mod: '权限', name: '未登录访问车辆列表', method: 'GET', path: '/api/v1/vehicles', expect: '401' },
  bad('GET', '/api/v1/vehicles', 401)
)

await runCase(
  { mod: '权限', name: '操作员注册车辆（应 403）', method: 'POST', path: '/api/v1/vehicles', expect: '403' },
  bad('POST', '/api/v1/vehicles', 403, {
    token: TOKENS.operator,
    json: { code: `op_${STAMP}`, name: '越权测试' },
  })
)

await runCase(
  { mod: '权限', name: '观察员查看用户列表（应 403）', method: 'GET', path: '/api/v1/users', expect: '403' },
  bad('GET', '/api/v1/users', 403, { token: TOKENS.viewer })
)

await runCase(
  { mod: '权限', name: '观察员下发遥控指令（应 403）', method: 'POST', path: '/api/v1/remote/drive', expect: '403' },
  bad('POST', '/api/v1/remote/drive', 403, {
    token: TOKENS.viewer,
    json: { direction: 'stop', sn: 'scout01' },
  })
)

/* ---------- M2 车辆管理 ---------- */
await runCase(
  { mod: '车辆', name: '车辆列表（含实时遥测合并）', method: 'GET', path: '/api/v1/vehicles', expect: '200' },
  ok('GET', '/api/v1/vehicles', { token: T }, (r) => {
    const items = r.data?.data?.items
    assert(Array.isArray(items), 'data.items 不是数组')
    assert(items.length > 0, '车辆列表为空')
    assert('online' in items[0], '缺少 online 字段')
  })
)

await runCase(
  { mod: '车辆', name: '注册车辆', method: 'POST', path: '/api/v1/vehicles', expect: '200' },
  ok('POST', '/api/v1/vehicles', {
    token: T,
    json: { code: TMP.vehicleCode, name: '接口测试车', model: 'SCOUT MINI' },
  }, (r) => {
    TMP.vehicleId = r.data?.data?.vehicleId
    assert(TMP.vehicleId, '响应缺少 vehicleId')
  })
)

await runCase(
  { mod: '车辆', name: '重复编号注册（应 409）', method: 'POST', path: '/api/v1/vehicles', expect: '409' },
  bad('POST', '/api/v1/vehicles', 409, {
    token: T,
    json: { code: TMP.vehicleCode, name: '重复车' },
  })
)

await runCase(
  { mod: '车辆', name: '车辆详情', method: 'GET', path: '/api/v1/vehicles/{id}', expect: '200' },
  ok('GET', `/api/v1/vehicles/${TMP.vehicleId}`, { token: T }, (r) => {
    assert(r.data?.data?.code === TMP.vehicleCode, '返回车辆编号不匹配')
  })
)

await runCase(
  { mod: '车辆', name: '修改车辆名称', method: 'PATCH', path: '/api/v1/vehicles/{id}', expect: '200' },
  ok('PATCH', `/api/v1/vehicles/${TMP.vehicleId}`, { token: T, json: { name: '接口测试车-改名' } }, (r) => {
    assert(r.data?.data?.name === '接口测试车-改名', '名称未更新')
  })
)

await runCase(
  { mod: '车辆', name: '无遥测车辆查询最新遥测（应 404）', method: 'GET', path: '/api/v1/vehicles/{id}/telemetry/latest', expect: '404' },
  bad('GET', `/api/v1/vehicles/${TMP.vehicleId}/telemetry/latest`, 404, { token: T })
)

await runCase(
  { mod: '车辆', name: '车端状态上报', method: 'POST', path: '/api/v1/vehicles/{id}/status', expect: '200' },
  ok('POST', `/api/v1/vehicles/${TMP.vehicleId}/status`, {
    token: T,
    json: { status: 'OFFLINE', battery: 88.5 },
  }, (r) => {
    assert(r.data?.data?.battery === 88.5, 'battery 未写入')
  })
)

await runCase(
  { mod: '车辆', name: '下发控制指令（零速，不产生位移）', method: 'POST', path: '/api/v1/vehicles/{id}/commands', expect: '200' },
  ok('POST', `/api/v1/vehicles/${TMP.vehicleId}/commands`, {
    token: T,
    json: { action: 'MOTION', linear: 0, angular: 0 },
  }, (r) => {
    assert(r.data?.data?.accepted === true, '指令未被接受')
    assert(String(r.data.data.topic).includes('cmd/control'), 'MQTT topic 不正确')
  })
)

await runCase(
  { mod: '车辆', name: '查询不存在车辆（应 404）', method: 'GET', path: '/api/v1/vehicles/{id}', expect: '404' },
  bad('GET', '/api/v1/vehicles/veh_not_exist', 404, { token: T })
)

/* ---------- M3 遥控与巡逻 ---------- */
await runCase(
  { mod: '遥控', name: '遥控停止（speed=0）', method: 'POST', path: '/api/v1/remote/drive', expect: '200' },
  ok('POST', '/api/v1/remote/drive', { token: T, json: { direction: 'stop', sn: 'scout01' } }, (r) => {
    assert(Number(r.data?.data?.linear) === 0, 'linear 应为 0')
    assert(Number(r.data?.data?.angular) === 0, 'angular 应为 0')
  })
)

await runCase(
  { mod: '遥控', name: '遥控方向映射（forward, speed=0 校验符号）', method: 'POST', path: '/api/v1/remote/drive', expect: '200' },
  ok('POST', '/api/v1/remote/drive', {
    token: T,
    json: { direction: 'forward', sn: 'scout01', speed: 0 },
  }, (r) => {
    assert(Number(r.data?.data?.linear) === 0, '零速下 linear 应为 0')
  })
)

await runCase(
  { mod: '遥控', name: '紧急停车', method: 'POST', path: '/api/v1/remote/stop', expect: '200' },
  ok('POST', '/api/v1/remote/stop?sn=scout01', { token: T })
)

await runCase(
  { mod: '遥控', name: '急停解除（state=false）', method: 'POST', path: '/api/v1/remote/estop', expect: '200' },
  ok('POST', '/api/v1/remote/estop?state=false&sn=scout01', { token: T })
)

await runCase(
  { mod: '巡逻', name: '巡逻/在线状态查询', method: 'GET', path: '/api/v1/patrol/status', expect: '200' },
  ok('GET', '/api/v1/patrol/status?sn=scout01', { token: T }, (r) => {
    const d = r.data?.data
    assert(d && 'online' in d && 'mode' in d, '缺少 online / mode 字段')
  })
)

await runCase(
  { mod: '巡逻', name: '启动自主巡逻', method: 'POST', path: '/api/v1/patrol/start', expect: '200' },
  ALLOW_MOTION
    ? ok('POST', '/api/v1/patrol/start', { token: T, json: { sn: 'scout01' } })
    : skip('会驱动实车，默认跳过')
)

await runCase(
  { mod: '巡逻', name: '停止自主巡逻', method: 'POST', path: '/api/v1/patrol/stop', expect: '200' },
  ok('POST', '/api/v1/patrol/stop', { token: T, json: { sn: 'scout01' } })
)

/* ---------- M4 路线管理 ---------- */
await runCase(
  { mod: '路线', name: '路线列表', method: 'GET', path: '/api/v1/routes', expect: '200' },
  ok('GET', '/api/v1/routes', { token: T }, (r) => {
    assert(Array.isArray(r.data?.data?.items), 'data.items 不是数组')
  })
)

await runCase(
  { mod: '路线', name: '创建路线（含 3 航点）', method: 'POST', path: '/api/v1/routes', expect: '200' },
  ok('POST', '/api/v1/routes', {
    token: T,
    json: {
      name: `接口测试路线_${STAMP}`,
      area: 'A 栋 3 层',
      description: '自动化测试创建，用例结束即删除',
      waypoints: [
        { x: -16.0, y: 10.5, yaw: 0, dwellSec: 0 },
        { x: -17.5, y: 11.5, yaw: 0.5, dwellSec: 0 },
        { x: -18.5, y: 10.5, yaw: 1.0, dwellSec: 0 },
      ],
    },
  }, (r) => {
    TMP.routeId = r.data?.data?.routeId
    assert(TMP.routeId, '响应缺少 routeId')
    assert(r.data.data.waypointCount === 3, '航点数量不为 3')
  })
)

await runCase(
  { mod: '路线', name: '路线详情', method: 'GET', path: '/api/v1/routes/{id}', expect: '200' },
  ok('GET', `/api/v1/routes/${TMP.routeId}`, { token: T }, (r) => {
    assert(r.data?.data?.waypoints?.length === 3, '航点数量不为 3')
  })
)

await runCase(
  { mod: '路线', name: '更新路线名称', method: 'PUT', path: '/api/v1/routes/{id}', expect: '200' },
  ok('PUT', `/api/v1/routes/${TMP.routeId}`, {
    token: T,
    json: {
      name: `接口测试路线_${STAMP}_改`,
      area: 'A 栋 3 层',
      description: '已更新',
      waypoints: [
        { x: -16.0, y: 10.5, yaw: 0, dwellSec: 0 },
        { x: -17.0, y: 11.0, yaw: 0.5, dwellSec: 0 },
      ],
    },
  }, (r) => {
    assert(String(r.data?.data?.name).endsWith('_改'), '名称未更新')
    assert(r.data.data.waypointCount === 2, '航点数量未更新')
  })
)

await runCase(
  { mod: '路线', name: '查询不存在路线（应 404）', method: 'GET', path: '/api/v1/routes/{id}', expect: '404' },
  bad('GET', '/api/v1/routes/rte_not_exist', 404, { token: T })
)

/* ---------- M5 任务管理 ---------- */
await runCase(
  { mod: '任务', name: '任务列表', method: 'GET', path: '/api/v1/tasks', expect: '200' },
  ok('GET', '/api/v1/tasks', { token: T }, (r) => {
    assert(Array.isArray(r.data?.data?.items), 'data.items 不是数组')
  })
)

await runCase(
  { mod: '任务', name: '创建任务（落 PENDING，不启动）', method: 'POST', path: '/api/v1/tasks', expect: '200' },
  ok('POST', '/api/v1/tasks', {
    token: T,
    json: {
      name: `接口测试任务_${STAMP}`,
      vehicleId: 'veh_scout01',
      routeId: TMP.routeId,
      mode: 'IMMEDIATE',
      scheduledAt: null,
      cronExpr: null,
    },
  }, (r) => {
    TMP.taskId = r.data?.data?.taskId
    assert(TMP.taskId, '响应缺少 taskId')
    assert(r.data.data.status === 'PENDING', '新任务状态应为 PENDING')
  })
)

await runCase(
  { mod: '任务', name: '任务详情', method: 'GET', path: '/api/v1/tasks/{id}', expect: '200' },
  ok('GET', `/api/v1/tasks/${TMP.taskId}`, { token: T }, (r) => {
    assert(r.data?.data?.taskId === TMP.taskId, '任务 ID 不匹配')
  })
)

await runCase(
  { mod: '任务', name: '状态迁移 PENDING → TERMINATED', method: 'PATCH', path: '/api/v1/tasks/{id}/status', expect: '200' },
  ok('PATCH', `/api/v1/tasks/${TMP.taskId}/status`, {
    token: T,
    json: { action: 'TERMINATE', reason: '接口测试' },
  }, (r) => {
    assert(r.data?.data?.status === 'TERMINATED', '状态未变为 TERMINATED')
  })
)

await runCase(
  { mod: '任务', name: '已终止任务再暂停（应 409）', method: 'PATCH', path: '/api/v1/tasks/{id}/status', expect: '409' },
  bad('PATCH', `/api/v1/tasks/${TMP.taskId}/status`, 409, { token: T, json: { action: 'PAUSE' } })
)

await runCase(
  { mod: '任务', name: '用不存在车辆建任务（应 404）', method: 'POST', path: '/api/v1/tasks', expect: '404' },
  bad('POST', '/api/v1/tasks', 404, {
    token: T,
    json: { name: '非法任务', vehicleId: 'veh_not_exist', routeId: TMP.routeId, mode: 'IMMEDIATE' },
  })
)

/* ---------- M6 报警管理 ---------- */
await runCase(
  { mod: '报警', name: '报警列表', method: 'GET', path: '/api/v1/alarms', expect: '200' },
  ok('GET', '/api/v1/alarms?limit=10', { token: T }, (r) => {
    assert(Array.isArray(r.data?.data?.items), 'data.items 不是数组')
  })
)

await runCase(
  { mod: '报警', name: '上报报警（人工补录）', method: 'POST', path: '/api/v1/alarms', expect: '200' },
  ok('POST', '/api/v1/alarms', {
    token: T,
    json: {
      vehicleId: 'veh_scout01',
      type: 'OBSTACLE',
      level: 'WARNING',
      message: `接口自动化测试报警 ${STAMP}`,
      position: { x: -16.1, y: 10.4 },
    },
  }, (r) => {
    TMP.alarmId = r.data?.data?.alarmId
    assert(TMP.alarmId, '响应缺少 alarmId')
    assert(r.data.data.status === 'PENDING', '新报警状态应为 PENDING')
  })
)

await runCase(
  { mod: '报警', name: '报警详情', method: 'GET', path: '/api/v1/alarms/{id}', expect: '200' },
  ok('GET', `/api/v1/alarms/${TMP.alarmId}`, { token: T }, (r) => {
    assert(r.data?.data?.alarmId === TMP.alarmId, '报警 ID 不匹配')
  })
)

await runCase(
  { mod: '报警', name: '确认报警 PENDING → ACKNOWLEDGED', method: 'PATCH', path: '/api/v1/alarms/{id}', expect: '200' },
  ok('PATCH', `/api/v1/alarms/${TMP.alarmId}`, {
    token: T,
    json: { status: 'ACKNOWLEDGED', handleComment: '已通知现场人员' },
  }, (r) => {
    assert(r.data?.data?.status === 'ACKNOWLEDGED', '状态未变为 ACKNOWLEDGED')
  })
)

await runCase(
  { mod: '报警', name: '关闭报警 ACKNOWLEDGED → CLOSED', method: 'PATCH', path: '/api/v1/alarms/{id}', expect: '200' },
  ok('PATCH', `/api/v1/alarms/${TMP.alarmId}`, {
    token: T,
    json: { status: 'CLOSED', handleComment: '接口自动化测试收尾' },
  }, (r) => {
    assert(r.data?.data?.status === 'CLOSED', '状态未变为 CLOSED')
    assert(r.data.data.handleComment, '处理备注未落库')
  })
)

await runCase(
  { mod: '报警', name: '重复处理已关闭报警（应 409）', method: 'PATCH', path: '/api/v1/alarms/{id}', expect: '409' },
  bad('PATCH', `/api/v1/alarms/${TMP.alarmId}`, 409, { token: T, json: { status: 'CLOSED' } })
)

await runCase(
  { mod: '报警', name: '实时异常报警流（供网页推送）', method: 'GET', path: '/api/v1/alerts', expect: '200' },
  ok('GET', '/api/v1/alerts?limit=10', { token: T })
)

/* ---------- M7 抓拍与图片 ---------- */
await runCase(
  { mod: '抓拍', name: '触发车端拍照', method: 'POST', path: '/api/v1/photo/capture', expect: '200' },
  ok('POST', '/api/v1/photo/capture', { token: T, json: { sn: 'scout01', reason: 'cloud' } }, (r) => {
    assert(r.data?.data?.accepted !== false, '拍照指令未被接受')
  })
)

await runCase(
  { mod: '抓拍', name: '图片列表', method: 'GET', path: '/api/v1/photos', expect: '200' },
  ok('GET', '/api/v1/photos?limit=10', { token: T }, (r) => {
    const items = r.data?.data?.items
    assert(Array.isArray(items), 'data.items 不是数组')
    if (items.length) TMP.photoId = items[0].photoId
  })
)

await runCase(
  { mod: '抓拍', name: '图片详情', method: 'GET', path: '/api/v1/photos/{id}', expect: '200' },
  ok('GET', `/api/v1/photos/${TMP.photoId}`, { token: T }, (r) => {
    assert(r.data?.data?.photoId === TMP.photoId, '图片 ID 不匹配')
    assert(String(r.data.data.url).startsWith('/uploads/'), 'url 前缀异常')
  })
)

await runCase(
  { mod: '抓拍', name: '车端图片上传（multipart）', method: 'POST', path: '/upload', expect: '200' },
  async () => {
    const fd = new FormData()
    fd.append('file', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'test.jpg')
    fd.append('sn', 'scout01')
    fd.append('reason', 'api_test')
    const r = await call('POST', '/upload', { body: fd })
    const pass = r.status >= 200 && r.status < 300 && !!r.data?.data?.url
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: short(r) }
  }
)

await runCase(
  { mod: '抓拍', name: '车端图片上传（RAW 二进制 + 请求头）', method: 'POST', path: '/upload/raw', expect: '200' },
  async () => {
    const r = await call('POST', '/upload/raw', {
      body: TINY_JPEG,
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Vehicle-Sn': 'scout01',
        'X-Reason': 'api_test_raw',
      },
    })
    if (r.status >= 200 && r.status < 300) TMP.uploadUrl = r.data?.data?.url
    const pass = r.status >= 200 && r.status < 300 && !!TMP.uploadUrl
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: short(r) }
  }
)

await runCase(
  { mod: '抓拍', name: '图片静态访问（/uploads）', method: 'GET', path: '/uploads/{date}/{file}', expect: '200' },
  async () => {
    const r = await call('GET', TMP.uploadUrl || '/uploads/19700101/none.jpg')
    const pass = r.status === 200 && r.text.length > 0
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: `${r.text.length} 字节` }
  }
)

await runCase(
  { mod: '抓拍', name: '云端抓拍通知记录', method: 'GET', path: '/api/v1/mqtt/photos', expect: '200' },
  ok('GET', '/api/v1/mqtt/photos?limit=10', { token: T })
)

/* ---------- M8 数据统计 ---------- */
const STATS = [
  ['总览统计（在线数/任务/报警）', '/api/v1/stats/overview'],
  ['报警趋势（按小时）', '/api/v1/stats/alarm-trend?hours=24'],
  ['报警类型分布', '/api/v1/stats/alarm-types'],
  ['任务状态分布', '/api/v1/stats/task-status'],
  ['电量/速度趋势', '/api/v1/stats/battery-trend?sn=scout01&minutes=30'],
  ['车辆位姿轨迹', '/api/v1/stats/vehicle-positions?minutes=30'],
]
for (const [name, path] of STATS) {
  await runCase(
    { mod: '统计', name, method: 'GET', path: path.split('?')[0], expect: '200' },
    ok('GET', path, { token: T }, (r) => {
      assert(r.data?.data, '响应缺少 data')
    })
  )
}

/* ---------- M9 地图与导航代理 ---------- */
await runCase(
  { mod: '地图', name: 'SLAM 地图元信息', method: 'GET', path: '/api/v1/map/meta', expect: '200' },
  ok('GET', '/api/v1/map/meta', { token: T }, (r) => {
    const d = r.data?.data
    assert(d?.width > 0 && d?.height > 0, '地图尺寸异常')
    assert(d?.resolution > 0, '分辨率异常')
    assert(d?.origin?.x !== undefined, '缺少 origin')
    assert(String(d.imageUrl).length > 0, '缺少 imageUrl')
  })
)

await runCase(
  { mod: '导航', name: '车端导航实时状态', method: 'GET', path: '/api/v1/nav/state', expect: '200' },
  ok('GET', '/api/v1/nav/state', { token: T }, (r) => {
    assert(r.data?.data?.online === true, '车端导航服务未连通')
  })
)

// 取消目标（幂等，无目标时也应返回成功）
await runCase(
  { mod: '导航', name: '取消导航目标', method: 'POST', path: '/api/v1/nav/cmd', expect: '200' },
  ok('POST', '/api/v1/nav/cmd', { token: T, json: { action: 'cancel' } })
)

// 目标点设为车辆当前位姿 → 验证下发链路，不产生实际位移
let curPose = null
await runCase(
  { mod: '导航', name: '点选导航（目标=当前位姿，零位移）', method: 'POST', path: '/api/v1/nav/goal', expect: '200' },
  async () => {
    const s = await call('GET', '/api/v1/nav/state', { token: T })
    const p = s.data?.data?.pose || s.data?.data
    curPose = { x: Number(p?.x ?? -16.13), y: Number(p?.y ?? 10.48) }
    const r = await call('POST', '/api/v1/nav/goal', {
      token: T,
      json: { x: curPose.x, y: curPose.y, sn: 'scout01' },
    })
    const pass = r.status >= 200 && r.status < 300
    // 立即取消，避免残留目标
    await call('POST', '/api/v1/nav/cmd', { token: T, json: { action: 'cancel' } })
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: short(r) }
  }
)

await runCase(
  { mod: '导航', name: '设置初始位姿（写入当前位姿，无副作用）', method: 'POST', path: '/api/v1/nav/setpose', expect: '200' },
  async () => {
    const s = await call('GET', '/api/v1/nav/state', { token: T })
    const p = s.data?.data?.pose || s.data?.data
    const r = await call('POST', '/api/v1/nav/setpose', {
      token: T,
      json: { x: Number(p?.x ?? -16.13), y: Number(p?.y ?? 10.48), yaw: Number(p?.yaw ?? 2.94) },
    })
    const pass = r.status >= 200 && r.status < 300
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: short(r) }
  }
)

await runCase(
  { mod: '导航', name: '自动重新定位（60–80s）', method: 'POST', path: '/api/v1/nav/relocalize', expect: '200' },
  ALLOW_MOTION ? ok('POST', '/api/v1/nav/relocalize', { token: T, json: {}, timeout: 90000 }) : skip('耗时 60–80s 且车辆原地旋转，默认跳过')
)

/* ---------- M10 日志与用户 ---------- */
await runCase(
  { mod: '日志', name: '操作日志列表', method: 'GET', path: '/api/v1/logs', expect: '200' },
  ok('GET', '/api/v1/logs?limit=20', { token: T }, (r) => {
    assert(Array.isArray(r.data?.data?.items), 'data.items 不是数组')
  })
)

await runCase(
  { mod: '日志', name: '日志按方法与状态码过滤', method: 'GET', path: '/api/v1/logs', expect: '200' },
  ok('GET', '/api/v1/logs?method=POST&status=200&limit=10', { token: T }, (r) => {
    const items = r.data?.data?.items || []
    assert(items.every((x) => x.method === 'POST'), '过滤条件未生效')
  })
)

await runCase(
  { mod: '用户', name: '用户列表', method: 'GET', path: '/api/v1/users', expect: '200' },
  ok('GET', '/api/v1/users', { token: T }, (r) => {
    const items = r.data?.data?.items || []
    assert(items.length >= 3, '内置账号不足 3 个')
    assert(!('password' in items[0]), '响应泄露 password 字段')
  })
)

await runCase(
  { mod: '用户', name: '新增用户', method: 'POST', path: '/api/v1/users', expect: '200' },
  ok('POST', '/api/v1/users', {
    token: T,
    json: {
      username: `apitest_${STAMP}`,
      password: 'Test123456',
      display_name: '接口测试账号',
      role: 'VIEWER',
    },
  }, (r) => {
    TMP.userId = r.data?.data?.userId
    assert(TMP.userId, '响应缺少 userId')
  })
)

await runCase(
  { mod: '用户', name: '用户详情', method: 'GET', path: '/api/v1/users/{id}', expect: '200' },
  ok('GET', `/api/v1/users/${TMP.userId}`, { token: T }, (r) => {
    assert(r.data?.data?.role === 'VIEWER', '角色不匹配')
  })
)

await runCase(
  { mod: '用户', name: '修改用户角色', method: 'PATCH', path: '/api/v1/users/{id}', expect: '200' },
  ok('PATCH', `/api/v1/users/${TMP.userId}`, { token: T, json: { role: 'OPERATOR' } }, (r) => {
    assert(r.data?.data?.role === 'OPERATOR', '角色未更新')
  })
)

await runCase(
  { mod: '用户', name: '重置密码', method: 'PUT', path: '/api/v1/users/{id}/password', expect: '200' },
  ok('PUT', `/api/v1/users/${TMP.userId}/password`, { token: T, json: { new_password: 'Reset123456' } })
)

await runCase(
  { mod: '用户', name: '删除用户', method: 'DELETE', path: '/api/v1/users/{id}', expect: '204' },
  async () => {
    const r = await call('DELETE', `/api/v1/users/${TMP.userId}`, { token: T })
    const pass = r.status === 204
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: short(r) }
  }
)

/* ---------- M11 清理与健康检查 ---------- */
await runCase(
  { mod: '清理', name: '删除测试路线', method: 'DELETE', path: '/api/v1/routes/{id}', expect: '204' },
  async () => {
    const r = await call('DELETE', `/api/v1/routes/${TMP.routeId}`, { token: T })
    const pass = r.status === 204
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: short(r) }
  }
)

await runCase(
  { mod: '清理', name: '删除测试车辆', method: 'DELETE', path: '/api/v1/vehicles/{id}', expect: '204' },
  async () => {
    const r = await call('DELETE', `/api/v1/vehicles/${TMP.vehicleId}`, { token: T })
    const pass = r.status === 204
    return { status: r.status, ms: r.ms, pass, note: pass ? '' : short(r), actual: short(r) }
  }
)

await runCase(
  { mod: '清理', name: '删除后车辆不可见（应 404）', method: 'GET', path: '/api/v1/vehicles/{id}', expect: '404' },
  bad('GET', `/api/v1/vehicles/${TMP.vehicleId}`, 404, { token: T })
)

await runCase(
  { mod: '服务', name: '服务健康检查', method: 'GET', path: '/', expect: '200' },
  ok('GET', '/')
)

await runCase(
  { mod: '认证', name: '登出', method: 'POST', path: '/api/v1/auth/logout', expect: '200' },
  ok('POST', '/api/v1/auth/logout', { token: T })
)

/* ==================================================================
 * 汇总
 * ================================================================== */
const ran = results.filter((r) => !r.skipped)
const passed = ran.filter((r) => r.pass)
const failed = ran.filter((r) => !r.pass)
const skipped = results.filter((r) => r.skipped)

const byMod = {}
for (const r of results) {
  byMod[r.mod] ||= { total: 0, pass: 0, fail: 0, skip: 0 }
  byMod[r.mod].total++
  if (r.skipped) byMod[r.mod].skip++
  else if (r.pass) byMod[r.mod].pass++
  else byMod[r.mod].fail++
}

const summary = {
  base: BASE,
  startedAt: new Date().toISOString(),
  allowMotion: ALLOW_MOTION,
  total: results.length,
  executed: ran.length,
  passed: passed.length,
  failed: failed.length,
  skipped: skipped.length,
  passRate: ran.length ? +((passed.length / ran.length) * 100).toFixed(2) : 0,
  avgMs: ran.length ? Math.round(ran.reduce((s, r) => s + r.ms, 0) / ran.length) : 0,
  maxMs: ran.reduce((s, r) => Math.max(s, r.ms), 0),
  byModule: byMod,
  cases: results,
  testData: TMP,
}

console.log('\n' + '─'.repeat(78))
console.log('模块'.padEnd(10) + '用例'.padEnd(8) + '通过'.padEnd(8) + '失败'.padEnd(8) + '跳过')
for (const [m, v] of Object.entries(byMod)) {
  console.log(String(m).padEnd(12) + String(v.total).padEnd(8) + String(v.pass).padEnd(10) + String(v.fail).padEnd(10) + String(v.skip))
}
console.log('─'.repeat(78))
console.log(
  `\x1b[1m合计 ${summary.total} 例｜执行 ${summary.executed}｜通过 ${summary.passed}｜失败 ${summary.failed}｜跳过 ${summary.skipped}\x1b[0m`
)
console.log(
  `通过率 \x1b[1m${summary.passRate}%\x1b[0m ｜ 平均响应 ${summary.avgMs}ms ｜ 最大 ${summary.maxMs}ms\n`
)

if (failed.length) {
  console.log('\x1b[31m失败用例：\x1b[0m')
  for (const f of failed) console.log(`  #${f.id} ${f.mod}/${f.name} → ${f.status} ${f.note}`)
  console.log()
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2), 'utf8')
console.log(`结果已写入 ${OUT_FILE}\n`)

process.exit(failed.length ? 1 : 0)
