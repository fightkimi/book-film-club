import React, { useEffect, useState } from "react";
import { Tabs } from "@radix-ui/themes";
import {
  BookOpen,
  Film,
  Download,
  NotebookPen,
  ScanLine,
  Search,
} from "lucide-react";
import { Button, Pick, ActionRow, SectionTitle, Empty, Modal } from "./ui.jsx";
import ImportLibrary from "./ImportLibrary.jsx";
export default function Toolkit({
  state,
  services,
  api,
  act,
  onMetadata,
  onStudy,
  onCharts,
}) {
  const [tab, setTab] = useState("tools"),
    [provider, setProvider] = useState(null),
    [terms, setTerms] = useState([]),
    [glossary, setGlossary] = useState(false),
    [workId, setWorkId] = useState(state.works[0]?.id || "none"),
    [error, setError] = useState("");
  const work = state.works.find((w) => w.id === workId);
  useEffect(() => {
    let live = true;
    api("/api/toolkit")
      .then((r) => {
        if (live) setTerms(r.glossary);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const cards = [
    [
      "01",
      "按心情与时长选片",
      "从真实片库挑选，避开已看作品。",
      Search,
      () => {
        location.hash = "/themes";
      },
      "挑选主题",
    ],
    [
      "02",
      "资料与封面",
      "微信读书、Open Library、Google Books 与 TMDB。",
      BookOpen,
      () => onMetadata(),
      "搜索作品",
    ],
    [
      "03",
      "Trakt 记录",
      "读取公开账号，或导入电影 JSON。",
      Film,
      () => setProvider("trakt"),
      "导入 Trakt",
    ],
    [
      "04",
      "Letterboxd 日记",
      "保留观影日期、评分和原始感想。",
      NotebookPen,
      () => setProvider("letterboxd"),
      "导入 CSV",
    ],
    [
      "05",
      "豆瓣书影音",
      "兼容 Douban Sync 的书籍、电影导出。",
      Download,
      () => setProvider("douban"),
      "导入豆瓣记录",
    ],
    [
      "06",
      "电影评分与榜单",
      "跨站评分分开显示，榜单来自 TMDB。",
      Film,
      onCharts,
      "浏览高分榜",
    ],
    [
      "07",
      "整理我的感想",
      "保留个人表达，先预览再采用。",
      NotebookPen,
      () => {
        location.hash = "/cycles";
      },
      "进入活动写感想",
    ],
    [
      "08",
      "作品深读",
      "从自己的观察证据出发，形成解读。",
      BookOpen,
      () => setTab("study"),
      "开始深读",
    ],
    [
      "09",
      "逐镜记录",
      "本地片段播放，记录构图、运镜与剪点。",
      ScanLine,
      () => setTab("study"),
      "打开拉片笔记",
    ],
    [
      "10",
      "视听语言",
      "用通俗概念观察画面与声音。",
      BookOpen,
      () => setGlossary(true),
      "打开小词典",
    ],
  ];
  return (
    <div className="container toolkit-page">
      <header className="toolkit-head">
        <span className="eyebrow">THE VIEWING ROOM</span>
        <h1>看过，也慢慢看懂。</h1>
        <p>找作品、留下记录，把自己的观察变成讨论。</p>
      </header>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="书影工具导航">
          <Tabs.Trigger value="tools">书影工具</Tabs.Trigger>
          <Tabs.Trigger value="journal">我的档案</Tabs.Trigger>
          <Tabs.Trigger value="study">深读与拉片</Tabs.Trigger>
          <Tabs.Trigger value="sources">资料来源</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tools">
          <div className="toolkit-grid">
            {cards.map(([n, title, description, Icon, action, label]) => (
              <article key={n}>
                <span className="toolkit-number">{n}</span>
                <Icon size={24} strokeWidth={1.4} />
                <h2>{title}</h2>
                <p>{description}</p>
                <Button variant="outline" onClick={action}>
                  {label}
                </Button>
              </article>
            ))}
          </div>
        </Tabs.Content>
        <Tabs.Content value="journal">
          <SectionTitle detail="这些记录仅自己可见；不会自动转为小组评价或完成本期任务。">
            我的书影档案
          </SectionTitle>
          <ActionRow>
            <Button variant="outline" onClick={() => setProvider("douban")}>
              导入豆瓣
            </Button>
            <Button variant="outline" onClick={() => setProvider("letterboxd")}>
              导入 Letterboxd
            </Button>
            <Button variant="outline" asChild>
              <a href="/api/personal-export">导出我的档案与笔记</a>
            </Button>
          </ActionRow>
          {!(state.journals || []).length && (
            <Empty title="把读过、看过的带过来">
              导入前可逐条核对作品；资料不齐的记录也会保留。
            </Empty>
          )}
          <div className="journal-list">
            {(state.journals || []).map((j) => (
              <article key={j.id}>
                <span className="eyebrow">
                  {j.provider} / {j.kind === "book" ? "书籍" : "电影"}
                </span>
                <h3>{j.title}</h3>
                <p>
                  {j.date || "日期未提供"} ·{" "}
                  {j.rating == null ? "未评分" : `${j.rating} / 5`} ·{" "}
                  {
                    {
                      done: "已完成",
                      wish: "想读 / 想看",
                      reading: "进行中",
                      none: "未标记状态",
                    }[j.status]
                  }
                </p>
                {j.body && (
                  <details>
                    <summary>查看原始感想（可能含剧透）</summary>
                    <p className="prewrap">{j.body}</p>
                  </details>
                )}
                {j.url && (
                  <a href={j.url} rel="noreferrer" target="_blank">
                    查看原始来源
                  </a>
                )}
                <Pick
                  label={`关联「${j.title}」到书影库`}
                  value={j.work_id || "none"}
                  onChange={async (v) => {
                    if (v === "none") return;
                    setError("");
                    try {
                      await act("journal.link", { id: j.id, work_id: v });
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                  options={[
                    ["none", "尚未关联"],
                    ...state.works
                      .filter((w) => w.kind === j.kind)
                      .map((w) => [
                        w.id,
                        `${w.title} / ${w.year || "年份未录入"}`,
                      ]),
                  ]}
                />
                {!j.work_id && (
                  <Button
                    variant="outline"
                    onClick={() => onMetadata(j.title, j.kind)}
                  >
                    搜索补全作品资料
                  </Button>
                )}
              </article>
            ))}
          </div>
        </Tabs.Content>
        <Tabs.Content value="study">
          <SectionTitle detail="先记录观察，再解释意义；AI 不会看到你选择的本地视频。">
            给细节留一个位置
          </SectionTitle>
          <Pick
            label="选择一部作品"
            value={workId}
            onChange={setWorkId}
            options={[
              ["none", "请选择"],
              ...state.works.map((w) => [w.id, w.title]),
            ]}
          />
          <ActionRow>
            <Button disabled={!work} onClick={() => onStudy(work, "analysis")}>
              作品深读
            </Button>
            <Button
              variant="outline"
              disabled={!work || work.kind !== "movie"}
              onClick={() => onStudy(work, "shots")}
            >
              逐镜记录
            </Button>
            <Button variant="outline" onClick={() => setGlossary(true)}>
              视听语言小词典
            </Button>
          </ActionRow>
          {!state.works.length && (
            <Empty title="先添加一部作品">
              <Button onClick={() => onMetadata()}>搜索资料与封面</Button>
            </Empty>
          )}
          {(state.studies || []).map((s) => (
            <article className="study-summary" key={s.id}>
              <h3>
                {state.works.find((w) => w.id === s.work_id)?.title} /{" "}
                {s.mode === "shots" ? "逐镜记录" : "作品深读"}
              </h3>
              <p className="muted">
                更新于 {new Date(s.updated_at).toLocaleString("zh-CN")} ·{" "}
                {s.shots.length} 个镜头
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  onStudy(
                    state.works.find((w) => w.id === s.work_id),
                    s.mode,
                  )
                }
              >
                继续编辑
              </Button>
            </article>
          ))}
        </Tabs.Content>
        <Tabs.Content value="sources">
          <SectionTitle>每一份资料，都有出处</SectionTitle>
          <div className="source-status">
            {[
              [
                "微信读书",
                "中文书名、作者、简介、封面与版本信息",
                services.weread
                  ? "已配置（仅公开书籍资料）"
                  : "待管理员配置官方 API Key",
                "https://weread.qq.com/r/weread-skills",
              ],
              [
                "Open Library",
                "书籍、作者、ISBN 与封面",
                "按需查询，无需密钥",
                "https://openlibrary.org/developers/api",
              ],
              [
                "Google Books",
                "书籍版本、出版信息与封面",
                services.googlebooks ? "已配置" : "待管理员配置",
                "https://developers.google.com/books/docs/v1/using",
              ],
              [
                "TMDB",
                "电影、演职员、海报、相关影片与榜单",
                services.tmdb ? "已配置" : "待管理员配置",
                "https://developer.themoviedb.org/docs/getting-started",
              ],
              [
                "Trakt",
                "公开观影历史、想看片单与个人评分",
                services.trakt
                  ? "已配置；私人账号使用导出文件"
                  : "在线读取待配置；JSON 导入可用",
                "https://developer.trakt.tv/",
              ],
              [
                "Letterboxd / 豆瓣",
                "用户提供的收藏和日记导出文件",
                "文件导入可用；不采集登录 Cookie",
                "https://letterboxd.com/about/importing-data/",
              ],
              [
                "OMDb",
                "IMDb、Rotten Tomatoes、Metacritic 评分",
                services.omdb ? "已配置" : "待管理员配置",
                "https://www.omdbapi.com/",
              ],
            ].map(([name, what, status, url]) => (
              <article key={name}>
                <h3>{name}</h3>
                <p>{what}</p>
                <strong>{status}</strong>
                <p>
                  <a href={url} target="_blank" rel="noreferrer">
                    来源说明
                  </a>
                </p>
              </article>
            ))}
          </div>
          <p className="muted">
            接口仅按需读取，使用有限缓存与限速。中文书籍、不同出版版本和海报覆盖率取决于上游；不保证每条资料完整。OMDb
            数据采用非商业许可，商用前需另行核对授权。
          </p>
        </Tabs.Content>
      </Tabs.Root>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {provider && (
        <ImportLibrary
          key={provider}
          provider={provider}
          api={api}
          act={act}
          state={state}
          services={services}
          onClose={() => {
            setProvider(null);
            setTab("journal");
          }}
        />
      )}
      {glossary && (
        <Modal
          wide
          title="视听与叙事小词典"
          description="通用学习提示，不代替对具体作品的观察。"
          onClose={() => setGlossary(false)}
        >
          <div className="glossary-grid">
            {terms.map((t) => (
              <article key={t.name}>
                <h3>{t.name}</h3>
                <p>{t.definition}</p>
                <p className="muted">试着观察：{t.observe}</p>
              </article>
            ))}
          </div>
          {!terms.length && <p>{error || "正在读取词典…"}</p>}
        </Modal>
      )}
    </div>
  );
}
