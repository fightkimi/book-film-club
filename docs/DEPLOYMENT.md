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

> Tongpin is a non-commercial book and film discussion club. We use TMDB to search Chinese and international films and display film metadata, posters, credits, and ratings with attribution. We do not provide film downloads or streaming.

部署完成后在服务器执行（输入不会回显，不进入 shell 历史）：

```sh
sudo /opt/tongpin/venv/bin/python /opt/tongpin/current/scripts/configure_sources.py tmdb
sudo /opt/tongpin/venv/bin/python /opt/tongpin/current/scripts/check_movie_sources.py
```

配置脚本先验证凭据，再原子写入仅 root 可读的环境文件并重启服务；失败不覆盖已有配置。检查脚本验证“流浪地球”中文搜索、导演、简介、海报图片类型及评分，不新增作品、不输出密钥。

如果需要 OMDb 补充的 IMDb / Rotten Tomatoes / Metacritic 评分，另行取得符合用途的 OMDb Key 后运行 `configure_sources.py omdb`。TMDB 自身评分不依赖 OMDb；跨站评分分别展示，不混成总分。

当前代码只允许 `api.themoviedb.org` 和 `api.tmdb.org`，不允许任意镜像转发密钥。2026-11-02 目标服务器实测前者连接超时，后者在未认证请求下正常返回 401；后者根路径跳转到 TMDB 自己的 API 文档。未认证连通性不等于已完成中文资料验收，仍需要实际 Token。

## 操作边界

部署不自动复制本机的其他服务密钥。迁移某一枚已有密钥需要明确指定凭据及目标服务器的授权。不要将 `.env`、数据库、SSH 凭据或证书私钥提交 Git。定期备份应使用应用的 SQLite backup 脚本，而非只复制正在写入的数据库主文件。
