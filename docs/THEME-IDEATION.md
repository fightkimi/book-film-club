# 活动新主题生成

2026-11-05，目标版本 1.6.2。

## 体验合同

发起活动页的“AI 想主题”每次请求模型生成一个新候选，展示名称、说明和讨论问题。“再想一个”会带上本次已看过的候选以避免重复。只有点“用这个主题”后才保存并选中，活动仍需单独筹备和发布。“从已有主题抽取”和手动选择保留为明确的其他入口。失败会在主题区显示原因，不静默换回原题库。

新接口位于已授权的独立体验服务 `/api/bookstores/activity-theme-ai`，只读调用原有身份与资料接口，不更新或重启主服务。用户确认采用仍调用原有 `theme.save`。新接口只接受活动类型、选定作品 ID、用户写的简短讨论方向和近期候选题名。服务端从共享资料中读取书名、作者、类型和短介绍，不发送私人书评、笔记、成员身份或微信凭证。仅生成不改状态。已登录成员的权限沿用现有“可新建主题”行为；原有管理员批量主题接口权限不变。每个用户最多一个生成请求在途，限频沿用现有 AI 并发保护。

模型输出只保留题名、说明和讨论角度，检查长度和结构；同名检查忽略空白、标点、大小写和全半角。语义近似由生成提示约束，不能承诺所有近义主题都能被机械识别。

## 可复用 Skill 的选择

主要参考 [NousResearch / Creative Ideation 2.1.0](https://github.com/NousResearch/hermes-agent/blob/main/optional-skills/creative/creative-ideation/SKILL.md)，以及其中的 [Anti-Slop](https://github.com/NousResearch/hermes-agent/blob/main/optional-skills/creative/creative-ideation/references/anti-slop.md) 和 [Analogy and Blending](https://github.com/NousResearch/hermes-agent/blob/main/optional-skills/creative/creative-ideation/references/methods/analogy-and-blending.md)。该 Skill 标明 MIT；仓库 LICENSE 为 MIT、Copyright (c) 2025 Nous Research，仓库于本次核查日仍有提交。

它适合本任务的部分是：根据情境选择创意方法、摆脱第一组惯常答案、用具体关系与机制检查空泛想法。这里把方法改成换观察者、缩小到日常选择、找可成立的分歧、改变时间或距离四种切入角度。角度是生成约束，不是预先写好的主题库；实际题目仍由模型生成。

还比较了 [jwynia / Brainstorming](https://github.com/jwynia/agent-skills/blob/main/skills/general/ideation/brainstorming/SKILL.md) 的种子扩展与维度切换：文件声明 MIT，但本次仓库级许可证未被 GitHub 识别，未复制其代码或脚本。也检查了本机 `roundtable-seminar` 的多视角讨论思路；其主持台词、人物模拟和研讨会流程较重，没有直接搬入产品。偏软件规划的 brainstorming 工作流不适合作为读书活动的主题生成器。

## 针对本产品的改造

读书、观影小组重在平等聊天。主题不写成课程、培训或考试，不强制参与者公开私密经历，不预设大家得出相同结论。没有选定作品时从可理解的日常问题切入；选了作品时只使用给定资料，不编剧情、台词、引文或作者意图，也不为“具体”硬塞名人和地名。

候选先做创意与重复检查，再通过 `human-writing` 的事实保护和表达规则。界面只展示最终候选，不展示方法名、内部筛选步骤和长篇解释。应用内适配代码位于 `theme_ideation.py`，由 `ai.generate('activity_theme', ...)` 应用；不安装或运行外部 Skill 脚本，也不依赖开发机的全局 Skill 目录。

## 验证

覆盖普通成员访问、匿名拒绝、旧批量权限不变、生成不写数据库、私人材料不进入上下文、输出字段校验、同名拒绝、确认采用、失败重试与计划按钮完整链路。模型响应在自动测试中使用固定样本；真实生成的文风仍需在体验版点击后评估。
