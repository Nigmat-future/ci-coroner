# PRD：ci-coroner 产品化（方案 A）

**状态：** 已确认主轴  
**日期：** 2026-07-11  
**产品名：** ci-coroner  
**主轴：** Org 级 GitHub App + 失败记忆 + 托管分析  
**仓库：** https://github.com/Nigmat-future/ci-coroner

---

## 1. 一句话

装一次到 GitHub org/repo 后，**每次 CI 失败**自动到场：发带证据的验尸报告，并记住你们仓库的常见死因——越用越懂，减少 time-to-green。

## 2. 为什么做（问题）

- 工程师在 PR 红灯上反复翻 log，时间被碎片化吃掉。
- 纯「AI 总结 log」已有竞品/教程，**没有记忆、没有组织分发、没有反馈闭环** → 用一次就卸。
- 团队真正天天痛的是：**同一类失败反复出现**，新人/跨模块同学每次从零看 log。

## 3. 目标用户（ICP）

**默认楔子（已锁定策略 A 下的推荐 ICP）：**  
10–50 人创业公司 / 小团队的 **GitHub + GitHub Actions** 工程组。

| 角色 | 诉求 |
|------|------|
| IC 开发 | 红灯 30 秒内知道「最可能坏在哪 + 证据」 |
| Tech lead | org 一键装、少维护 YAML、少误报 |
| 平台/DevEx（若有） | 成本可控、权限最小、log 出境可解释 |

**暂不主攻：** 纯个人玩具用户（可当获客漏斗）、中大厂采购 ent（SSO/VPC 后置）、非 GitHub CI。

**假设：** 私有仓团队比为 OSS 个人更愿为「省工程师时间 + 少打断」付费。若首批种子全是 OSS maintainer，定价叙事改为「赞助/Pro 加速」但不改技术主轴。

## 4. 价值主张

| 相对「自己看 log」 | 相对「随便一个 AI Action」 |
|--------------------|----------------------------|
| 自动到场，不用复制粘贴 | **证据 quote 必须在 log 里** |
| 结构化 next steps | **Org 安装，不是每仓抄 YAML** |
| 同签名失败可聚合 | **历史记忆 + 有用/没用反馈** |
| — | **托管推理，团队不用管 key** |

## 5. 成功指标

### 5.1 北极星

**Weekly Active Orgs（WAO）：** 过去 7 天内，至少产生过 1 次成功验尸（报告已发布）的 GitHub org 数。

### 5.2 产品健康（上线后追踪）

| 指标 | 目标（首 90 天方向性） |
|------|------------------------|
| Install → 首次验尸 | ≤ 10 分钟（装完后触发一次失败或 demo workflow） |
| 14 日留存 org | ≥ 40%（装了且第 2 周仍有失败被处理） |
| 反馈「有用」率 | ≥ 50%（有反馈样本时） |
| 误报/幻觉投诉导致卸载 | 记录原因；季度主题优化 |
| 付费转化（私有仓） | 有定价后 90 天内出现首批付费 |

### 5.3 非目标指标

- GitHub stars 单独不作为成功标准  
- 单次回答「是否 100% 根因正确」不做 SLA  

## 6. 用户旅程

1. Lead 在 Marketplace / 官网点 **Install GitHub App** → 选 org + repos。  
2. 可选：打开「托管分析」（默认开）或 BYOK。  
3. 成员开 PR → CI 失败。  
4. coroner 自动评论：摘要 / 假设+证据 / next steps /「有用|误判」按钮。  
5. 若签名命中历史：额外显示「本周第 N 次，上次结论…」。  
6. Lead 在简易仪表盘看：本周 Top 失败签名、有用率、用量。  
7. 超免费额度 → 升级 Team。

## 7. 范围

### 7.1 P0（产品最小日活闭环）— 必须有

- [ ] **GitHub App**（`check_suite` / `workflow_run` 失败 webhook）  
- [ ] 拉失败 job logs + 关联 PR + 发/更新评论（幂等 marker）  
- [ ] 复用现有 core：redact → compress → analyze → evidence filter → render  
- [ ] **托管 LLM**（服务端 key；用户侧最小权限 token）  
- [ ] **Org/Repo 安装状态** 存储  
- [ ] **Failure signature** 计算与写入（见 §9）  
- [ ] **历史命中**：评论中展示「相似失败次数 / 上次摘要」  
- [ ] **反馈**：有用 / 误判（写回 DB）  
- [ ] 基础配额与软限制（防刷爆）  
- [ ] 隐私说明：log 出境、保留时长、删除入口  

### 7.2 P1（让人愿意付钱留下）

- [ ] 简易 Web：本周 Top signatures、有用率、用量  
- [ ] OSS 公开仓免费 / 私有仓付费（Stripe）  
- [ ] 签名聚类质量改进（模板化错误行）  
- [ ] 通知策略：仅 PR 评论 vs 也可 check run annotation  
- [ ] 自助「重跑验尸」按钮（issue comment command 或 check re-run）  

### 7.3 P2（明确后置）

- [ ] Flaky 标签与统计（作为 signature 属性，不单独立项产品）  
- [ ] 高置信 draft fix PR  
- [ ] 多 CI（GitLab 等）  
- [ ] SSO / 专有云  
- [ ] IDE 插件  

### 7.4 非目标（本阶段禁止）

- 自动 merge  
- 对标 Datadog 的全量 CI 可观测平台  
- 无证据约束的「更长更文艺」总结  
- 企业复杂 RBAC（先 org 安装者 = admin）  

## 8. 定价楔子（草案，可测）

| 档位 | 谁 | 权益 |
|------|-----|------|
| Free | 公开 repo | 有限次数/月；记忆保留短 |
| Team | 私有 repo 小团队 | 更高配额、记忆更长、基础 dashboard |
| BYOK 折扣 | 自带 key | 降托管加价、仍收座/仓费 |

最终数字用种子用户访谈后定；PRD 只锁定 **「公开免费 / 私有付费」** 方向。

## 9. Failure signature（记忆核心）

**目的：** 把「又一次红了」变成「又是那个问题」。

**输入：** workflow 名、job 名、失败 step、压缩后高信号 log 行、测试名（若可解析）、错误类正则命中。

**输出：** 稳定 `signature_hash`（规范化后哈希）。

**存储（每条失败事件）：**

- org, repo, signature_hash  
- run_id, pr_number, sha, created_at  
- report summary, status, hypothesis titles  
- feedback: useful | wrong | null  

**评论增强文案示例：**

> 与本仓库签名 `test:auth.timeout` 相似：近 7 天 **5** 次。  
> 上次（#412）：「Redis 健康检查超时」· 有用 3 / 误判 0。

## 10. 系统架构（产品态）

```
GitHub webhooks
      │
      ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  API 服务    │────▶│  Queue/Worker │────▶│  core 管线   │
│  App auth   │     │  拉取 logs    │     │  + signature │
└─────────────┘     └──────────────┘     └──────┬──────┘
      │                                         │
      │         ┌──────────────┐                │
      └────────▶│  Postgres    │◀───────────────┘
                │ installs,    │
                │ events,      │
                │ signatures,  │
                │ feedback     │
                └──────────────┘
                        │
                        ▼
                GitHub PR comment
                (+ 可选 Web dashboard)
```

**与当前仓库关系：**

- `packages/core`：继续作为分析内核（库），尽量不绑 Actions 运行时。  
- `packages/action`：降级为「无后端时的开源旁路 / 兼容路径」，**主路径改为 App + Worker**。  
- 新增（后续实现计划）：`apps/api`、`apps/worker`、`apps/web`（可极简）。

## 11. 安全与合规（P0 必答）

- 最小权限：`contents:read`、`pull-requests:write`、`actions:read`、`checks:read`（按实现再收紧）。  
- 入库前 **redact**；原始 log 保留期默认短（如 7–30 天可配）。  
- 租户隔离：按 `installation_id` / org。  
- 不在 prompt 中注入未消毒的「全仓任意文件」；diff 截断。  
- 供应链：App 后端独立；开源 Action 与托管服务版本说明清晰。  
- 用户可卸载 App + 请求删除数据。

## 12. 90 天里程碑

| 阶段 | 时间 | 交付 | 退出标准 |
|------|------|------|----------|
| M1 App MVP | D0–30 | GitHub App + 托管分析 + 证据评论 + 安装态 DB | ≥1 外部 org 真实失败产出评论 |
| M2 Memory | D30–60 | signature + 历史命中文案 + 反馈按钮 | ≥1 org 出现「第 N 次」命中 |
| M3 Habit & $ | D60–90 | Top 失败页 + 配额 + 付费草案上线 | 有用率可统计；付费链路可测 |

## 13. 风险

| 风险 | 缓解 |
|------|------|
| 与「免费 AI Action」同质 | 记忆 + org 分发 + 有用率公开展示 |
| LLM 成本爆炸 | 强压缩、失败才调用、配额、缓存同 signature 短窗 |
| 幻觉导致卸载 | 证据硬过滤；误判反馈；低置信不装腔 |
| GitHub API 限流 | 队列、指数退避、只拉失败 job |
| 一人周末带宽 | 严格 P0；dashboard 极简；不做 C（自动修） |

## 14. 开放决策（已定 / 默认）

| 决策 | 结论 |
|------|------|
| 产品主轴 | **A：GitHub App + 记忆 + 托管** |
| 第一 ICP | **10–50 人 GH+GHA 团队**（默认） |
| 开源策略 | core + 可选 Action 开源；托管 API/计费闭源或 BSL 另议 |
| 自动开 fix PR | P2，不进 90 天承诺 |

## 15. 下一步工程

1. 写 **产品架构 / 实现计划**：App webhook → worker → core → comment → DB。  
2. 选栈建议（可改）：TypeScript 贯穿；Postgres；队列先用 DB polling 或 Redis；部署 Fly/Render/CF Workers+Queue 其一。  
3. 保留现有 19 测 core 为内核，避免重写分析逻辑。  
4. README 增加「Product direction」指向本 PRD，避免贡献者只按 Action 玩具理解。

---

**确认句：** 方案 A 已写入 PRD；当前代码仍是 Action 内核，**尚未实现 App/记忆/计费**。实现从 M1 起另开 plan。
