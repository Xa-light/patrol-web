# SCOUT MINI 巡逻管控平台（前端）

阶段 4 交付物：基于 Vue 3 的巡逻车云端管控平台前端，覆盖登录鉴权、实时状态可视化、
远程控制、任务与路线管理、报警处理、操作日志与用户管理。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Vue 3.5（`<script setup>` 组合式 API） |
| 构建 | Vite 8 |
| 路由 | vue-router 5（history 模式 + 全局前置守卫） |
| 状态 | Pinia 4（auth / vehicle / alarm 三个 store） |
| UI | Element Plus 2.14（中文语言包 + 全量图标） |
| 图表 | ECharts 6（按需引入：line / bar / pie / gauge） |
| 请求 | axios 1.20（统一实例 + 拦截器） |

## 运行

```bash
npm install
npm run dev        # 默认 http://localhost:5173，已配置 /api 代理到 127.0.0.1:8000
npm run build      # 产物输出到 dist/
```

后端默认运行在 `http://127.0.0.1:8000`。如需指向其他地址，可在 `.env.local` 中设置：

```
VITE_API_BASE=http://192.168.1.102:8000
```

## 演示账号

| 账号 | 密码 | 角色 | 可见菜单 |
| --- | --- | --- | --- |
| `admin` | `Admin123456` | ADMIN | 全部功能 |
| `operator` | `Operator123` | OPERATOR | 总览 / 控制 / 路线 / 任务 / 报警 / 日志 |
| `viewer` | `Viewer123` | VIEWER | 总览 / 报警（只读，无操作按钮） |

登录页提供三个账号的一键填充，便于验收时快速切换角色演示权限差异。

## 目录结构

```
src/
├─ api/            接口层：每个业务域一个文件，统一走 request.js
│  └─ request.js   axios 实例：注入 Token、解包 {code,message,data}、401/403 处理
├─ stores/         Pinia：auth（登录态）、vehicle（1s 遥测轮询 + 轨迹）、alarm（5s 未读数）
├─ router/         路由表与守卫（meta.roles 做角色鉴权，未登录跳 /login）
├─ layouts/        DefaultLayout：侧边菜单（按角色过滤）+ 顶栏实时状态条
├─ components/     MetricCard（指标卡）、ChartBox（ECharts 封装，含 loading/空/错三态）、StateHint
├─ views/          Login / Dashboard / SlamMap / Control / Photos / Routes / Tasks / Alarms / Logs / Users / 403 / 404
├─ utils/          时间与字典格式化
└─ styles/         设计 token 与全局样式
```

## 关键实现说明

- **鉴权链路**：登录拿到 Token 后写入 localStorage；路由守卫在 `meta.roles` 不含当前角色时跳 403；
  后端同样以 `require_role()` 做二次校验，前端隐藏按钮只是体验层，不是安全边界。
- **实时性**：车辆遥测 1s 轮询（`silent` 模式，失败不弹全局提示），报警未读数 5s 轮询，
  总览页统计 15s 刷新；页面卸载时统一 `stopPolling()`，避免定时器泄漏。
- **三态处理**：列表页均实现 Loading（骨架屏）、空态（带图标与引导文案）、错误态（带重试按钮）。
- **数据可视化**：总览页 4 张图（电压趋势、任务状态环形、报警趋势堆叠柱、报警类型横向柱），
  控制页 1 个速度仪表盘 + 1 张自绘 SVG 行驶轨迹图。
- **SLAM 地图**：`/map` 页把阶段3 车端建图结果（1056×1056，0.05 m/px）作为底图，
  SVG 叠加巡逻路线、历史轨迹、报警点与车辆实时位姿；米↔像素换算见 `SlamMap.vue` 的 `PX()` / `PY()`。
- **自主巡逻**：控制页独立卡片，走 `cmd/task{action:start|stop}`。启动后**只发 task、不发 control**，
  否则会把车端刚进入的 auto 模式顶成 manual（车端仲裁优先级 `estop > rc > teleop > 云端控制 > 自主`）。
- **抓拍相册**：`/photos` 页下发 `cmd/task{action:photo}`，车端拍照后 HTTP 上传，列表自动刷新；
  支持原因分类、全屏预览、只读角色降级。
- **权限降级**：VIEWER 进入只读页面时顶部显示提示条，操作按钮置灰而非隐藏，便于理解权限差异。

## 与车端的对接

控制指令经后端转 MQTT `scout/<sn>/cmd/control`（顶层 `linear` / `angular`），
任务下发走 `scout/<sn>/cmd/task`。车端离线时后端启用演示数据模拟器，
网页侧无需改动即可完整演示全部功能。
