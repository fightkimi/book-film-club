import React, { useState } from "react";
import { BookOpen, Sparkles, ArrowRight } from "lucide-react";
import {
  Button,
  Modal,
  Field,
  Pick,
  Check,
  Cover,
  ActionRow,
  Empty,
} from "./ui.jsx";

function ErrorMessage({ children }) {
  return children ? (
    <p className="form-error" role="alert">
      {children}
    </p>
  ) : null;
}

export function Discover({
  theme,
  cycle,
  api,
  enabled,
  onClose,
  onOpen,
  onImport,
  onNominate,
}) {
  const [preferences, setPreferences] = useState({
    kind: cycle?.kind || theme.kind || "mixed",
    minutes: 0,
    mood: "",
    exclude_seen: true,
  });
  const [result, setResult] = useState(null),
    [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (key, value) => {
    setPreferences((p) => ({ ...p, [key]: value }));
    setResult(null);
    setDraft(null);
    setError("");
  };
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = draft
    ? draft.recommendations.map((r) => ({
        ...result.works.find((w) => w.id === r.work_id),
        ...r,
      }))
    : result?.works || [];
  return (
    <Modal
      wide
      title="为这次相聚挑选作品"
      description={`围绕「${theme.title}」，从小组已确认资料的书影库中挑选。`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            setDraft(null);
            setResult(
              await api("/api/discover", {
                theme_id: theme.id,
                ...preferences,
              }),
            );
          });
        }}
      >
        <fieldset className="companion-fields" disabled={busy}>
          <div className="form-grid">
            <Pick
              label="这次想读 / 想看"
              value={preferences.kind}
              onChange={(v) => change("kind", v)}
              options={[
                ["mixed", "书与电影"],
                ["book", "书籍"],
                ["movie", "电影"],
              ]}
            />
            <Pick
              label="电影片长上限"
              value={String(preferences.minutes)}
              onChange={(v) => change("minutes", Number(v))}
              options={[
                ["0", "不限"],
                ["90", "90 分钟"],
                ["120", "120 分钟"],
                ["180", "180 分钟"],
              ]}
            />
          </div>
          <Field
            label="这次的心情 / 小组偏好（用于 AI 推荐）"
            value={preferences.mood}
            maxLength={300}
            placeholder="例如：轻松一些，希望看完有话可聊"
            onChange={(e) => change("mood", e.target.value)}
          />
          <Check
            label="排除我已读完 / 看完的作品"
            checked={preferences.exclude_seen}
            onChange={(v) => change("exclude_seen", v)}
          />
          <p className="muted companion-caption">
            片长限制只用于电影；设置上限时，片长未知的电影也会排除。
          </p>
          <Button type="submit" loading={busy}>
            筛选片库
          </Button>
        </fieldset>
      </form>
      {result && (
        <div className="companion-results" aria-live="polite">
          <ActionRow>
            <h3>{draft ? "与主题的连接" : `${result.total} 部符合筛选条件`}</h3>
            {result.works.length > 0 && (
              <Button
                variant="outline"
                disabled={!enabled || busy}
                loading={busy}
                onClick={() =>
                  run(async () => {
                    const response = await api("/api/ai", {
                      task: "recommend",
                      theme_id: theme.id,
                      ...preferences,
                    });
                    setResult({
                      works: response.works,
                      total: response.works.length,
                    });
                    setDraft(response.draft);
                  })
                }
              >
                <Sparkles size={16} />
                {draft ? "重新推荐" : "AI 帮我挑选"}
              </Button>
            )}
          </ActionRow>
          <p className="muted">
            {draft
              ? "AI 推荐草稿，请结合原始资料判断；关闭后不保留。"
              : "按最近加入排列，尚未判断主题关联。最多展示最近 24 部。"}
          </p>
          {!enabled && (
            <p className="notice">AI 尚未配置，可以先浏览、收藏或提名作品。</p>
          )}
          {!rows.length && (
            <Empty
              title={draft ? "暂时没有足够贴合的作品" : "没有符合条件的作品"}
            >
              试试放宽筛选，或补充书影库。
              {draft && (
                <Button variant="outline" onClick={() => setDraft(null)}>
                  查看全部候选
                </Button>
              )}
            </Empty>
          )}
          <div className="companion-candidates">
            {rows.map((w) => (
              <article className="companion-candidate" key={w.id}>
                <Cover work={w} />
                <div>
                  <span className="eyebrow">
                    {w.kind === "movie" ? "电影" : "书籍"}
                    {w.extra?.runtime ? ` / ${w.extra.runtime} 分钟` : ""}
                  </span>
                  <h3>{w.title}</h3>
                  <p className="muted">
                    {w.creator} · {w.year || "年份待补全"}
                  </p>
                  <p>{w.reason || w.description?.slice(0, 140)}</p>
                  {w.caveat && <p className="muted">需要留意：{w.caveat}</p>}
                  <ActionRow>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => onOpen(w.id)}
                    >
                      查看作品
                      <ArrowRight size={15} />
                    </Button>
                    {cycle && (
                      <Button
                        disabled={busy || cycle.nominations.includes(w.id)}
                        onClick={() => run(() => onNominate(w.id))}
                      >
                        {cycle.nominations.includes(w.id)
                          ? "已在本期候选中"
                          : "提名到本期"}
                      </Button>
                    )}
                  </ActionRow>
                </div>
              </article>
            ))}
          </div>
          {onImport && (
            <ActionRow>
              <Button variant="outline" onClick={onImport}>
                搜索并补充书影库
              </Button>
            </ActionRow>
          )}
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </Modal>
  );
}

export function Guide({ work, api, enabled, onClose }) {
  const [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const book = work.kind === "book";
  const questions = book
    ? [
        "是谁在讲述？他的视角有哪些局限？",
        "哪些意象、词语或场景反复出现？",
        "读完后，你最想和大家讨论哪个选择？",
      ]
    : [
        "画面把你的注意力引向哪里？",
        "声音、沉默和剪辑如何改变你的感受？",
        "看完后，你最想和大家讨论哪个选择？",
      ];
  return (
    <Modal
      title={book ? "读前导赏" : "观前导赏"}
      description={`《${work.title}》 · 先带着问题出发`}
      onClose={onClose}
    >
      <div className="companion-guide">
        <span className="eyebrow">{draft ? "AI 导赏草稿" : "通用观察卡"}</span>
        <h3>{draft ? "换一个角度进入作品" : "不用急着理解一切"}</h3>
        <p>
          {draft?.intro ||
            "挑一个你感兴趣的问题，在阅读或观影时留意。结束后，带着自己的发现回来交流。"}
        </p>
        <h4>{draft ? "可以留意" : "三个出发点"}</h4>
        <ol>
          {(draft?.watchpoints || questions).map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
        {draft && (
          <>
            <h4>留给讨论的问题</h4>
            <ul>
              {draft.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
            {draft.terms.length > 0 && (
              <>
                <h4>{book ? "叙事小词典" : "镜头与声音小词典"}</h4>
                <dl>
                  {draft.terms.map((t, i) => (
                    <div key={i}>
                      <dt>{t.name}</dt>
                      <dd>{t.explanation}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </>
        )}
      </div>
      <p className="muted companion-caption">
        {draft
          ? "根据作品资料生成的观察建议，未核验原片或原文。关闭后不保留。"
          : "这是通用阅读 / 观影提示，不是对这部作品的分析。"}
      </p>
      <ActionRow>
        <Button
          disabled={!enabled || busy}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setDraft(
                (await api("/api/ai", { task: "guide", work_id: work.id }))
                  .draft,
              );
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <BookOpen size={16} />
          {draft ? "重新生成导赏" : "生成这部作品的导赏"}
        </Button>
      </ActionRow>
      {!enabled && (
        <p className="notice">AI 尚未配置，通用观察卡可以直接使用。</p>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </Modal>
  );
}

export function ReviewAssistant({ form, patch, api, enabled }) {
  const [result, setResult] = useState(null),
    [original, setOriginal] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current =
    result && result.source === form.body && result.spoiler === form.spoiler;
  return (
    <section className="review-assistant" aria-label="感想整理助手">
      <h3>保留你的声音</h3>
      <p className="muted">
        先写下真实感受，再让 AI
        帮你梳理表达、追问依据。只发送这段感想与作品资料，不读取个人笔记。
      </p>
      <Button
        type="button"
        variant="outline"
        loading={busy}
        disabled={
          busy || !enabled || !form.body.trim() || form.body.length > 12000
        }
        onClick={async () => {
          const source = form.body,
            spoiler = form.spoiler;
          setBusy(true);
          setError("");
          setResult(null);
          try {
            setResult({
              source,
              spoiler,
              draft: (
                await api("/api/ai", {
                  task: "review",
                  cycle_id: form.cycle_id,
                  work_id: form.work_id,
                  body: source,
                  spoiler,
                })
              ).draft,
            });
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={16} />
        整理我的感想
      </Button>
      {!enabled && (
        <p className="companion-caption muted">
          AI 尚未配置，仍可直接保存感想。
        </p>
      )}
      {form.body.length > 12000 && (
        <p className="muted">辅助整理支持 12,000 字以内；原稿仍可直接保存。</p>
      )}
      {result && (
        <div aria-live="polite" className="companion-review-result">
          <h4>表达建议</h4>
          <ul>
            {result.draft.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>可以再想一想</h4>
          <ul>
            {result.draft.questions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>整理稿 · 尚未保存</h4>
          <p className="prewrap">{result.draft.polished}</p>
          <p className="muted">
            采用前请核对是否符合你的意思，并自行确认剧透标记。
          </p>
          {!current && (
            <p role="status" className="notice">
              原稿或剧透标记已改变，请重新整理后再采用。
            </p>
          )}
          <Button
            type="button"
            disabled={!current || busy}
            onClick={() => {
              setOriginal(form.body);
              patch("body", result.draft.polished);
              setResult(null);
            }}
          >
            采用到编辑框
          </Button>
        </div>
      )}
      {original !== null && (
        <ActionRow>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              patch("body", original);
              setOriginal(null);
              setResult(null);
            }}
          >
            恢复采用前原稿
          </Button>
        </ActionRow>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </section>
  );
}
