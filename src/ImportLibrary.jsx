import React, { useState } from "react";
import { Button, Modal, Pick, Field, Check, ActionRow, Empty } from "./ui.jsx";
const names = { letterboxd: "Letterboxd", douban: "豆瓣", trakt: "Trakt" };
export default function ImportLibrary({
  provider,
  api,
  act,
  state,
  services,
  onClose,
}) {
  const [mode, setMode] = useState("file"),
    [content, setContent] = useState(""),
    [status, setStatus] = useState("done");
  const [username, setUsername] = useState(""),
    [collection, setCollection] = useState("history"),
    [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null),
    [selected, setSelected] = useState([]),
    [mappings, setMappings] = useState({});
  const [overwrite, setOverwrite] = useState(false),
    [sync, setSync] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(null);
  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const result = await api(
      mode === "trakt" ? "/api/import/trakt" : "/api/import/preview",
      mode === "trakt"
        ? { username, collection, page }
        : { provider, content, status },
    );
    setPreview(result);
    setSelected(result.rows.map((r) => r.source_key));
    setMappings(
      Object.fromEntries(
        result.rows.map((r) => [r.source_key, r.suggested_work_id]),
      ),
    );
  }
  return (
    <Modal
      wide
      title={`导入 ${names[provider]} 记录`}
      description="先预览、核对关联，再导入个人档案。不会自动完成任何一期活动，也不会发布为小组影评。"
      onClose={onClose}
    >
      {done ? (
        <div role="status">
          <h3>已保存到个人档案</h3>
          <p>
            新增 {done.added} 条，更新 {done.updated} 条，跳过 {done.skipped}{" "}
            条。
          </p>
          <Button onClick={onClose}>完成</Button>
        </div>
      ) : !preview ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(load);
          }}
        >
          <fieldset disabled={busy} className="companion-fields">
            {provider === "trakt" && (
              <Pick
                label="导入方式"
                value={mode}
                onChange={setMode}
                options={[
                  ["file", "导出的 JSON 文件"],
                  ["trakt", "读取公开账号"],
                ]}
              />
            )}
            {mode === "trakt" ? (
              <>
                <Field
                  label="我的 Trakt 用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  maxLength={80}
                />
                <div className="form-grid">
                  <Pick
                    label="记录类型"
                    value={collection}
                    onChange={(v) => {
                      setCollection(v);
                      setPage(1);
                    }}
                    options={[
                      ["history", "观看历史"],
                      ["watchlist", "想看片单"],
                      ["ratings", "个人评分（不标记已看）"],
                    ]}
                  />
                  <Field
                    label="页码（每页 50 条）"
                    type="number"
                    min={1}
                    max={1000}
                    value={page}
                    onChange={(e) => setPage(Number(e.target.value))}
                  />
                </div>
                <p className="muted">
                  只读取公开资料。私人账号可使用导出文件。每次预览一页，导入后可继续下一页。
                </p>
                {!services.trakt && (
                  <p className="notice">
                    Trakt 服务尚未配置，仍可使用 JSON 导入。
                  </p>
                )}
              </>
            ) : (
              <>
                <Field
                  label={
                    provider === "trakt"
                      ? "JSON 文件（先解压导出包）"
                      : "UTF-8 CSV 文件"
                  }
                >
                  <input
                    type="file"
                    accept={provider === "trakt" ? ".json" : ".csv"}
                    onChange={(e) =>
                      run(async () => {
                        const file = e.target.files[0];
                        if (!file) return;
                        if (file.size > 100000)
                          throw new Error(
                            "文件需小于 100 KB，每批最多 200 条，请先拆分。",
                          );
                        setContent(await file.text());
                      })
                    }
                  />
                </Field>
                <p className="muted">
                  {provider === "douban"
                    ? "兼容 Douban Sync：title,url,date,rating,status,comment。支持书籍和电影。"
                    : provider === "letterboxd"
                      ? "支持 diary / reviews / watchlist 等导出的 CSV，保留日期、评分和评论。"
                      : "支持 watched-history、lists-watchlist、ratings-movies 的 JSON 数组；仅电影条目。"}
                </p>
                <Field label="或粘贴文件内容">
                  <textarea
                    rows={5}
                    maxLength={100000}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                  />
                </Field>
                {provider !== "douban" && (
                  <Pick
                    label="本批收藏状态"
                    value={status}
                    onChange={setStatus}
                    options={[
                      ["done", "已看"],
                      ["wish", "想看"],
                      ["reading", "在看"],
                      ["none", "仅导入评分 / 评论，不标记已看"],
                    ]}
                  />
                )}
              </>
            )}
            <ActionRow>
              <Button
                type="submit"
                loading={busy}
                disabled={busy || (mode === "trakt" && !services.trakt)}
              >
                预览记录
              </Button>
            </ActionRow>
          </fieldset>
        </form>
      ) : (
        <>
          <p>
            {preview.rows.length}{" "}
            条可导入记录。关联只是匹配建议，请核对；未关联的记录也会保留在个人档案。
          </p>
          {preview.errors.length > 0 && (
            <details>
              <summary>{preview.errors.length} 条跳过 / 错误说明</summary>
              <ul>
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    第 {e.line} 条：{e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!preview.rows.length && (
            <Empty title="这一页没有可导入记录">
              可返回修改条件或选择其他文件。
            </Empty>
          )}
          <div className="import-rows">
            {preview.rows.map((row) => (
              <article key={row.source_key}>
                <Check
                  label={`${row.kind === "book" ? "书" : "影"} · ${row.title}`}
                  checked={selected.includes(row.source_key)}
                  onChange={(yes) =>
                    setSelected((v) =>
                      yes
                        ? [...v, row.source_key]
                        : v.filter((k) => k !== row.source_key),
                    )
                  }
                />
                <p className="muted">
                  {row.date || "日期未提供"} ·{" "}
                  {row.rating == null ? "未评分" : `${row.rating} / 5`} ·{" "}
                  {
                    {
                      done: "已完成",
                      wish: "想读 / 想看",
                      reading: "进行中",
                      none: "未标记状态",
                    }[row.status]
                  }
                </p>
                {row.body && (
                  <details>
                    <summary>原始评论（可能含剧透）</summary>
                    <p className="prewrap">{row.body}</p>
                  </details>
                )}
                <Pick
                  label={`关联「${row.title}」`}
                  value={mappings[row.source_key] || "none"}
                  onChange={(v) =>
                    setMappings((m) => ({
                      ...m,
                      [row.source_key]: v === "none" ? "" : v,
                    }))
                  }
                  options={[
                    ["none", "暂不关联，保留原始记录"],
                    ...state.works
                      .filter((w) => w.kind === row.kind)
                      .map((w) => [
                        w.id,
                        `${w.title} / ${w.year || "年份未录入"}`,
                      ]),
                  ]}
                />
              </article>
            ))}
          </div>
          <Check
            label="更新已经导入过的记录（覆盖原导入内容与关联）"
            checked={overwrite}
            onChange={setOverwrite}
          />
          <Check
            label="同时更新关联作品在我的书单 / 片单中的状态"
            checked={sync}
            onChange={setSync}
          />
          <ActionRow>
            <Button
              disabled={busy || !selected.length}
              loading={busy}
              onClick={() =>
                run(async () => {
                  const r = await act("library.import", {
                    token: preview.token,
                    selected,
                    mappings,
                    overwrite,
                    sync_shelf: sync,
                  });
                  setDone(r.result);
                })
              }
            >
              确认导入 {selected.length} 条
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              返回调整
            </Button>
          </ActionRow>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
