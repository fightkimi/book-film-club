# 同频数据源与开源复用核查

核查日期：2026-11-02。结论依据为实际代码、GitHub API 仓库状态、官方接口文档和选取的实现文件。没有对第三方整库作安全审计，不以星数、最近更新时间或 SECURITY.md 文件存在作为安全证明。

## 当前实现与选择

原有代码使用 Open Library Search / Books / Covers 获取书籍资料与封面，电影使用 TMDB 的 search/movie、movie/{id}、credits 与图片 CDN。主题卡片背景是另外维护的人工电影海报，不是自动刮削出的书影库条目。

本次增加微信读书官方 Agent Gateway 的书籍搜索、详情适配；已配置时默认优先选它处理中文书籍。Google Books 是可选的版本与 ISBN 补充。所有入库仍需用户核对版本、图片、来源；缺少字段不可确认发布，不凭 AI 补造。中文电影仍以 TMDB zh-CN 为主，补充 CN/TW/HK 译名和原名，书影库支持这些别名检索。豆瓣以个人导出文件导入，不采集登录 Cookie 或绕过访问限制。

## 仓库证据与复用边界

| 项目 | GitHub 最近 push（UTC） | 许可证核查 | 采用方式与限制 |
|---|---|---|---|
| [Tencent/WeChatReading](https://github.com/Tencent/WeChatReading) | 2026-10-10 | LICENSE 原文 Apache-2.0；GitHub 元数据为 NOASSERTION，不能只看自动分类 | 依据官方 Skill 1.0.5 实现两个只读元数据接口。版本升级提示会停止请求，不自动执行远端升级指令。未复制整套 Skill |
| [booklore-app/booklore](https://github.com/booklore-app/booklore) | 2026-10-30 | AGPL-3.0 | 参考来源分层和确认流程。实际 SECURITY.md 含未填完的模板描述，不能当作完善安全流程的证据；未移植后端 |
| [kovidgoyal/calibre](https://github.com/kovidgoyal/calibre) | 2026-11-01 | GPL-3.0 | 阅读 Google 元数据 source 实现，参考候选、版本和封面分离；按官方 Books API 自行实现窄适配器，不复制 GPL 代码 |
| [jxxghp/MoviePilot](https://github.com/jxxghp/MoviePilot) | 2026-11-01 | GPL-3.0 | 检查 themoviedb 模块及 cache.py 路径，借鉴 API 层和缓存层分开；不引入插件、下载或媒体服务管理 |
| [FuzzyGrim/Yamtrack](https://github.com/FuzzyGrim/Yamtrack) | 2026-11-01 | AGPL-3.0 | 阅读 src/integrations/imports/trakt.py，参考公开账号、导出文件、分页和重复导入分离；本项目不移植 Django/Celery 或 OAuth 实现 |
| [internetarchive/openlibrary](https://github.com/internetarchive/openlibrary) | 2026-11-01 | AGPL-3.0 | 调用官方公开 API，不部署或复制服务端 |
| [cosformula/douban-sync-skill](https://github.com/cosformula/douban-sync-skill) | 2026-02-15 | MIT | 只兼容其 CSV 字段。最近代码活动较少，不作为持续在线抓取依赖，不安装抓取脚本 |

以上仓库核查时均未归档。push 日期只证明代码活动，不等同稳定发布或已消除漏洞。数据服务授权与客户端代码许可证分别核对。

## 官方接口及约束

- [微信读书 Skill](https://github.com/Tencent/WeChatReading/blob/main/skills/SKILL.md)、[search](https://github.com/Tencent/WeChatReading/blob/main/skills/search.md)、[book](https://github.com/Tencent/WeChatReading/blob/main/skills/book.md)：Bearer Key 绑定个人身份；业务参数平铺，版本 1.0.5；搜索请求 scope=10，结果分组 scope=17 也属于电子书。只接公开元数据字段，不调书架、私人笔记和阅读进度。链接使用接口返回值，不拼接作品链接。
- [Open Library API](https://openlibrary.org/developers/api)：适用于按需的人类查找，不作为大规模商业数据库；建议缓存、声明 User-Agent 与联系方式；未识别请求默认每秒一次。本项目按至少 1.05 秒间隔访问，提供最多 128 条内存缓存，默认 5 分钟；不做批量采集。
- [Google Books](https://developers.google.com/books/docs/v1/using)：公开请求也要求应用身份，本项目使用服务端 API Key。缺少 key 时明确提示，不暗中切换抓取。
- [TMDB finding data](https://developer.themoviedb.org/docs/finding-data)：文本搜索考虑原名、译名和别名。当前中文输出、原名及中文地区别名结合；覆盖率仍需在配置令牌后实测。海报和人物等权利不因 API 可访问而自动转让。
- [Letterboxd API](https://letterboxd.com/api-beta/) 与 [文件格式](https://letterboxd.com/about/importing-data/)：官方 API 需要申请且当前对个人/LLM/推荐等用途有限制，本项目采用用户导出的 CSV，未调用非公开 API。
- [Trakt developer](https://developer.trakt.tv/)：旧 Apiary 文档已声明弃用。此次实现公开用户的 history / watchlist / ratings 分页 GET，并以维护中的 Yamtrack 源码交叉核对；Client ID 待配置。私人账号用 JSON 导出，不存取 OAuth token。
- [OMDb](https://www.omdbapi.com/)：支持 HTTPS 与 IMDb ID 查询，网站注明 CC BY-NC 4.0；只作为可选评分补充，明确来源与时间，不混算评分、不获取付费海报。商用前须另核对授权。

## 安全实现边界

- 固定服务端域名和 API 路径，不取用户传入的 URL 抓取；拒绝跳转，HTTPS，20 秒超时及 2 MB 响应上限。缓存 key 使用含凭证的输入摘要，不记录原始凭证；模型请求不进入公共元数据缓存。
- CSV/JSON 文本最多 100 KB、200 条。仅作数据解析，不执行字段，不解压 ZIP、不读取路径。导入链接按对应平台域名校验；评论当 React 纯文本显示，不渲染 HTML。
- 预览 token 绑定成员、30 分钟过期、确认后一次性消费，受现有版本号与事务保护。记录默认个人可见；小组导出排除新增个人档案与笔记，个人导出只含自己数据。
- 导入评分不会隐含证明看完。Trakt ratings 在线导入默认未标记状态；手工文件导入可明确选择状态。同步片单为单独勾选项；历史记录不完成新一期任务。
- 拉片视频只在浏览器本机播放，不上传；AI 只接明确填写的文字证据。分析引用必须是输入记录中的原文，否则拒绝；不声称自动识别镜头或观看完整影片。
- 没有新增 npm / pip 依赖。对本次边界编写契约与接口测试；这是本项目实现者的自查，不是第三方安全认证。

## 假设、反例与决定

“官方接口能覆盖所有中文书影”证据不足：微信读书覆盖其自身书城，Google Books / Open Library 的中文版本和封面可能缺失，TMDB 译名也可能不全。采用多源手动选择与版本确认，不承诺全覆盖。

“活跃开源项目可以直接整库接入”不成立：技术栈、许可证、登录凭证与插件执行边界均不同。选择可检查的窄适配和格式兼容；后续新增源须补来源文档、映射测试、错误处理和许可核查。

“导入历史能自动完成本期活动”与项目规则冲突：历史属于个人档案，周期任务仍独立登记。
