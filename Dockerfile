# syntax=docker/dockerfile:1
# ============================================================
#  SCOUT MINI 巡逻管控平台 —— 前端镜像
#  多阶段：node 构建 → nginx 托管静态资源并反代 /api
#  构建：docker build -t patrol-web:2.0.0 .
# ============================================================

# ---------- 构建阶段 ----------
FROM node:22-alpine AS build

WORKDIR /app

# 先只拷贝依赖清单，命中缓存后不必每次重装
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# 生产走同源（nginx 反代 /api），因此不需要 VITE_API_BASE
RUN npm run build

# ---------- 运行阶段 ----------
FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
