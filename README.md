# 同频 Book & Film Club

一个面向小组的读书、观影活动应用：主题抽取与历史 → 周期活动 → 作品提名与刮削 → 成员进度和评价 → 活动回顾与归档。

- [产品需求文档](docs/PRD.md)
- [设计与开源复用决策](docs/COMPONENTS.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)
- [验证记录](docs/VERIFICATION.md)

## 本地运行

需要 Node.js 22.12+ 和 Python 3.9+。

```sh
npm ci --ignore-scripts
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run build
npm start
```

打开 http://127.0.0.1:8787 。首次启动创建小组及管理员，无通用初始密码。所有数据保存在 `data/club.sqlite3`；该目录不会进入 Git。首次启动预置六个人工主题，不预置虚假评分、成员或活动。

开发时分别运行 `npm start`（后端）和 `npm run dev`（前端，默认 5173，代理 `/api` 至 8787）。不要把 Vite 开发服务暴露公网。

本地演示预览采用独立 `data/preview.sqlite3`，包含明确标为示例的成员和测试活动；不会污染默认数据库。演示访问资料仅保存在已忽略的 `data/`，不提交远程仓库。

## AI 预留接口

用户已选择稍后配置 AI。没有配置时，抽签、手工主题解构、作品管理、成员记录、评价和回顾仍然可用。点击 AI 功能会明确提示尚未配置。

通过启动进程的环境变量配置，不把密钥放进前端或提交 Git；应用不读取上级目录 `.env`：

- `AI_CHAT_URL`：兼容 Chat Completions 的 HTTPS 完整地址。
- `AI_API_KEY`：模型服务密钥。
- `AI_MODEL`：服务实际支持的模型 ID。

模型需要支持 `response_format: {"type":"json_object"}`。生成主题、解构和回顾均返回草稿，需确认后采用。请求只发送当前任务所需的主题或共享评价，不发送私人笔记或账号数据。未进行真实付费模型调用。

## 书影资料刮削

书籍：Open Library API + Covers API，无需密钥；ISBN 由 isbnlib 校验与归一化。名称检索优先返回作品级候选，选择时需核对作者和版本。上游资料可能缺少简介或图片，应用不会捏造。

电影：TMDB 搜索、电影详情、演职员、海报及背景图。启动服务前设置 `TMDB_TOKEN` 为 TMDB API Read Access Token；这是 Bearer 令牌，区别于旧版 v3 API key。中文元数据使用 `zh-CN`。注册说明：https://developer.themoviedb.org/docs/getting-started 。

流程：搜索 → 选择候选 → 查看详情 → 确认匹配并导入。无简介、作者／导演、图片或来源的条目只能作为待补全作品保存，不能发布到正式活动。手工修订会被保护，刷新时通过预览手工合并；已发布活动的作品快照保持不变。

数据源和封面均保留来源链接。Open Library 官方建议公共页面直接使用 Covers API 图片地址；图片可能因网络或上游变化失效，界面会提示图片不可用。当前不提供本地图片上传和任意 URL 的服务器抓取。

## 完成规则

管理员在活动草稿期设置：全部作品或任选一部，是否要求评价和讨论。发布后冻结主题、作品和规则。

- 个人收藏与周期任务独立，历史“已读”不会自动完成新活动。
- 任选一部且要求评价时，需要同一作品同时满足完成与评价。
- 请假和不参加不进入完成率分母。
- 截止时间为该日北京时间 23:59:59；已结束允许补交，保留时间。
- 归档后只读，并保存当时的成员完成统计。
- 管理员代登记留下操作者与目标成员，普通成员仅能写本人记录。

## 数据和安全边界

单小组、单实例 SQLite。JSON 业务状态使用 SQLite 事务和版本号冲突保护，账号和会话单独存表。密码使用 Argon2；会话 HttpOnly + SameSite=Strict；登录限频、同源写请求、服务端角色校验、响应安全头、静态文件目录限制。

默认仅绑定 127.0.0.1。需要共享部署时配置受信任的 HTTPS 反向代理，将 `CLUB_ORIGIN` 设为实际 HTTPS 站点，`CLUB_SECURE_COOKIE=1`。当前不是多租户 SaaS，不支持多实例部署、注册邮件或密码找回；上线前需要确定备份、管理员恢复及运维方案。

管理员业务 JSON 导出不包含登录凭据，但会包含小组成员、评价、私人笔记和审计资料，作为私有备份保存。CSV 导出针对周期完成表。

### 备份与恢复

使用 SQLite 一致性备份，不直接复制正在写入的 WAL 数据库：

```sh
.venv/bin/python -B scripts/backup.py data/club.sqlite3 /absolute/private/path/club-backup.sqlite3
```

恢复时先停止服务，将确认过的备份放到新的私有路径，再通过 `CLUB_DB=/absolute/private/path/club-backup.sqlite3 npm start` 启动验证。保留原库，不覆盖；数据库备份含密码哈希和会话，应按私有凭据保管。

## 检查

```sh
npm test
npm run build
npm audit
```

测试使用临时数据库和本机随机端口。脚本需要本机端口权限；不访问生产、付费模型或真实成员账号。浏览器验证范围与真实数据源验证限制见 `docs/VERIFICATION.md`。

## 项目结构

- `domain.py`：纯业务规则、权限边界、完成状态、抽取、快照。
- `server.py`：HTTP API、账号会话、SQLite 事务、导出。
- `metadata.py`：Open Library / TMDB 刮削适配。
- `ai.py`：可配置的 AI 草稿接口与响应校验。
- `src/`：React 页面、Radix 表单、主题场景及 Cult UI 字幕。
- `tests/`：业务规则、HTTP 边界、服务契约测试。

## 开源复用

直接使用 Radix Themes、Lucide、Motion、isbnlib、Argon2-cffi；本地收录 spin-wheel 5.0.2 官方浏览器发行文件和 MIT 许可；按 MIT 适配 Cult UI Text Animate。BookLore、MoviePilot、Literary Circle 和 Spin the Wheel 仅参考工作流，不宣称已集成其后端。详见设计与复用决策。
