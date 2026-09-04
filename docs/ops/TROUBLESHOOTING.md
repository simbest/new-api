# new-api 故障排查手册(本机部署实测案例)

> 全部条目来自 2026-09 本机实际故障,命令均已验证可用。
> 环境背景见《OPS-RUNBOOK.md》。

## 1. 请求 429 —— 先分清两类来源

**决策树:**

```
429 报错
├─ 控制台页面报错(如"复制密钥"失败,/api/* 接口)
│   └─ new-api 自身限流 → 见 §4
└─ 中转请求报错(/v1/*,/api/status 里版本正常)
    └─ 上游渠道透传 → 见 §5
```

快速判别命令:

```powershell
docker logs new-api-src --since 30m 2>&1 | findstr /c:"channel error"
```

- 有 `channel error (channel #N, status code: 429): ...` → 上游问题(§5)
- 无 channel error 但 GIN 日志有 `| 429 |` 且耗时 <5ms(根本没出网)→ 自身限流(§4)

## 2. 登录提示"活跃登录会话数量已达上限"

**根因**:官方镜像 ≥rc.24 引入登录会话管理(每用户默认 50 个活跃会话,有效期 30 天,超限登录返回 409)。本机曾因 monitor 每 3 分钟账密登录一次,3 天堆满 52 个会话,导致管理员与 monitor 全部无法登录。

**处理(按顺序)**:
1. 任一仍登录的设备:个人设置 → 登录会话 → 退出其他登录会话
2. 都无法访问:重置密码(撤销全部会话)
3. 根治:监控类程序**必须用 access token**,禁止账密轮询登录

**预防**:当前源码构建实例(dev 分支)无此功能,天然免疫;若回滚到官方镜像(见运维手册 §5),必须先确认 monitor 是 token 模式。

## 3. 源码构建失败:`go mod download` TLS handshake timeout

**根因**:构建容器直连 `proxy.golang.org` 被墙。

**处理**:已内置在 `Dockerfile.src-build`(Go 阶段 `ENV GOPROXY=https://goproxy.cn,direct`),正常不会再现。若换机器/换 Dockerfile 重现,参照该文件加一行即可。bun/npm 依赖走 npmjs 一般无碍。

## 4. 控制台接口 429(复制密钥 / 重置密码等)

**根因**:`/api/token/:id/key` 等接口挂 `CriticalRateLimit`(默认 **20 次/20 分钟/IP**)。Docker Desktop 端口映射后**所有客户端在容器里都是同一个网关 IP(如 172.21.0.1)**,全员共用一个限流桶——批量建令牌+复制 key 的操作很容易打穿。

**已做处理**:compose 设置 `CRITICAL_RATE_LIMIT=100`。

**仍触发时**:
- 等 20 分钟窗口释放即可,无需重启
- 若还不够,继续上调该环境变量并 `docker compose -f docker-compose.build.yml up -d` 重建
- 浏览器控制台的"XML 解析错误:找不到根元素"只是对 429 空响应体的解析抱怨,非独立故障

**相关变量**:`CRITICAL_RATE_LIMIT_ENABLE`(默认开)、`CRITICAL_RATE_LIMIT_DURATION`(默认 1200 秒)。

## 5. 中转 429:上游套餐额度耗尽(透传)

**实例**:`channel error (channel #6, status code: 429): Token Plan quota has been exceeded` —— `claude-DeepSeek-scnet` 上游 Token Plan 用完,而该渠道是 `DeepSeek-V4-Flash-0731` 唯一供应方,用户请求全部 429。

**处理选项**:
1. 等上游额度重置 / 续费
2. 给同模型增加备用渠道(注意优先级:数值大的优先)
3. 临时停用该渠道,让客户端明确收到"无可用渠道"而非反复 429

**检查某模型有哪些渠道**:控制台渠道页看"模型"列,或用 API:`GET /api/channel/?p=1&page_size=100` 后按 models 字段过滤。

## 6. `模型 XXX 的价格未配置`

**根因**:实例未开自用模式且该模型无价格配置。

**处理**:自用场景直接开自用模式(API `PUT /api/option/ {"key":"SelfUseModeEnabled","value":"true"}` 或控制台 系统设置→运营设置)。若需正式计费,则去 分组与模型定价设置 配置价格。

**教训**:搭建/迁移新实例时,除了渠道,**运营配置(options)也要迁移或比对**——本机曾因只迁渠道漏掉此项导致用户报障。

## 7. `git fetch/push` 卡死后超时

**根因**(本机 2026-09 实测,两处叠加):
1. 远程是 SSH 地址但 `~/.ssh` 无密钥、无 known_hosts → 卡在主机指纹确认
2. 全局 `~/.gitconfig` 有 `http.https://github.com.proxy=http://127.0.0.1:7897`,而代理软件未运行 → HTTPS 操作全部连不上

**已做处理**:
- 远程改为 `https://github.com/simbest/new-api.git`(Windows 凭据管理器存有凭据)
- 本仓库局部覆盖代理为空:`git config http.https://github.com.proxy ""`(不动全局配置)

**将来代理恢复后想走代理**:删掉本仓库覆盖 `git config --unset http.https://github.com.proxy`。

## 8. 脚本调 new-api 管理 API 401

两个必踩的坑:
1. **必须带 `New-Api-User: <用户ID>` 请求头**,仅 Cookie/令牌不够
2. 令牌列表接口返回的是**掩码 key**;完整 key 要调 `POST /api/token/:id/key`(注意它计入 CriticalRateLimit,见 §4)

脚本示例(用 root 系统访问令牌,无会话副作用):

```
Authorization: <access_token>        # 裸令牌,不加 Bearer 前缀
New-Api-User: 1
```

access token 生成:登录后 `GET /api/user/token`(每次调用生成新令牌并使旧的失效)。

## 9. 日志里大量 `SELECT * FROM tokens WHERE key = ... rows:0`

**含义**:某客户端在用一个**不存在/已删除的令牌**高频打中转接口(返回 401)。不影响别人,但刷日志。

**定位**:看相邻 GIN 行的来源 IP 与路径;处理:让该设备更新令牌配置,或封禁其来源。

## 10. monitor 报"未找到匹配 NewAPI 渠道"

非故障:monitor 按监控键标签与渠道**名称精确匹配**。渠道改名/删除后,对应监控键会显示"跳过(未找到匹配 NewAPI 渠道)"。

monitor 相关要点(2026-09-04 升级后):
- 配置在 `D:\docker\new-api-monitor\.env`;改后需 `docker compose up -d --force-recreate`,改代码需先 `docker compose build`
- 必须保持 `NEWAPI_ACCESS_TOKEN` + `NEWAPI_USER_ID` 模式(见 §2)
- 自动启停/优先级控制的渠道白名单由 `CONTROLLED_CHANNEL_LABELS` 配置(空 = 所有 `QUOTA_KEY_LABELS` 均可控),不再硬编码
- 新增渠道错误率告警:每 3 分钟检查 NewAPI 错误日志(type=5),近 10 分钟单渠道错误 ≥10 次即推送企业微信,每渠道 1 小时冷却(`CHANNEL_ERROR_ALERT_*` 可调)——§5 的上游额度耗尽类故障会被主动发现
- GitLab 提交统计已通过 `GITLAB_COMMIT_STATS_ENABLED=false` 关闭(上游地址返回非 JSON);修复地址后改回 true 即可
- "额度查询失败:API Key 无效"是 monitor 自身上游账号问题,与 new-api 无关
