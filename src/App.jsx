import posterCatalog from "./posters.json";
import React, { useState, useEffect } from "react";
import { Tabs, Table, DropdownMenu } from "@radix-ui/themes";
import {
  LayoutGrid,
  List,
  FileText,
  Shuffle,
  Clapperboard,
  Home,
  Library,
  UserRound,
  Search,
  Menu,
  X,
  Plus,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Film,
  CalendarDays,
  Users,
  Check,
  Download,
  RefreshCw,
  Sparkles,
  LogOut,
  Settings,
  ChevronRight,
} from "lucide-react";
import {
  Button,
  Field,
  Pick,
  Check as CheckField,
  Tag,
  Stars,
  Cover,
  WorkCard,
  ThemeCard,
  SectionTitle,
  Empty,
  Modal,
  ActionRow,
  SearchBox,
  labels,
  fmt,
} from "./ui.jsx";
import {
  ThemeForm,
  WorkForm,
  CycleForm,
  RecordForm,
  ReviewForm,
  MemberForm,
  ParticipationForm,
  RecapForm,
  CredentialForm,
  WorkFilters,
} from "./forms.jsx";
import Draw from "./Draw.jsx";
import Metadata from "./Metadata.jsx";

export async function api(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body
        ? { "Content-Type": "application/json", "X-Club-Request": "1" }
        : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "请求未完成");
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("请求超时，请稍后重试");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
const NAV = [
  ["home", "首页"],
  ["cycles", "小组活动"],
  ["themes", "主题档案"],
  ["works", "书影库"],
  ["reviews", "感想与回顾"],
  ["members", "小组成员"],
];
const go = (route) => {
  location.hash = "/" + route;
  window.scrollTo({ top: 0, behavior: "instant" });
};
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(2) || "home");
  useEffect(() => {
    const update = () => setRoute(location.hash.slice(2) || "home");
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return route.split("/");
}

function Login({ session, onLogin }) {
  const setup = !session.initialized,
    [f, setF] = useState({
      name: "",
      group: "书影小组",
      username: "",
      credential: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-page">
      <header className="login-header">
        <Wordmark />
      </header>
      <div className="login-layout">
        <div className="login-copy">
          <span className="eyebrow">BOOK & FILM CLUB</span>
          <h1>
            好故事，
            <br />
            一起读。
            <br />
            一起看。
          </h1>
          <p>
            从一个主题出发，
            <br />
            留下属于我们的一页。
          </p>
        </div>
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(setup ? "/api/setup" : "/api/login", f);
              await onLogin();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{setup ? "创建你们的小组" : "回到小组"}</h2>
          <p className="muted">
            {setup ? "第一位成员将成为管理员。" : "登录后继续本期阅读与观影。"}
          </p>
          {setup && (
            <>
              <Field
                label="小组名称"
                required
                value={f.group}
                onChange={(e) => setF({ ...f, group: e.target.value })}
              />
              <Field
                label="你的名字"
                required
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </>
          )}
          <Field
            label="账号"
            required
            autoComplete="username"
            pattern="[a-zA-Z0-9_-]{3,40}"
            value={f.username}
            onChange={(e) => setF({ ...f, username: e.target.value })}
          />
          <Field
            label={setup ? "密码（至少 10 位）" : "密码"}
            type={"pass" + "word"}
            required
            minLength={setup ? 10 : undefined}
            value={f.credential}
            onChange={(e) => setF({ ...f, credential: e.target.value })}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Button size="3" disabled={busy}>
            {busy ? "请稍候…" : setup ? "创建小组" : "登录"}
            <ArrowRight size={17} />
          </Button>
        </form>
      </div>
      <div className="login-footer">每一期的主题、作品与感想，都值得留下。</div>
    </div>
  );
}
function Wordmark() {
  return (
    <span className="wordmark">
      <img
        className="brand-frequency"
        src="/assets/tongpin-frequency.svg"
        alt=""
        width="56"
        height="50"
      />
      <img
        className="brand-lettering"
        src="/assets/tongpin-wordmark.svg"
        alt="同频"
        width="110"
        height="50"
      />
    </span>
  );
}

function Header({ group, user, route, onModal, onLogout }) {
  const [menu, setMenu] = useState(false),
    [scrolled, setScrolled] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 120);
    scroll();
    addEventListener("scroll", scroll, { passive: true });
    return () => removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => setMenu(false), [route]);
  return (
    <header className={`site-header ${scrolled ? "shrink" : ""}`}>
      <div className="header-line">
        <div className="header-top">
          <a href="#/home" aria-label="同频首页">
            <Wordmark />
          </a>
          <div className="header-right">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Button className="account-trigger">{user.name}</Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Label>{group}</DropdownMenu.Label>
                <DropdownMenu.Item onSelect={() => go("members/" + user.id)}>
                  我的记录
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => onModal({ type: "credential" })}
                >
                  修改密码
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onLogout}>
                  退出登录
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <form
              className="header-search"
              onSubmit={(e) => {
                e.preventDefault();
                go("works");
                dispatchEvent(
                  new CustomEvent("club-search", { detail: search }),
                );
              }}
            >
              <input
                aria-label="搜索书影库"
                placeholder="搜索书籍、电影…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button aria-label="搜索" type="submit">
                <Search size={18} />
              </button>
            </form>
            <button
              className="icon-button mobile-search"
              aria-label="搜索书影库"
              onClick={() => go("works")}
            >
              <Search size={23} strokeWidth={1.5} />
            </button>
            <button
              aria-label="打开导航菜单"
              className="icon-button menu-trigger"
              onClick={() => setMenu(true)}
            >
              <Menu size={28} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
      <nav className="desktop-nav" aria-label="主导航">
        {NAV.map(([id, title]) => (
          <a
            href={"#/" + id}
            aria-current={route === id ? "page" : undefined}
            key={id}
          >
            {title}
          </a>
        ))}
      </nav>
      {menu && (
        <Modal
          className="navigation-modal"
          title={<Wordmark />}
          description={group}
          onClose={() => setMenu(false)}
        >
          <nav className="mobile-nav" aria-label="展开导航">
            {NAV.map(([id, title]) => (
              <a href={"#/" + id} onClick={() => setMenu(false)} key={id}>
                {title}
              </a>
            ))}
          </nav>
          <div className="mobile-account">
            <a href={"#/members/" + user.id} onClick={() => setMenu(false)}>
              我的记录
            </a>
            <button
              onClick={() => {
                setMenu(false);
                onModal({ type: "credential" });
              }}
            >
              修改密码
            </button>
            <button onClick={onLogout}>退出登录</button>
          </div>
        </Modal>
      )}
    </header>
  );
}
function PageHead({ eyebrow, title, description, actions }) {
  return (
    <div className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <ActionRow>{actions}</ActionRow>}
    </div>
  );
}
function Footer({ group }) {
  return (
    <>
      <section className="closing">
        <BookOpen size={34} strokeWidth={1} />
        <h2>读过，看过，也一起聊过。</h2>
        <Button onClick={() => go("themes")}>
          发现下一期主题
          <ArrowRight size={16} />
        </Button>
      </section>
      <footer className="footer">
        <div>
          <h3>{group}</h3>
          <p>把一次相遇，留成共同的记忆。</p>
        </div>
        <div>
          <h3>一起参与</h3>
          <a href="#/cycles">小组活动</a>
          <a href="#/themes">主题档案</a>
          <a href="#/members">小组成员</a>
        </div>
        <div>
          <h3>留住故事</h3>
          <a href="#/works">书单与片库</a>
          <a href="#/reviews">感想与回顾</a>
        </div>
        <div>
          <h3>资料来源</h3>
          <a href="https://openlibrary.org" target="_blank" rel="noreferrer">
            Open Library
          </a>
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            TMDB
          </a>
          <small>
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.
          </small>
        </div>
      </footer>
      <div className="footer-bottom">同频 BOOK & FILM CLUB</div>
    </>
  );
}
function CycleCard({ cycle }) {
  return (
    <article className="cycle-card">
      <button className="card-link" onClick={() => go("cycles/" + cycle.id)}>
        {cycle.works[0] && <Cover work={cycle.works[0]} backdrop />}
        <div className="eyebrow">
          <Tag value={cycle.status} />　{labels[cycle.kind]}
        </div>
        <h3>{cycle.title}</h3>
        <p>{cycle.theme.title}</p>
        <div className="byline">
          {fmt(cycle.start)} — {fmt(cycle.end)}
        </div>
      </button>
    </article>
  );
}
function Review({ review, work, user }) {
  return (
    <article className="review">
      <div className="review-heading">
        <span className="avatar">{user?.name?.slice(0, 1)}</span>
        <div>
          <strong>{user?.name || "成员"}</strong>
          <p className="muted">
            {work?.title}　{fmt(review.updated_at)}
          </p>
        </div>
        <Stars rating={review.rating} />
      </div>
      {review.spoiler ? (
        <details>
          <summary>包含剧透，点击展开评价</summary>
          <p className="prewrap review-body">{review.body}</p>
        </details>
      ) : (
        <p className="prewrap review-body">{review.body}</p>
      )}
    </article>
  );
}

export default function App() {
  const [route, id] = useRoute();
  const [session, setSession] = useState(null),
    [data, setData] = useState(null),
    [modal, setModal] = useState(null),
    [notice, setNotice] = useState(""),
    [fatal, setFatal] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("new"),
    [waiting, setWaiting] = useState(false),
    [viewMode, setViewMode] = useState("grid");
  async function refresh() {
    const s = await api("/api/session");
    setSession(s);
    if (s.user) setData(await api("/api/state"));
    else setData(null);
  }
  useEffect(() => {
    refresh().catch((e) => setFatal(e.message));
    const search = (e) => setQuery(e.detail);
    addEventListener("club-search", search);
    return () => removeEventListener("club-search", search);
  }, []);
  useEffect(() => {
    setKind("all");
    setFilter("all");
    setQuery("");
  }, [route]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route, id]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  async function act(action, payload) {
    try {
      const res = await api("/api/action", {
        action,
        payload,
        revision: data.revision,
      });
      setData(res);
      return res;
    } catch (e) {
      if (e.status === 409) await refresh();
      if (e.status === 401) {
        setSession({ ...session, user: null });
        setData(null);
      }
      throw e;
    }
  }
  async function run(fn) {
    setWaiting(true);
    try {
      await fn();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setWaiting(false);
    }
  }
  const save = (action) => async (p) => {
    await act(action, p);
    setModal(null);
    setNotice("已保存");
  };
  async function askAI(task, ids = {}) {
    setWaiting(true);
    try {
      const r = await api("/api/ai", { task, ...ids });
      setModal({ type: "ai", task, draft: r.draft, ...ids });
    } catch (e) {
      setNotice(e.message);
    } finally {
      setWaiting(false);
    }
  }
  if (fatal)
    return (
      <Empty
        title="暂时无法连接服务"
        action={<Button onClick={() => location.reload()}>重新连接</Button>}
      >
        {fatal}
      </Empty>
    );
  if (!session)
    return (
      <div className="loading" role="status">
        正在打开小组…
      </div>
    );
  if (!session.user) return <Login session={session} onLogin={refresh} />;
  if (!data) return <div className="loading">正在读取活动…</div>;
  const { state: s, users, user, services } = data;
  const isAdmin = user.role === "admin";
  const cycles = [...s.cycles].sort((a, b) => b.start.localeCompare(a.start));
  const active = cycles.find((c) => c.status === "active") || cycles[0];
  const current = cycles.find((c) => c.id === id);
  const theme = s.themes.find((t) => t.id === id);
  const work = s.works.find((w) => w.id === id);
  const selectedUser = users.find((u) => u.id === id);
  const reviews = [...s.reviews].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  const reviewOf = (w) => reviews.filter((r) => r.work_id === w.id);
  const canRecord = (c) => ["active", "closed"].includes(c.status);
  const newCycle = (themeId) => {
    if (!s.themes.length) {
      setNotice("请先添加一个主题");
      return;
    }
    setModal({ type: "cycle", themeId });
  };
  function progressTable(c, onlyUser) {
    const rows = (s.reports[c.id] || []).filter(
      (r) => !onlyUser || r.user_id === onlyUser,
    );
    return (
      <>
        <div className="mobile-progress-list">
          {rows.map((r) => (
            <article className="mobile-progress-card" key={r.user_id}>
              <div className="progress-card-head">
                <a href={"#/members/" + r.user_id}>
                  <span className="avatar">
                    {users.find((u) => u.id === r.user_id)?.name.slice(0, 1)}
                  </span>
                  {users.find((u) => u.id === r.user_id)?.name}
                </a>
                <Tag value={r.status} />
              </div>
              <div className="progress-facts">
                <span>
                  <strong>
                    {r.completed}/{r.total}
                  </strong>
                  作品完成
                </span>
                <span>
                  <strong>{r.reviewed} 篇</strong>本期评价
                </span>
                <span>
                  <strong>{r.discussion ? "已参加" : "未参加"}</strong>小组讨论
                </span>
              </div>
              {canRecord(c) && (isAdmin || r.user_id === user.id) && (
                <div className="progress-card-actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setModal({ type: "record", cycle: c, userId: r.user_id })
                    }
                  >
                    登记进度
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setModal({ type: "review", cycle: c, userId: r.user_id })
                    }
                  >
                    写评价
                  </Button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setModal({
                        type: "participation",
                        cycle: c,
                        userId: r.user_id,
                      })
                    }
                  >
                    参与情况
                  </button>
                </div>
              )}
              {r.completed_at && (
                <small className="muted">完成于 {fmt(r.completed_at)}</small>
              )}
            </article>
          ))}
        </div>
        <div className="table-scroll">
          <Table.Root variant="surface">
            <Table.Header>
              <Table.Row>
                {["成员", "完成作品", "评价", "讨论", "本期状态", "操作"].map(
                  (h) => (
                    <Table.ColumnHeaderCell key={h}>{h}</Table.ColumnHeaderCell>
                  ),
                )}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((r) => (
                <Table.Row key={r.user_id}>
                  <Table.Cell>
                    <a href={"#/members/" + r.user_id}>
                      {users.find((u) => u.id === r.user_id)?.name}
                    </a>
                  </Table.Cell>
                  <Table.Cell>
                    {r.completed} / {r.total}
                  </Table.Cell>
                  <Table.Cell>{r.reviewed} 篇</Table.Cell>
                  <Table.Cell>{r.discussion ? "已参加" : "未参加"}</Table.Cell>
                  <Table.Cell>
                    <Tag value={r.status} />
                    {r.completed_at && (
                      <small className="block muted">
                        {fmt(r.completed_at)}
                      </small>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {canRecord(c) && (isAdmin || r.user_id === user.id) ? (
                      <div className="row-actions">
                        <button
                          onClick={() =>
                            setModal({
                              type: "record",
                              cycle: c,
                              userId: r.user_id,
                            })
                          }
                        >
                          进度
                        </button>
                        <button
                          onClick={() =>
                            setModal({
                              type: "review",
                              cycle: c,
                              userId: r.user_id,
                            })
                          }
                        >
                          评价
                        </button>
                        <button
                          onClick={() =>
                            setModal({
                              type: "participation",
                              cycle: c,
                              userId: r.user_id,
                            })
                          }
                        >
                          参与
                        </button>
                      </div>
                    ) : (
                      <span className="muted">只读</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </div>
      </>
    );
  }
  let content;
  if (route === "home")
    content = (
      <>
        <section className={"hero " + (!active ? "hero-empty" : "")}>
          <div className="hero-inner">
            {active?.works[0] ? (
              <button
                className="hero-image"
                onClick={() => go("cycles/" + active.id)}
              >
                <Cover work={active.works[0]} backdrop />
              </button>
            ) : (
              <div className="hero-editorial">
                <span>
                  BOOKS.
                  <br />
                  FILMS.
                  <br />
                  TOGETHER.
                </span>
              </div>
            )}
            <div className="hero-copy">
              <p className="eyebrow">
                {active
                  ? `${labels[active.status]} / ${labels[active.kind]}`
                  : "我们的第一期"}
              </p>
              <h1>
                {active?.theme.title || "从一个主题开始，遇见下一段好故事。"}
              </h1>
              <p>
                {active?.direction ||
                  active?.theme.description ||
                  "翻开一本书，走进一部电影。让不同的视角，在这里相遇。"}
              </p>
              {active ? (
                <>
                  <div className="byline gold">{active.title}</div>
                  <div className="muted date-line">
                    {fmt(active.start)} — {fmt(active.end)}
                  </div>
                  <Button onClick={() => go("cycles/" + active.id)}>
                    进入本期活动
                    <ArrowRight size={16} />
                  </Button>
                </>
              ) : (
                isAdmin && (
                  <Button onClick={() => setModal({ type: "draw" })}>
                    抽取第一个主题
                    <ArrowRight size={16} />
                  </Button>
                )
              )}
            </div>
          </div>
        </section>
        <section className="container">
          <SectionTitle>最近加入的书与电影</SectionTitle>
          {s.works.length ? (
            <div className="work-grid">
              {s.works
                .slice(-8)
                .reverse()
                .map((w) => (
                  <WorkCard
                    key={w.id}
                    work={w}
                    reviews={reviewOf(w)}
                    onClick={() => go("works/" + w.id)}
                  />
                ))}
            </div>
          ) : (
            <Empty
              title="书影库等待第一部作品"
              action={
                <Button
                  variant="outline"
                  onClick={() => setModal({ type: "metadata" })}
                >
                  搜索并刮削作品
                </Button>
              }
            >
              搜索书籍或电影，确认资料与封面后加入。
            </Empty>
          )}
          <div className="center-action">
            <Button onClick={() => go("works")}>查看书影库</Button>
          </div>
          <SectionTitle>下一次，我们聊什么</SectionTitle>
          <div className="theme-grid">
            {s.themes
              .filter((t) => t.enabled)
              .slice(0, 4)
              .map((t, i) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  index={i}
                  uses={
                    cycles.filter(
                      (c) => c.theme_id === t.id && c.status !== "draft",
                    ).length
                  }
                  onClick={() => go("themes/" + t.id)}
                />
              ))}
          </div>
          <SectionTitle>小组活动</SectionTitle>
          {cycles.length ? (
            <div className="cycle-grid">
              {cycles.slice(0, 3).map((c) => (
                <CycleCard key={c.id} cycle={c} />
              ))}
            </div>
          ) : (
            <Empty title="第一期还在等待发起">
              抽中主题后，选择作品和参与成员即可开始。
            </Empty>
          )}
          <SectionTitle>刚刚留下的感想</SectionTitle>
          {reviews.length ? (
            reviews
              .slice(0, 3)
              .map((r) => (
                <Review
                  key={r.id}
                  review={r}
                  work={s.works.find((w) => w.id === r.work_id)}
                  user={users.find((u) => u.id === r.user_id)}
                />
              ))
          ) : (
            <Empty title="读完、看完，留下一点感想">
              本期活动中的书评与影评会出现在这里。
            </Empty>
          )}
        </section>
      </>
    );
  else if (route === "cycles" && !id)
    content = (
      <div className="container">
        <PageHead
          eyebrow="ACTIVITIES"
          title="每一期，都有新的相遇"
          actions={
            isAdmin && (
              <Button onClick={() => newCycle()}>
                <Plus size={16} />
                发起活动
              </Button>
            )
          }
        />
        <div className="filter-row">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="搜索活动或主题…"
          />
          <Pick
            label="活动状态"
            value={filter}
            onChange={setFilter}
            options={[
              ["all", "全部状态"],
              ...["draft", "active", "closed", "archived"].map((v) => [
                v,
                labels[v],
              ]),
            ]}
          />
        </div>
        <div className="cycle-grid">
          {cycles
            .filter(
              (c) =>
                (filter === "all" || c.status === filter) &&
                (c.title + c.theme.title).includes(query),
            )
            .map((c) => (
              <CycleCard key={c.id} cycle={c} />
            ))}
        </div>
        {!cycles.length && (
          <Empty
            title="尚未创建活动"
            action={
              isAdmin && <Button onClick={() => newCycle()}>创建第一期</Button>
            }
          >
            从主题和作品开始，邀请成员一起参与。
          </Empty>
        )}
      </div>
    );
  else if (route === "cycles" && current) {
    const c = current;
    const joined = (s.reports[c.id] || []).filter(
      (r) => !["leave", "opted_out"].includes(r.status),
    );
    const done = joined.filter((r) =>
      ["done", "late_done"].includes(r.status),
    ).length;
    content = (
      <div className="container">
        <PageHead
          eyebrow={<a href="#/cycles">小组活动</a>}
          title={c.title}
          description={`${fmt(c.start)} — ${fmt(c.end)} / ${labels[c.kind]}`}
          actions={
            <>
              <Tag value={c.status} />
              {isAdmin && c.status === "draft" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setModal({ type: "cycle", item: c })}
                  >
                    编辑活动
                  </Button>
                  <Button
                    disabled={waiting}
                    onClick={() =>
                      run(() =>
                        act("cycle.transition", { id: c.id, status: "active" }),
                      )
                    }
                  >
                    发布活动
                  </Button>
                </>
              )}
              {isAdmin && c.status === "active" && (
                <Button
                  variant="outline"
                  disabled={waiting}
                  onClick={() =>
                    run(() =>
                      act("cycle.transition", { id: c.id, status: "closed" }),
                    )
                  }
                >
                  结束活动
                </Button>
              )}
              {isAdmin && c.status === "closed" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(() =>
                        act("cycle.transition", { id: c.id, status: "active" }),
                      )
                    }
                  >
                    重新开启
                  </Button>
                  <Button
                    onClick={() => setModal({ type: "archive", cycle: c })}
                  >
                    归档活动
                  </Button>
                </>
              )}
            </>
          }
        />
        <div className="cycle-intro">
          <div>
            <span className="eyebrow">本期主题</span>
            <h2>{c.theme.title}</h2>
            <p>{c.direction || c.theme.description}</p>
            <a href={"#/themes/" + c.theme_id}>
              查看主题历史
              <ChevronRight size={15} />
            </a>
          </div>
          <aside>
            <h3>本期完成要求</h3>
            <p>
              {labels[c.rules.quantity]}
              {c.rules.review ? "，提交对应作品评价" : ""}
              {c.rules.discussion ? "，参与讨论" : ""}。
            </p>
            <strong>
              {joined.length
                ? `${done} / ${joined.length} 人完成`
                : "暂无参与成员"}
            </strong>
            <small>请假、不参加成员不计入完成率</small>
          </aside>
        </div>
        <Tabs.Root defaultValue="works">
          <Tabs.List>
            <Tabs.Trigger value="works">本期作品</Tabs.Trigger>
            <Tabs.Trigger value="progress">成员完成情况</Tabs.Trigger>
            <Tabs.Trigger value="reviews">本期感想</Tabs.Trigger>
            <Tabs.Trigger value="recap">活动回顾</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="works">
            <div className="work-grid posters">
              {c.works.map((w) => (
                <WorkCard
                  key={w.id}
                  work={w}
                  reviews={reviews.filter(
                    (r) => r.cycle_id === c.id && r.work_id === w.id,
                  )}
                  onClick={() => go("works/" + w.id)}
                />
              ))}
            </div>
            {!c.works.length && (
              <Empty title="还没有确定本期作品">
                可以先提名、投票，再由管理员编辑活动确定作品。
              </Empty>
            )}
            {c.status === "draft" && (
              <>
                <SectionTitle>候选与提名</SectionTitle>
                <Pick
                  label="从书影库提名"
                  value="choose"
                  onChange={(v) =>
                    run(() => act("nominate", { cycle_id: c.id, work_id: v }))
                  }
                  options={[
                    ["choose", "选择一部作品"],
                    ...s.works
                      .filter((w) => !c.nominations.includes(w.id))
                      .map((w) => [w.id, w.title]),
                  ]}
                />
                <div className="nomination-list">
                  {c.nominations.map((wid) => {
                    const w = s.works.find((w) => w.id === wid);
                    const votes = s.votes.filter(
                      (v) => v.cycle_id === c.id && v.work_id === wid,
                    );
                    return (
                      <div key={wid}>
                        <span>{w?.title}</span>
                        <Button
                          variant={
                            votes.some((v) => v.user_id === user.id)
                              ? "solid"
                              : "outline"
                          }
                          disabled={waiting}
                          onClick={() =>
                            run(() =>
                              act("vote", { cycle_id: c.id, work_id: wid }),
                            )
                          }
                        >
                          {votes.some((v) => v.user_id === user.id)
                            ? "已投票"
                            : "投票"}{" "}
                          / {votes.length}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <SectionTitle>带着这些问题开始</SectionTitle>
            <div className="reading-text prewrap">
              {c.theme.angles || "本期还没有预设讨论问题。"}
            </div>
          </Tabs.Content>
          <Tabs.Content value="progress">
            <div className="tab-toolbar">
              <p>截止时间：{c.end} 23:59（北京时间）</p>
              {isAdmin && (
                <Button asChild variant="outline">
                  <a href={"/api/report.csv?cycle=" + c.id}>
                    <Download size={16} />
                    导出完成表
                  </a>
                </Button>
              )}
            </div>
            {progressTable(c)}
            {canRecord(c) && c.participants[user.id] && (
              <ActionRow>
                <Button
                  onClick={() =>
                    setModal({ type: "record", cycle: c, userId: user.id })
                  }
                >
                  更新我的进度
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setModal({ type: "review", cycle: c, userId: user.id })
                  }
                >
                  写本期感想
                </Button>
              </ActionRow>
            )}
          </Tabs.Content>
          <Tabs.Content value="reviews">
            {canRecord(c) && c.participants[user.id] && (
              <ActionRow>
                <Button
                  onClick={() =>
                    setModal({ type: "review", cycle: c, userId: user.id })
                  }
                >
                  写本期感想
                </Button>
              </ActionRow>
            )}
            {reviews
              .filter((r) => r.cycle_id === c.id)
              .map((r) => (
                <Review
                  key={r.id}
                  review={r}
                  work={c.works.find((w) => w.id === r.work_id)}
                  user={users.find((u) => u.id === r.user_id)}
                />
              ))}
            {!reviews.some((r) => r.cycle_id === c.id) && (
              <Empty title="还没有留下感想">
                一个具体的片段，就可以成为讨论的开始。
              </Empty>
            )}
          </Tabs.Content>
          <Tabs.Content value="recap">
            {c.recap && c.recap_version !== c.content_version && (
              <p className="notice">
                回顾之后有成员更新了记录，可重新整理总结。
              </p>
            )}
            {c.recap ? (
              <div className="reading-text prewrap">{c.recap}</div>
            ) : (
              <Empty title="留下这一期的共同记忆">
                可以手工撰写，也可以在配置 AI 后生成草稿。
              </Empty>
            )}
            {isAdmin && canRecord(c) && (
              <ActionRow>
                <Button onClick={() => setModal({ type: "recap", cycle: c })}>
                  编辑回顾
                </Button>
                <Button
                  variant="outline"
                  disabled={waiting}
                  onClick={() => askAI("recap", { cycle_id: c.id })}
                >
                  <Sparkles size={16} />
                  生成回顾草稿
                </Button>
              </ActionRow>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </div>
    );
  } else if (route === "themes" && !id)
    content = (
      <div className="container">
        <PageHead
          eyebrow="THEME ARCHIVE"
          title="每个主题，都是一扇门"
          actions={
            isAdmin && (
              <>
                <Button
                  className="theme-create"
                  variant="outline"
                  onClick={() => setModal({ type: "theme" })}
                >
                  <FileText size={18} />
                  新增主题
                </Button>
                <Button
                  className="theme-draw"
                  onClick={() => setModal({ type: "draw" })}
                >
                  <Shuffle size={18} />
                  随机抽取主题
                </Button>
              </>
            )
          }
        />
        <div className="filter-row">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="搜索主题、标签…"
          />
          <Pick
            label="适用类型"
            value={kind}
            onChange={setKind}
            options={[
              ["all", "全部类型"],
              ["book", "读书"],
              ["movie", "观影"],
              ["mixed", "书影联动"],
            ]}
          />
          <Pick
            label="主题状态"
            value={filter}
            onChange={setFilter}
            options={[
              ["all", "全部主题"],
              ["enabled", "候选池"],
              ["used", "已使用"],
              ["disabled", "暂不考虑"],
            ]}
          />
        </div>
        <div className="theme-grid">
          {s.themes
            .filter(
              (t) =>
                (kind === "all" || t.kind === kind) &&
                (t.title + t.tags + t.description).includes(query) &&
                (filter === "all" ||
                  (filter === "enabled" && t.enabled) ||
                  (filter === "disabled" && !t.enabled) ||
                  (filter === "used" &&
                    cycles.some(
                      (c) => c.theme_id === t.id && c.status !== "draft",
                    ))),
            )
            .map((t, i) => (
              <ThemeCard
                key={t.id}
                theme={t}
                index={i}
                uses={
                  cycles.filter(
                    (c) => c.theme_id === t.id && c.status !== "draft",
                  ).length
                }
                onClick={() => go("themes/" + t.id)}
              />
            ))}
        </div>
        {isAdmin && (
          <ActionRow>
            <Button
              variant="outline"
              disabled={waiting}
              onClick={() => askAI("themes")}
            >
              <Sparkles size={16} />
              生成候选主题
            </Button>
            <span className="muted">
              {services.ai
                ? "AI 接口已配置"
                : "AI 尚未配置，可使用预置主题或手工新增"}
            </span>
          </ActionRow>
        )}
        <SectionTitle>抽取记录</SectionTitle>
        <div className="history-list">
          {s.draws
            .slice(-15)
            .reverse()
            .map((d) => (
              <div key={d.id}>
                <span>{fmt(d.at)}</span>
                <a href={"#/themes/" + d.theme_id}>{d.theme_title}</a>
                <span>
                  {d.candidates.length} 个候选 /{" "}
                  {d.mode === "fresh"
                    ? "换个口味"
                    : d.mode === "continue"
                      ? "延续讨论"
                      : "完全随机"}
                </span>
              </div>
            ))}
          {!s.draws.length && <p className="muted">尚无抽取记录</p>}
        </div>
      </div>
    );
  else if (route === "themes" && theme)
    content = (
      <div className="container">
        <PageHead
          eyebrow={<a href="#/themes">主题档案</a>}
          title={theme.title}
          description={theme.description}
          actions={
            isAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setModal({ type: "theme", item: theme })}
                >
                  编辑主题
                </Button>
                <Button onClick={() => newCycle(theme.id)}>以此发起活动</Button>
              </>
            )
          }
        />
        <div className="article-columns">
          <article>
            <h2>从哪些角度进入</h2>
            <div className="reading-text prewrap">
              {theme.angles || "还没有添加解构角度。"}
            </div>
            {isAdmin && (
              <ActionRow>
                <Button
                  variant="outline"
                  disabled={waiting}
                  onClick={() => askAI("analyze", { theme_id: theme.id })}
                >
                  <Sparkles size={16} />
                  AI 解构与推荐
                </Button>
              </ActionRow>
            )}
          </article>
          <aside className="info-aside">
            <h3>主题档案</h3>
            <dl>
              <dt>适用类型</dt>
              <dd>{labels[theme.kind]}</dd>
              <dt>候选状态</dt>
              <dd>{theme.enabled ? "可抽取" : "暂不考虑"}</dd>
              <dt>抽取权重</dt>
              <dd>{theme.weight}</dd>
              <dt>来源</dt>
              <dd>
                {theme.source === "editorial" ? "预置人工主题" : "小组创建"}
              </dd>
              <dt>最近更新</dt>
              <dd>{fmt(theme.updated_at)}</dd>
              {posterCatalog.find(
                (p) =>
                  p.id === theme.poster_key ||
                  (!theme.poster_key && p.theme === theme.title),
              ) && (
                <>
                  <dt>海报来源</dt>
                  <dd>
                    <a
                      href={
                        posterCatalog.find(
                          (p) =>
                            p.id === theme.poster_key ||
                            (!theme.poster_key && p.theme === theme.title),
                        ).source
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {
                        posterCatalog.find(
                          (p) =>
                            p.id === theme.poster_key ||
                            (!theme.poster_key && p.theme === theme.title),
                        ).title
                      }
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </aside>
        </div>
        <SectionTitle>这个主题，我们曾这样讨论</SectionTitle>
        <div className="cycle-grid">
          {cycles
            .filter((c) => c.theme_id === theme.id)
            .map((c) => (
              <CycleCard cycle={c} key={c.id} />
            ))}
        </div>
        {!cycles.some((c) => c.theme_id === theme.id) && (
          <Empty title="这个主题还没有开展过活动">
            每次采用都会留下独立的主题快照、作品和回顾。
          </Empty>
        )}
      </div>
    );
  else if (route === "works" && !id) {
    let works = s.works.filter(
      (w) =>
        (kind === "all" || w.kind === kind) &&
        (w.title + w.creator + w.tags)
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "pending" && w.metadata_status !== "confirmed") ||
          s.shelves.some(
            (sh) =>
              sh.user_id === user.id &&
              sh.work_id === w.id &&
              sh.status === filter,
          )),
    );
    works.sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : b.created_at.localeCompare(a.created_at),
    );
    content = (
      <div className="container">
        <PageHead
          eyebrow="THE LIBRARY"
          title="我们的书单与片库"
          actions={
            <Button onClick={() => setModal({ type: "metadata" })}>
              <Plus size={16} />
              刮削并加入作品
            </Button>
          }
        />
        <div className="collection-search">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="搜索作品、作者、导演…"
          />
        </div>
        <div className="criterion-toolbar">
          <span className="collection-count">
            <strong>{works.length}</strong> 部作品
          </span>
          <div className="criterion-toolbar-controls">
            <Button
              variant="outline"
              className="filter-toggle"
              aria-haspopup="dialog"
              onClick={() => setModal({ type: "workfilters" })}
            >
              筛选{kind !== "all" || filter !== "all" ? " / 已启用" : ""}
              <Plus size={16} />
            </Button>
            <Pick
              compact
              label="排序"
              value={sort}
              onChange={setSort}
              options={[
                ["new", "最近加入"],
                ["title", "按名称"],
              ]}
            />
            <div className="view-switch">
              <button
                aria-label="网格视图"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid size={18} />
              </button>
              <button
                aria-label="列表视图"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                <List size={20} />
              </button>
            </div>
          </div>
        </div>
        {(kind !== "all" || filter !== "all") && (
          <div className="active-filters">
            <span>{kind === "all" ? "全部类型" : labels[kind]}</span>
            <span>
              {filter === "pending"
                ? "资料待补全"
                : filter === "all"
                  ? "全部状态"
                  : labels[filter]}
            </span>
            <button
              onClick={() => {
                setKind("all");
                setFilter("all");
              }}
            >
              清除筛选
              <X size={14} />
            </button>
          </div>
        )}
        <div
          className={
            viewMode === "grid"
              ? "work-grid posters criterion-collection-grid"
              : "criterion-collection-list"
          }
        >
          {works.map((w) => (
            <WorkCard
              key={w.id}
              work={w}
              shelfStatus={
                s.shelves.find(
                  (sh) => sh.user_id === user.id && sh.work_id === w.id,
                )?.status
              }
              reviews={reviewOf(w)}
              onClick={() => go("works/" + w.id)}
            />
          ))}
        </div>
        {!works.length && (
          <Empty
            title={
              s.works.length
                ? "没有符合筛选条件的作品"
                : "把第一本书、第一部电影放进来"
            }
            action={
              <Button onClick={() => setModal({ type: "metadata" })}>
                搜索并刮削
              </Button>
            }
          >
            资料与封面会随作品一起保存。
          </Empty>
        )}
      </div>
    );
  } else if (route === "works" && work) {
    const wr = reviewOf(work);
    const shelf =
      s.shelves.find((sh) => sh.user_id === user.id && sh.work_id === work.id)
        ?.status || "none";
    content = (
      <div className="container">
        <PageHead
          eyebrow={<a href="#/works">书影库 / {labels[work.kind]}</a>}
          title={work.title}
          description={`${work.creator}　${work.year}`}
          actions={
            isAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setModal({ type: "metadata", work })}
                >
                  <RefreshCw size={16} />
                  重新刮削
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setModal({ type: "work", item: work })}
                >
                  编辑资料
                </Button>
              </>
            )
          }
        />
        <div className="work-detail">
          <Cover key={work.image} work={work} />
          <div>
            <Stars
              rating={
                wr.length ? wr.reduce((a, r) => a + r.rating, 0) / wr.length : 0
              }
            />
            <p className="muted">
              {wr.length ? `${wr.length} 篇小组评价` : "尚无小组评分"}
            </p>
            <p className="reading-text prewrap">
              {work.description || "简介待补全"}
            </p>
            <div className="work-tags">{work.tags}</div>
            <Pick
              label="我的书单 / 片单"
              value={shelf}
              onChange={(v) =>
                run(() => act("shelf.save", { work_id: work.id, status: v }))
              }
              options={["none", "wish", "reading", "done"].map((v) => [
                v,
                labels[v],
              ])}
            />
            <p className="muted">收藏状态独立于每期活动的完成情况。</p>
            <dl className="metadata-info">
              <dt>资料状态</dt>
              <dd>
                <Tag value={work.metadata_status}>
                  {work.metadata_status === "confirmed"
                    ? "已确认匹配"
                    : "待补全"}
                </Tag>
              </dd>
              <dt>数据来源</dt>
              <dd>
                {work.source_url ? (
                  <a href={work.source_url} target="_blank" rel="noreferrer">
                    {work.provider === "openlibrary"
                      ? "Open Library"
                      : work.provider === "tmdb"
                        ? "TMDB"
                        : "手工资料来源"}
                  </a>
                ) : (
                  "尚未提供"
                )}
              </dd>
              <dt>抓取时间</dt>
              <dd>
                {work.scraped_at
                  ? new Date(work.scraped_at).toLocaleString("zh-CN")
                  : "手工维护"}
              </dd>
              {work.extra?.level && (
                <>
                  <dt>匹配层级</dt>
                  <dd>
                    {work.extra.level === "edition"
                      ? "具体出版版本"
                      : "作品级资料"}
                  </dd>
                </>
              )}
              {work.extra?.isbn?.length > 0 && (
                <>
                  <dt>ISBN</dt>
                  <dd>{work.extra.isbn.join(" / ")}</dd>
                </>
              )}
              {work.extra?.publishers?.length > 0 && (
                <>
                  <dt>出版社</dt>
                  <dd>{work.extra.publishers.join(" / ")}</dd>
                </>
              )}
              {work.extra?.pages && (
                <>
                  <dt>页数</dt>
                  <dd>{work.extra.pages}</dd>
                </>
              )}
              {work.extra?.runtime && (
                <>
                  <dt>片长</dt>
                  <dd>{work.extra.runtime} 分钟</dd>
                </>
              )}
              {work.extra?.cast?.length > 0 && (
                <>
                  <dt>演员</dt>
                  <dd>{work.extra.cast.join(" / ")}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
        <SectionTitle>一起读过、看过</SectionTitle>
        <div className="cycle-grid">
          {cycles
            .filter((c) => c.works.some((w) => w.id === work.id))
            .map((c) => (
              <CycleCard key={c.id} cycle={c} />
            ))}
        </div>
        <SectionTitle>小组的不同视角</SectionTitle>
        {wr.map((r) => (
          <Review
            key={r.id}
            review={r}
            work={work}
            user={users.find((u) => u.id === r.user_id)}
          />
        ))}
        {!wr.length && (
          <Empty title="还没有评价">
            参加包含这部作品的活动后，即可记录本期感想。
          </Empty>
        )}
      </div>
    );
  } else if (route === "members") {
    const member = selectedUser;
    content = (
      <div className="container">
        <PageHead
          eyebrow="OUR COMMUNITY"
          title={member ? member.name + "的阅读与观影" : s.group + "的成员"}
          actions={
            isAdmin && (
              <>
                <Button variant="outline" asChild>
                  <a href="/api/export">
                    <Download size={16} />
                    导出小组数据
                  </a>
                </Button>
                <Button onClick={() => setModal({ type: "member" })}>
                  <Plus size={16} />
                  添加成员
                </Button>
              </>
            )
          }
        />
        {member ? (
          <>
            <a href="#/members" className="back-link">
              <ArrowLeft size={16} />
              所有成员
            </a>
            {cycles
              .filter((c) => c.participants[member.id])
              .map((c) => (
                <section className="member-cycle" key={c.id}>
                  <h2>
                    <a href={"#/cycles/" + c.id}>{c.title}</a>
                  </h2>
                  <p className="muted">
                    {c.theme.title}　{fmt(c.end)} 截止
                  </p>
                  {progressTable(c, member.id)}
                </section>
              ))}
            {!cycles.some((c) => c.participants[member.id]) && (
              <Empty title="还没有参与记录">
                加入新一期活动后，会在这里按周期展示。
              </Empty>
            )}
          </>
        ) : (
          <>
            <div className="member-grid">
              {users.map((u) => {
                const rs = Object.values(s.reports)
                  .flat()
                  .filter((r) => r.user_id === u.id);
                return (
                  <article className="member-card" key={u.id}>
                    <span className="avatar large">{u.name.slice(0, 1)}</span>
                    <h2>
                      <a href={"#/members/" + u.id}>{u.name}</a>
                    </h2>
                    <p className="muted">
                      {u.role === "admin" ? "小组管理员" : "小组成员"}
                      {u.disabled ? " / 已停用" : ""}
                    </p>
                    <p>
                      {rs.length} 期参与　
                      {
                        rs.filter((r) =>
                          ["done", "late_done"].includes(r.status),
                        ).length
                      }{" "}
                      期完成
                    </p>
                    <ActionRow>
                      <Button
                        variant="outline"
                        onClick={() => go("members/" + u.id)}
                      >
                        查看记录
                      </Button>
                      {isAdmin && u.role !== "admin" && (
                        <button
                          className="text-button"
                          onClick={() =>
                            run(() => act("member.toggle", { id: u.id }))
                          }
                        >
                          {u.disabled ? "恢复账号" : "停用账号"}
                        </button>
                      )}
                    </ActionRow>
                  </article>
                );
              })}
            </div>
            <SectionTitle>按周期查看完成情况</SectionTitle>
            {cycles.map((c) => (
              <section className="member-cycle" key={c.id}>
                <h2>
                  <a href={"#/cycles/" + c.id}>{c.title}</a>
                </h2>
                {progressTable(c)}
              </section>
            ))}
          </>
        )}
      </div>
    );
  } else if (route === "reviews")
    content = (
      <div className="container">
        <PageHead eyebrow="REFLECTIONS" title="故事之外，还有我们的声音" />
        <SectionTitle>活动回顾</SectionTitle>
        {cycles
          .filter((c) => c.recap)
          .map((c) => (
            <article className="recap-card" key={c.id}>
              <p className="eyebrow">
                {c.theme.title} / {fmt(c.recap_at)}
              </p>
              <h2>
                <a href={"#/cycles/" + c.id}>{c.title}</a>
              </h2>
              <p className="prewrap">{c.recap}</p>
              <Tag value={c.status} />
            </article>
          ))}
        {!cycles.some((c) => c.recap) && (
          <Empty title="还没有活动回顾">
            在活动详情里整理共识、分歧与下一次想聊的问题。
          </Empty>
        )}
        <SectionTitle>所有书评与影评</SectionTitle>
        <Pick
          label="活动周期"
          value={filter}
          onChange={setFilter}
          options={[["all", "全部周期"], ...cycles.map((c) => [c.id, c.title])]}
        />
        {reviews
          .filter((r) => filter === "all" || r.cycle_id === filter)
          .map((r) => (
            <Review
              key={r.id}
              review={r}
              work={s.works.find((w) => w.id === r.work_id)}
              user={users.find((u) => u.id === r.user_id)}
            />
          ))}
      </div>
    );
  else
    content = (
      <Empty
        title="没有找到这个页面"
        action={<Button onClick={() => go("home")}>返回首页</Button>}
      >
        记录可能已更新，请返回列表重新选择。
      </Empty>
    );
  return (
    <>
      <Header
        group={s.group}
        user={user}
        route={route}
        onModal={setModal}
        onLogout={() =>
          run(async () => {
            await api("/api/logout", {});
            await refresh();
          })
        }
      />
      <main
        className={
          "site-main " +
          (current && canRecord(current) && current.participants[user.id]
            ? "has-mobile-actions"
            : "")
        }
        id="main"
      >
        {content}
      </main>
      {route === "cycles" &&
        current &&
        canRecord(current) &&
        current.participants[user.id] && (
          <div className="mobile-cycle-actions">
            <Button
              variant="outline"
              onClick={() =>
                setModal({ type: "record", cycle: current, userId: user.id })
              }
            >
              更新进度
            </Button>
            <Button
              onClick={() =>
                setModal({ type: "review", cycle: current, userId: user.id })
              }
            >
              写本期感想
            </Button>
          </div>
        )}
      <nav className="bottom-nav" aria-label="手机主导航">
        {[
          ["home", "首页", Home],
          ["cycles", "活动", CalendarDays],
          ["themes", "主题", Sparkles],
          ["works", "书影", Library],
          ["members/" + user.id, "我的", UserRound],
        ].map(([target, label, Icon]) => (
          <a
            key={target}
            href={"#/" + target}
            aria-current={route === target.split("/")[0] ? "page" : undefined}
          >
            <Icon size={23} strokeWidth={1.5} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <Footer group={s.group} />
      {notice && (
        <div className="toast" role="alert">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {waiting && (
        <div className="busy-status" role="status">
          正在处理…
        </div>
      )}
      {modal?.type === "workfilters" && (
        <WorkFilters
          kind={kind}
          filter={filter}
          onClose={() => setModal(null)}
          onApply={(k, f) => {
            setKind(k);
            setFilter(f);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "theme" && (
        <ThemeForm
          item={modal.item}
          onSave={save("theme.save")}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "work" && (
        <WorkForm
          item={modal.item}
          onSave={save("work.save")}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "cycle" && (
        <CycleForm
          item={modal.item}
          themeId={modal.themeId}
          state={s}
          users={users}
          onSave={async (p) => {
            const r = await act("cycle.save", p);
            setModal(null);
            go("cycles/" + r.result.id);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "record" && (
        <RecordForm
          {...modal}
          state={s}
          users={users}
          onSave={save("record.save")}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "review" && (
        <ReviewForm
          {...modal}
          state={s}
          onSave={save("review.save")}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "participation" && (
        <ParticipationForm
          {...modal}
          onSave={save("participation.save")}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "recap" && (
        <RecapForm
          {...modal}
          onSave={save("recap.save")}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "member" && (
        <MemberForm
          onSave={save("member.add")}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "credential" && (
        <CredentialForm
          onSave={async (p) => {
            await api("/api/credential", p);
            setModal(null);
            setNotice("密码已更新，其他会话已退出");
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "metadata" && (
        <Metadata
          {...modal}
          api={api}
          act={act}
          services={services}
          onClose={() => setModal(null)}
          onManual={(item) => setModal({ type: "work", item })}
        />
      )}
      {modal?.type === "draw" && (
        <Draw
          state={s}
          act={act}
          onClose={() => setModal(null)}
          onUse={newCycle}
        />
      )}
      {modal?.type === "archive" && (
        <Modal
          title="归档这一期活动"
          description="归档后，进度、评价和回顾都将变为只读。未完成成员会保留当前状态。"
          onClose={() => setModal(null)}
        >
          <ActionRow>
            <Button
              onClick={() =>
                run(async () => {
                  await act("cycle.transition", {
                    id: modal.cycle.id,
                    status: "archived",
                  });
                  setModal(null);
                })
              }
              disabled={waiting}
            >
              确认归档
            </Button>
            <Button variant="outline" onClick={() => setModal(null)}>
              继续整理
            </Button>
          </ActionRow>
        </Modal>
      )}
      {modal?.type === "ai" && (
        <Modal
          wide
          title="AI 草稿"
          description="请核对后采用。推荐作品需通过刮削确认，才可加入正式活动。"
          onClose={() => setModal(null)}
        >
          {modal.task === "themes" ? (
            modal.draft.themes.map((t, i) => (
              <article className="ai-item" key={i}>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <p className="prewrap">{t.angles}</p>
                <Button
                  variant="outline"
                  onClick={() => setModal({ type: "theme", item: t })}
                >
                  编辑并加入主题库
                </Button>
              </article>
            ))
          ) : modal.task === "analyze" ? (
            <>
              <p className="reading-text prewrap">{modal.draft.analysis}</p>
              <Button
                onClick={() =>
                  setModal({
                    type: "theme",
                    item: {
                      ...s.themes.find((t) => t.id === modal.theme_id),
                      angles: modal.draft.analysis,
                    },
                  })
                }
              >
                编辑并采用解构
              </Button>
              {modal.draft.recommendations.map((r, i) => (
                <article className="ai-item" key={i}>
                  <h3>{r.title}</h3>
                  <p>{r.reason}</p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setModal({ type: "metadata", initial: r.title })
                    }
                  >
                    搜索核对作品
                  </Button>
                </article>
              ))}
            </>
          ) : (
            <>
              <p className="reading-text prewrap">{modal.draft.recap}</p>
              <Button
                onClick={() =>
                  setModal({
                    type: "recap",
                    cycle: s.cycles.find((c) => c.id === modal.cycle_id),
                    initial: modal.draft.recap,
                  })
                }
              >
                编辑回顾草稿
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
