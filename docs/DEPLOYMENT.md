# 服务器部署与电影数据源

## 发布方式

应用继续监听 127.0.0.1，前方使用 Nginx HTTPS 代理。`deploy/tongpin.service` 将运行目录设为 `/opt/tongpin/current`，指向版本化目录 `/opt/tongpin/releases/<release>`。业务数据库独立位于 `/opt/tongpin/data/club.sqlite3`；不要上传本地演示数据库。

发布前用 `scripts/backup.py` 创建一致 SQLite 备份，同时备份旧程序、服务 unit 和原环境文件。先在备份副本及独立回环端口验证旧库兼容性，再切换 current 与服务配置。保留旧 release 和备份供回退，不执行破坏性重写。

运行环境文件 `/etc/tongpin/tongpin.env` 由 root 持有，权限 0600，systemd 读取并注入服务。示例（密钥保持空白，按需配置）：

```ini
CLUB_DB=/opt/tongpin/data/club.sqlite3
CLUB_PORT=8787
CLUB_ORIGIN=https://SERVER_ADDRESS
CLUB_SECURE_COOKIE=1
CLUB_TRUST_PROXY=1
TMDB_API_HOST=api.tmdb.org
```

不要把公网请求直接转发为可信 X-Real-IP。Nginx 必须覆盖该字段，应用仅在显式启用且连接来自回环时读取它，以免所有登录尝试被错误地合并为同一个代理 IP。

## 没有域名时的 HTTPS

Let's Encrypt 已支持 IP 证书；本次检查的官方方案使用 Certbot 5.4 以上、webroot、`--ip-address` 与 `--preferred-profile shortlived`。IP 证书有效期短，须启用自动续期和成功续期后 reload Nginx 的 deploy hook。参考：[官方说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)。

云安全组与主机防火墙都须允许公网 TCP 80、443。若证书机构报告 HTTP-01 connect timeout，先检查端口与挑战路径；不要循环重复申请生产证书，不使用自签名证书替代可信 HTTPS。

`deploy/nginx.conf.template` 将 SERVER_ADDRESS 替换为部署地址后使用。证书取得前仅启用独立 HTTP 挑战路径，不启用引用不存在证书的 HTTPS server。证书成功后启用 `deploy/tongpin-cert-renew.timer`，每天两次检查续期；用 Certbot dry-run 验证挑战路径和续期。

## TMDB 和评分配置

TMDB 非商业开发者 API 免费，但需按其要求署名；商业用途另行申请授权。[费用与署名说明](https://developer.themoviedb.org/docs/faq)。

登录自己的 [TMDB API 设置](https://www.themoviedb.org/settings/api)，完成开发者申请。申请主体、联系方式和条款由账号持有人确认。取 **API Read Access Token**，不是把账号密码填到应用。建议用途说明：

> echo is a non-commercial book and film discussion club. We use TMDB to search Chinese and international films and display film metadata, posters, credits, and ratings with attribution. We do not provide film downloads or streaming.

部署完成后在服务器执行（输入不会回显，不进入 shell 历史）：

```sh
sudo /opt/tongpin/venv/bin/python /opt/tongpin/current/scripts/configure_sources.py tmdb
sudo /opt/tongpin/venv/bin/python /opt/tongpin/current/scripts/check_movie_sources.py
```

配置脚本先验证凭据，再原子写入仅 root 可读的环境文件并重启服务；失败不覆盖已有配置。检查脚本验证“流浪地球”中文搜索、导演、简介、海报图片类型及评分，不新增作品、不输出密钥。

如果需要 OMDb 补充的 IMDb / Rotten Tomatoes / Metacritic 评分，另行取得符合用途的 OMDb Key 后运行 `configure_sources.py omdb`。TMDB 自身评分不依赖 OMDb；跨站评分分别展示，不混成总分。

当前代码只允许 `api.themoviedb.org` 和 `api.tmdb.org`，不允许任意镜像转发密钥。2026-11-02 目标服务器实测前者连接超时，后者在未认证请求下正常返回 401；后者根路径跳转到 TMDB 自己的 API 文档。未认证连通性不等于已完成中文资料验收，仍需要实际 Token。

## DeepSeek 模型配置

在运行这桌还没散 Python 后端的服务器上执行 `sudoedit /etc/tongpin/tongpin.env`。找到或添加以下三项，在 `AI_API_KEY=` 后粘贴自己的 DeepSeek 官方 Key。保留文件中已有的其他配置，文件由 root 持有，权限为 0600。[DeepSeek 密钥管理](https://platform.deepseek.com/api_keys) · [官方接口与模型名称](https://api-docs.deepseek.com/zh-cn/) · [JSON 输出](https://api-docs.deepseek.com/zh-cn/guides/json_mode/)

```ini
AI_CHAT_URL=https://api.deepseek.com/chat/completions
AI_MODEL=deepseek-flash
AI_API_KEY=
```

保存后在服务器执行以下命令，让服务读取配置。

```sh
sudo systemctl restart tongpin
sudo systemctl is-active tongpin
```

服务返回 `active` 后，重新进入小程序「我的 → 书影工具 → 资料来源」。AI 显示「已可用」表示后端读到了三个配置项。再到「书影」打开一部作品，进入「读前导赏」或「观前导赏」，点「生成这部作品的导赏」。出现「AI 导赏草稿」才说明密钥、模型和网络都已打通，这一步会使用 DeepSeek 账户额度。

## 操作边界

部署不自动复制本机的其他服务密钥。迁移某一枚已有密钥需要明确指定凭据及目标服务器的授权。不要将 `.env`、数据库、SSH 凭据或证书私钥提交 Git。定期备份应使用应用的 SQLite backup 脚本，而非只复制正在写入的数据库主文件。

## 小程序封面与响应压缩

将 `deploy/tmdb-cache.http.conf` 安装到 `/etc/nginx/conf.d/uneco-cover-cache.conf`，将 `deploy/media.server.conf` 安装到 `/etc/nginx/snippets/uneco-media.conf`。给 nginx 工作进程创建可写的 `/var/cache/nginx/uneco-covers` 目录，在小程序域名的 HTTPS server 块中 include 该 snippet，检查配置后 reload。

小程序通过同域 `/media/tmdb/w342/<海报文件名>.jpg` 或 `w500` 访问列表图和详情图。此入口只允许固定的 TMDB 图片源站和文件名格式，不接收任意远程 URL。首次回源后复用磁盘缓存，重复请求可检查 `X-Cover-Cache`。JSON 启用传输压缩，账号和会话接口仍保持原有的缓存策略。


## 1.6.0 个人书影与写作规则

隔离服务使用 `/opt/tongpin/bookstores-venv-160`，依赖锁定在 `requirements.txt`；主服务虚拟环境不变。部署前备份旧代码、systemd 单元、体验库和已有个人凭证主密钥，先对库副本重复执行初始化并比对旧表内容。`ai.py`、`ai_writing.py` 在主服务和书店服务同时更新，以覆盖所有 AI 入口。书店路由 `proxy_read_timeout 110s`，匹配个人笔记模型请求 90 秒上限和小程序 120 秒请求上限。

个人凭证主密钥默认在书店状态目录中，首次绑定时原子生成并限制为 0600。不可用新密钥替代已有密钥；备份需要同时包含数据库与密钥，但不得输出、提交或传回客户端。


1.6.1 将 8 张已有公开图片放在 `/opt/tongpin/mini-assets/v161/`，由书店 Nginx 片段中的 `/mini-assets/v161/` 提供静态访问。前端 `static-assets.js` 统一引用，`project.config.json` 从上传包排除对应本地图片；源文件仍保留。新图片必须先上传并校验 HTTPS 内容与原文件哈希，再上传小程序。登录图、首页动画保留本地。备份和回滚应保留版本化资源目录，避免旧体验包资源失效。


## 1.6.2 新主题生成

新接口 `/api/bookstores/activity-theme-ai` 部署在已授权的独立体验服务，读取主服务提供的当前成员资料快照后只选取公开书目和主题名。生成阶段不写主库；用户确认采用后由客户端调用原有 `theme.save`。本轮无需修改或重启主服务。服务更新包括 `bookstores.py`、`ai.py`、`ai_writing.py` 和 `theme_ideation.py`，并保留 MIT 方法来源声明。

## 1.6.3 图片与动画体积

微信工具按包内图片、音频的累计大小检查 200 KB。首页桌边动画保留本地，压缩到 137,783 字节，60 帧、6 秒和单次播放行为不变。品牌图、分享头像、动画静帧也保留本地；包内媒体合计 194,314 字节。

登录海报、六张主题海报和旧抽签页动画使用已有静态路径下的 `/mini-assets/v161/v163/`，对应服务器目录 `/opt/tongpin/mini-assets/v161/v163/`。源图仍在仓库，由 `packOptions.ignore` 排除上传。上传小程序前先核对全部 8 个 HTTPS 资源的哈希；保持旧目录，不覆盖已有 URL 内容。本次无需改 Nginx、重启服务或更新数据库。

## 1.7.0 个人感想、我参加的与微信分享

独立体验服务新增 GET `/api/bookstores/gather-mine`。配置 `BOOKSTORES_IDENTITY_DB=/opt/tongpin/data/club.sqlite3`，仅以 SQLite `mode=ro` 查询当前已登录成员在现有 AppID 下的微信绑定，计算与原报名完全一致的服务端身份摘要。客户端不能提供 person 或 reader；摘要、OpenID 和其他成员报名不返回。圈友邀约再次检查成员权限，已删除活动不出现。主服务和主数据库均不写入、不重启；没有新增表或数据迁移。

个人列表只增加本人感想的 120 字摘句和长文标记，原文仍通过本人详情读取。短感想扩展成长评更新同一记录，不改变评分或活动完成规则。客户端分享目标采用页面及参数白名单；私密页面仅能分享品牌入口，圈内卡片不带正文、地点或名单。好友/群聊卡片由原生 Canvas 生成临时图片，未增加包内媒体体积。

部署前备份体验库、改动模块与体验服务环境文件，补充上述只读路径后更新 bookstore_events.py、bookstores.py、personal_reading.py 并重启 bookstore-trial。未绑定微信的成员返回空书店报名列表，不借用其他成员身份。服务不可用时前端保留小组活动并给出明确重试入口。回滚恢复旧模块和环境文件即可。
