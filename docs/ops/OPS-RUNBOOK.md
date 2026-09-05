# new-api 运维手册(本机部署)

> 适用环境:Windows + Docker Desktop,仓库路径 `D:\docker\new-api`
> 最后更新:2026-09-05(新增 §9 Prompt 日志开关;此前基于 dev 分支 `5e70fb4f` 源码构建实例)

## 1. 容器拓扑

| 容器 | 镜像 | 端口 | 状态 | 用途 |
|---|---|---|---|---|
| `new-api-src` | `new-api:dev-src`(本地源码构建) | `0.0.0.0:8800 → 3000` | 运行 | **当前生产实例**,dev 分支源码构建 |
| `new-api-src-redis` | `redis:7-alpine` | 无发布 | 运行 | 上例的缓存后端 |
| `new-api-monitor` | `new-api-monitor:local` | 无发布 | 运行 | 渠道额度监控 + 渠道自动启停/优先级 + 渠道错误率告警(企业微信推送),源码在 `D:\docker\new-api-monitor` |
| `new-api-local` | `calciumion/new-api:latest`(官方,rc.24) | — | 已停用 | 旧实例,数据卷 `local_data` 保留作回滚 |
| `new-api-local-redis` | `redis` | — | 已停用 | 旧实例缓存 |

访问入口:
- 办公网:`http://10.87.57.5:8800`
- 家庭网:`http://192.168.0.134:8800`
- 本机:`http://127.0.0.1:8800`

管理员:root(密码见密码管理器,本文档不记录明文)。

## 2. 数据卷

| 卷 | 内容 | 说明 |
|---|---|---|
| `src_data` | SQLite 数据库 `/data/one-api.db` | 当前实例全部数据(用户/令牌/渠道/配置) |
| `src_logs` | 运行日志 | `--log-dir /app/logs` |
| `local_data` | 旧实例数据库 | **回滚用,勿删**;与 `src_data` 互不相通 |

⚠️ SQLite 不支持多实例并发写。任何情况下不要让两个 new-api 容器同时挂载同一个数据卷。

## 3. compose 文件一览

| 文件 | 用途 |
|---|---|
| `docker-compose.build.yml` | **当前生产栈**(源码构建 + redis),项目名 `new-api-src` |
| `Dockerfile.src-build` | 源码构建 Dockerfile,与官方 Dockerfile 唯一区别:Go 构建阶段增加 `GOPROXY=https://goproxy.cn,direct`(国内网络必需) |
| `docker-compose.local.yml` | 旧栈(官方镜像),头部注释"build from source"与实际不符,已弃用 |
| `docker-compose.yml` | 上游原始文件,未使用 |

## 4. 源码重建流程

```powershell
cd D:\docker\new-api
# VERSION 文件仓库里是空的(上游靠 CI 注入),构建前临时写版本号便于识别
# 例:echo v1.0.0-dev.<commit短hash> > VERSION
git rev-parse --short HEAD   # 取短 hash 填入上一行
docker compose -f docker-compose.build.yml up -d --build
git restore VERSION          # 构建完成后立即还原,避免污染工作区
```

- 构建 multistage:两套前端(bun)+ Go,首次约 5–10 分钟
- 数据卷在重建间保留,账户/渠道/配置不丢
- 构建失败最常见原因见《故障排查手册》§3

版本确认:`curl http://127.0.0.1:8800/api/status` 看 `version` 字段。

## 5. 回滚到旧实例(官方 rc.24)

```powershell
# 当前栈与旧栈都用 8800,先停当前
docker compose -f D:\docker\new-api\docker-compose.build.yml down
# 起新栈(8800 空出后)
docker compose -f D:\docker\new-api\docker-compose.local.yml up -d
```

⚠️ 回滚前注意:回滚后是旧数据(`local_data`),当前实例上新建的用户/令牌/渠道不在里面。且旧镜像带"登录会话数上限"功能(见排查手册 §2),monitor 必须保持 access token 模式。

## 6. 常用命令速查

```powershell
docker compose -f docker-compose.build.yml ps          # 栈状态
docker compose -f docker-compose.build.yml logs -f     # 跟日志
docker compose -f docker-compose.build.yml restart     # 重启(配置类环境变量改动需 up -d 重建)
docker logs new-api-src --since 30m 2>&1 | findstr /c:"429"
curl http://127.0.0.1:8800/api/status                  # 健康检查
docker exec new-api-src ls /data                       # 数据目录
```

## 7. 凭据与敏感信息位置(只记位置,不记值)

| 凭据 | 位置 |
|---|---|
| new-api root 密码 | 管理员密码管理器 |
| monitor 的 NewAPI 访问令牌 | `D:\docker\new-api-monitor\.env` 的 `NEWAPI_ACCESS_TOKEN`(root 系统访问令牌) |
| monitor 的 GitLab 令牌 | 同上 `.env` |
| 渠道上游 Key | 实例数据库(控制台"渠道"页) |

规范:
- 禁止把密码/令牌写进任何会提交的文件、聊天记录、临时脚本
- 临时脚本用完即删;若脚本含密钥,不能落盘到临时目录
- monitor 永远使用 access token 模式,禁止恢复账密轮询(见排查手册 §2)

## 8. 关键环境变量(当前实例)

| 变量 | 值 | 原因 |
|---|---|---|
| `CRITICAL_RATE_LIMIT` | 100 | Docker Desktop 下所有客户端共享网关 IP,默认 20 次/20 分钟不够用(见排查手册 §4) |
| `REDIS_CONN_STRING` | redis://redis | 缓存与批量更新 |
| `BATCH_UPDATE_ENABLED` | true | 批量额度更新,降低 DB 压力 |
| `PromptLogEnabled` | 未设置(默认关闭) | 由仓库根 `.env` 的 `PROMPT_LOG_ENABLED` 控制,见 §9 |

运营配置(数据库 options 表,非环境变量):`SelfUseModeEnabled=true`(自用模式,跳过模型价格校验)。

## 9. Prompt 日志(用户输入记录)开关

> 背景:2026-09-05 排查 `/api/prompt_log/` 返回空时确认——该功能默认关闭,当时 options 表无 `PromptLogEnabled`,`prompt_logs` 全表 0 行,接口行为正常。现改为 compose 变量显式控制,部署时自主决定开关。

### 记录边界(重要)

**只记录用户编写的自然语言输入**。以下内容一律不记录:

| 不记录 | 说明 |
|---|---|
| AI 生成内容 | 请求历史中的 assistant 角色消息、Responses API 回传的 `output_text`/AI prefill(三种接入格式均按 role 严格过滤) |
| 响应与输出 | 采集发生在转发上游**之前**,只读请求体,响应通道完全不经过采集代码 |
| 工具结果 | `role=tool` 消息、Claude `tool_result` 块、Responses `function_call_output` |
| 系统/机器注入 | `<system-reminder>`、`<system-notice>`、memory 注入块、AI 接续摘要等(有专门清洗逻辑) |
| 非文本内容 | 图片/文件 URL、音频等 |
| 不支持的接口 | Gemini 原生格式(`:generateContent`)、`/v1/completions` 的 prompt 字段、embeddings、audio、image、rerank、realtime |

其余行为:每请求只取**最后一条**用户文本;同一用户 60 秒内相同内容去重;单条截断 16KB(`PromptLogMaxContentBytes`);保留 32 天,每日 01:00 自动清理;异步落库(默认 1 秒批量刷盘)。

### 开启 / 关闭

方式 A —— `.env`(推荐,部署形态可版本化):

```powershell
# 仓库根目录 .env(参考 .env.example 同名段落):
#   PROMPT_LOG_ENABLED=true
docker compose -f docker-compose.build.yml up -d   # 环境变量改动需重建容器
```

方式 B —— 运行时 option API(立即生效,无需重建;root 系统访问令牌):

```powershell
curl -X PUT http://127.0.0.1:8800/api/option/ -H "Authorization: Bearer <root访问令牌>" -H "Content-Type: application/json" -d "{\"key\":\"PromptLogEnabled\",\"value\":\"true\"}"
```

⚠️ 优先级:方式 B 会把值写入数据库 options 表,**DB 值优先生于环境变量**。想回到 `.env` 控制,需先用 API 改回同值或删除该 option 行,再重建容器。

### 验证

开启后产生几笔聊天请求,然后:

```powershell
# start_time/end_time 为 Unix 秒
curl "http://127.0.0.1:8800/api/prompt_log/?p=1&page_size=20&user=<用户名>&start_time=<秒>&end_time=<秒>"
```

返回 `items` 非空即生效。注意:该用户在查询时段内须确有 chat 类请求(embeddings 等不计入);`content_preview` 只应出现用户输入文本。
