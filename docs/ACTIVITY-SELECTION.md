# 活动选书选片 · 1.8.2

活动类型与作品选择必须联动：观影只显示电影，读书只显示书籍，书影联动在首屏同时呈现两类。切换类型保留兼容的已选作品，移除不兼容项并就近提示。搜索和分页保留未显示的已选项；搜索支持原名、译名和作者/导演。

扩展电影目录和原有小组资料合并，按 TMDB 来源 ID 去重。选中扩展电影后，在“下一步”、根据所选作品生成主题、保存筹备活动前，用原有 `metadata/detail → metadata.import` 流程取得小组作品 ID。只接受服务端预览 token；不把客户端传来的资料冒充刮削结果。失败保留表单，已经成功导入的部分可复用，丢失回执或并发导入不会重复写入。没有自动发布活动。

## AI 先选一批

发起人选好主题后可点击“AI 帮我选片／选书／先选一批”。返回最多六个候选及简短理由、不适合之处；“全部选入”与手动勾选都只更新表单。原有手动选择保留。“换一批”排除已选和上一批候选。更换类型或主题后清除旧推荐，避免上下文混用。

新接口 `/api/bookstores/activity-picks-ai` 只在独立体验服务部署。读取已授权的小组公共书影资料及扩展电影目录，不读取个人笔记、私人书评、观看历史或群聊。类型和主题由服务器校验，模型只能返回候选中的 ID，重复、虚构 ID 和超过六项的输出被拒绝。复用 `generation_slot` 限频和 `ai.generate('recommend')`，一次请求最长等待模型 50 秒，无额外模型或向量库依赖。

全库先按活动类型过滤，再用主题词关联与候选轮换组成最多 48 项的有界上下文；书影联动给两类各留候选位置。这是轻量召回，不能保证找到全库中所有语义相关作品；手动全库搜索始终保留。AI 结果不是评分榜，也不保证每次都会有六项。

## Skill 来源与适配

应用内策划方法位于 `activity_picks.INSTRUCTION`，只作用于活动推荐请求，随后复用现有 `human-writing` 规则。不安装外部代理、脚本或新的全局 Skill。

2026-11-06 核查了以下来源：

| 来源 | 维护、许可证与取舍 |
| --- | --- |
| [NousResearch / Creative Ideation 2.1.0](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/creative-ideation) | MIT；仓库当天仍有提交，Skill 文件最近提交为 `d799284b1554f7b390ed27808e0b9af5eb435fef`（2026-06-19）。采用选择阶段的反向检查与具体性要求，已有 MIT 声明保留。无需额外工具依赖。 |
| [YiShu5 / content-curation](https://github.com/YiShu5/content-curation) | MIT，最近推送 2026-08-09。主要面向视频转录、摘要和飞书同步，包含转录服务与发布链路，与小组选片不匹配，未引入。 |
| [Skylar's Reading Compass](https://github.com/SkylarWJY/skylar-reading-compass) | MIT，最近推送 2026-06-10。围绕固定创业书库分析商业决策，领域和受众不符，未引入。 |

采用的参考是 [Premortem and Inversion](https://github.com/NousResearch/hermes-agent/blob/d799284b1554f7b390ed27808e0b9af5eb435fef/optional-skills/creative/creative-ideation/references/methods/premortem-and-inversion.md) 与 [Anti-Slop](https://github.com/NousResearch/hermes-agent/blob/d799284b1554f7b390ed27808e0b9af5eb435fef/optional-skills/creative/creative-ideation/references/anti-slop.md)。不是照搬完整工作坊：应用内只检查具体主题关联、开放讨论空间、候选之间的视角差异、已知的时间/理解负担，并在推荐前反问为何可能不适合。无资料时不编片长、阅读时长、情节、引文或参与者偏好，不为了“新奇”硬选作品。

上游 [Issue #17115](https://github.com/NousResearch/hermes-agent/issues/17115) 提出候选容易收敛到常见模式的问题，核查时仍开放。这是上游用户报告，不是本应用的质量证据。这里用已选/上一批排除、部分候选轮换和主题适配规则减少重复；不复制该 Issue 提议的随机字符串和推理输出流程，也不承诺语义多样性已经完全解决。

## 验证

客户端覆盖三种活动类型、搜索与隐藏选项、扩展电影的可信导入、导入失败/丢失回执、AI 候选一键采用、手动选项保留、更换类型及已导入 ID 的回写。临时库 HTTP 测试覆盖普通成员导入电影、筹备并发布观影活动；只在本机测试库运行。后端覆盖身份门禁、活动票据不能冒充成员、类型过滤、候选上限、私人字段排除、只读生成、无效 ID 拒绝和现有去 AI 味规则接入。真实模型推荐的语义质量仍需体验反馈评估。
