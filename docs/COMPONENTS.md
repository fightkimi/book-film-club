# UI 与开源复用决策

## 视觉来源

RogerEbert.com 首页、作品列表和 Perfect Days 详情页，2026-10-28 实际浏览器检查。桌面 1440×900，手机 390×844。捕获了固定页头、滚动折叠导航、全屏菜单、图文主视觉、横图评分卡、竖版海报网格、筛选下拉、详情正文和页脚。

源站主要参数：内容最大宽 1440px，桌面边距 32px，手机 24px；页头桌面 96px、手机 84px；主标题桌面 48px、手机 36px；段落 Georgia；标题 Freight Big Pro；导航 Montserrat；金色 #c0a574、悬停 #945b48、米白 #f8f6f1。

本项目使用本地托管 Montserrat；Freight Big Pro 未确认再分发许可，用 OFL 的 Libre Caslon Display 和中文宋体回退。使用本产品名称“同频”，不冒充 RogerEbert 品牌。基础布局依据源站，成员矩阵、表单和主题抽取属于新增业务模块。原站广告、订阅付款和外部社交链接不属于小组产品功能。

## 成熟组件

- Radix Themes：Dialog、Select、Checkbox、DropdownMenu、Tabs、Table、Badge、Button；统一负责可访问性和焦点行为。
- Lucide：普通操作图标；搜索、关闭、菜单和星形与参考站对应，图标差异列入设计验证。
- spin-wheel 5.0.2（本地收录官方浏览器发行文件）：书影联动的经典转盘；服务端先确定结果再调用 spinToItem。
- CSS：低频书架落书、放映倒计时；提供跳过动画，遵循 prefers-reduced-motion。

## Cult UI 评估

官方来源：https://www.cult-ui.com/docs 、https://github.com/nolly-studio/cult-ui 。组件为可复制源码的 MIT registry，不是完整运行时框架。本项目保持 Radix Themes 主组件体系，按组件独立适配。

| 组件 | 适用环节 | 决策 |
| --- | --- | --- |
| [Text Animate](https://www.cult-ui.com/docs/components/text-animate) | 书架及银幕揭晓主题 | 已直接复用其 fadeInUp 变体和字符编排，适配中文、无障碍和减少动态效果；源码 src/components/TextAnimate.jsx |
| [Choice Poll](https://www.cult-ui.com/docs/components/choice-poll) | 候选作品投票 | 已读取源码与受控状态 API，列为后续候选；当前简单投票复用 Radix Button，暂不引入 Tailwind/CVA 体系 |
| [Loading Carousel](https://www.cult-ui.com/docs/components/loading-carousel) | 批量刮削期间的等待 | 当前未采用；单次检索不需要轮播、Embla 和额外图片 |
| Halo / Shader 系列 | 高光按钮、背景 | 未采用；会改变用户指定的书刊视觉，且增加持续动画 |

Text Animate 来源下载于 2026-10-28；变更为按字素拆分、响应减少动态效果、单个可访问名称、移除默认 Tailwind 布局、只保留实际使用变体。没有将“参考”标为“整库集成”。

## 刮削复用

- [isbnlib](https://github.com/xlcnd/isbnlib)，3.10.14，LGPL-3.0：作为独立未修改依赖，直接用于 ISBN 校验和 ISBN-13 归一化；不复制其代码。
- [BookLore](https://github.com/booklore-app/booklore)，AGPL-3.0：参考搜索、对比、确认、保护手工修订的流程。本版为整条手工修订保护，逐字段锁和多源优先级尚未实现。
- [MoviePilot](https://github.com/jxxghp/MoviePilot)，GPL-3.0：参考电影元数据和图片来源的分层。不引入下载、订阅和媒体服务器管理。
- [tmdbv3api](https://github.com/AnthonyBloomer/tmdbv3api)，MIT：已评估；公开 PyPI 最新读取到的版本为 1.9.0（2023），API key 和客户端状态模式与当前 Bearer token 配置不同。当前保留薄 HTTP 适配器，不为两个请求增加额外状态与依赖。
- Open Library / TMDB：本应用自己的窄适配器使用官方 API；候选由成员确认，来源 ID 和抓取时间持久化。源服务条款与开源客户端许可证分别遵守。

## 当前生效的视觉基准

用户后续明确改为 Criterion 按钮、过滤器和收藏区。实读样式：直角 0px、13px UI 字、0.5～0.6px 字距、#252525 / #ffffff / #f6f6f6、桌面 56px 和手机 44px 控件。当前由统一 `criterion-button`、`criterion-select` 和 `WorkFilters` 实现；保留 Radix 的可访问性行为。用户先前禁止金色，因此应用筛选操作使用黑白主题，不复制原站局部金色。

收藏区以用户提供的 Criterion 网格截图和官网为依据，支持完整封面、轻量信息、操作显隐、列表切换及排序。手机端操作区始终可见。

产品标志现为原创细线频率 SVG，与矢量化手写字标并排。字标来自本次 ImageGen 原创结果，通过临时 VTracer 工具整理为 10 条路径，不包含内嵌位图；VTracer 未加入应用运行依赖。旧版纸页按钮、书签纹理、胶片边框、人物和放映机图标已经撤下，不属于交付设计。

## 书影陪伴功能复用（2026-11-02）

- 界面复用现有 Radix Themes Dialog / Select / Checkbox / Button、Lucide 图标及 Criterion 样式，不新增依赖。
- Movie Concierge：借鉴截图中的“心情 + 时长”选片思路；具体 Skill 仓库未确认，未安装或复制。实现为已入库候选的服务端筛选及受约束 AI 推荐。
- Film Analysis：参考 [AlterLab Film Analysis](https://github.com/AlterLab-IEU/AlterLab-FC-Skills/blob/main/skills/cdm/alterlab-cdm-film-analysis/SKILL.md) 的观察、证据与解释分离方法，自行编写导赏提示词；未复制其 Skill 文本或代码。
- Movie Review Critic / Cinematic Language：借鉴感想整理、证据追问与通俗术语的能力方向，未宣称安装截图中的具体项目。
- TMDB / Open Library：继续沿用已有元数据与封面适配，不增加同类封装。
- [Douban Sync](https://github.com/cosformula/douban-sync-skill)（MIT）及 [Letterboxd 文件导入导出](https://letterboxd.com/api-beta/) 已评估，留待后续导入阶段；本期没有增加同步任务、登录采集或额外账号凭证。

## 完整书影工具与数据源

新增原生组合组件 `Toolkit`、`ImportLibrary`、`StudyNotebook`、`FilmSources`，复用现有 Radix Tabs/Dialog/Select/Button 和 Lucide；本地视频使用 HTML video，不上传、不引入解码服务。新增标准库 CSV/JSON 解析器和官方 HTTP 适配器，无新 npm/pip 运行依赖。

微信读书依据 Tencent/WeChatReading 官方 Skill 1.0.5 的接口契约自行适配；LICENSE 原文为 Apache-2.0。其他能力依照维护中的 calibre / Yamtrack / BookLore / MoviePilot 等的架构和官方服务文档实现，没有复制 GPL/AGPL 代码，也没有安装截图中未核实的同名 Skill。详细来源、最近 push 日期与保留限制见 [核查报告](research/2026-11-02-media-sources.md)。

## 感想、参与记录与分享卡片（2026-11-06）

本轮先核对 GitHub 仓库元数据、许可证正文、相关源码和问题记录。下面的最近 push 时间只证明维护活动，不代表所有问题已经修复。

| 项目 | 维护与许可 | 实现、依赖与相关问题 | 本项目决策 |
| --- | --- | --- | --- |
| [NeoDB](https://github.com/neodb-social/neodb) | 2026-11-05 push；[AGPL-3.0](https://github.com/neodb-social/neodb/blob/main/LICENSE) | 作品、个人标记、长评和可见范围分离；当前 Python 3.14、Django 5.2、PostgreSQL/Redis 等依赖。[#1866](https://github.com/neodb-social/neodb/issues/1866) 指出笔记附件在网页与 API 表现不一致，截至核对仍 open。 | 借鉴按作品关联个人内容及明确可见范围。短感想和长评共用已有 reflection，不复制源码、不引入联邦服务或富文本附件。 |
| [Gathio](https://github.com/lowercasename/gathio) | 2026-11-03 push；[GPL-3.0](https://github.com/lowercasename/gathio/blob/main/LICENSE)，package 声明 GPL-3.0-or-later | Node 22、Express、Handlebars、MongoDB；[活动列表模板](https://github.com/lowercasename/gathio/blob/main/views/partials/eventList.handlebars)保留日期、地点和来源。开放问题包括 [#206 SQLite 支持](https://github.com/lowercasename/gathio/issues/206)、[#233 Maybe 报名状态](https://github.com/lowercasename/gathio/issues/233)、[#249 小改动邮件过多](https://github.com/lowercasename/gathio/issues/249)。 | 借鉴活动摘要与报名状态分离，保留两种活动的原始来源和权限。只合并本人参与记录的展示，不搬入 MongoDB、邮件或通知系统。 |
| [BookWyrm](https://github.com/bookwyrm-social/bookwyrm) | 2026-11-01 push；当前 [ACSL 1.4](https://github.com/bookwyrm-social/bookwyrm/blob/main/LICENSE.md)，有使用主体限制 | Django/PostgreSQL/Celery/Redis；支持 Review、Comment、Quote。[#4273](https://github.com/bookwyrm-social/bookwyrm/issues/4273) 报告错误合并作品导致评价错位，核对时未关闭。 | 不作为代码复用依赖，不将其误标为宽松许可证项目。保留原作品 ID，不因标题相近自动合并感想。 |

分享使用[微信官方 Page 类型契约](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.page.d.ts)中的 onShareAppMessage 与异步图片返回能力，支持好友和群聊；本轮不启用朋友圈单页模式。参考[微信官方 Canvas 2D 示例](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/packageComponent/pages/canvas/canvas-2d/canvas-2d.js)的原生图片绘制 API，按需生成 600×480 构图、1200×960 导出图片，作品、活动、书店、公开话题及品牌入口分别设计。原画布布局由本项目编写，无新增 npm/pip 依赖、第三方代码复制或打包图片。

分享卡只读取显式允许的公开字段；圈内话题和邀约使用泛化文案，保留目标链接并由服务端重新校验权限。使用固定模板图片，禁止自动页面截图带出私人文字。私人的长短感想仍先经「选一段分享」发布，确认公开范围后才能转发对应话题。

## 电影浏览分类（2026-11-06）

TMDB 的多标签题材不等于本产品的主要浏览类别。保留原始标签，`movie_categories.json` 单独存放按稳定来源 ID 审阅的主要类别。已按分类输出检查现有及新增片目，收录 133 条固定分类记录，包括《阿甘正传》归剧情、《变相怪杰》归喜剧/奇幻、《天堂电影院》《小偷家族》归剧情等，避免次要爱情、犯罪或时代背景影响主要分类。其余采用最多两个主要类别的保守规则；这是一种选片口径，不宣称是电影唯一的官方类型。

音乐与歌舞依据 [BFI 音乐电影季](https://www.bfi.org.uk/news/bfi-musicals-full-programme-unveiled)、[BFI 歌舞片选集](https://www.bfi.org.uk/lists/best-musical-every-year)及[发行方《马戏之王》页面](https://family.20thcenturystudios.com/movies/the-greatest-showman)核对。《爱乐之城》《马戏之王》《悲惨世界》均纳入音乐与歌舞；以音乐人为主题的纪录片可同时出现在音乐与纪录片入口。更新来源资料不覆盖这些编辑分类。
