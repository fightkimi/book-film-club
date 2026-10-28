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
