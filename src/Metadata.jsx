import React, { useState } from "react";
import {
  Button,
  Modal,
  Field,
  Pick,
  Cover,
  ActionRow,
  Empty,
  Tag,
} from "./ui.jsx";
import { Search, ArrowLeft, Download } from "lucide-react";
export default function Metadata({
  api,
  act,
  onClose,
  onManual,
  initial = "",
  work = null,
  services,
}) {
  const [kind, setKind] = useState(work?.kind || "book"),
    [query, setQuery] = useState(initial || work?.title || ""),
    [results, setResults] = useState(null),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
  return (
    <Modal
      wide
      title={work ? "刷新作品资料" : "搜索并刮削作品"}
      description="先核对作品与版本，再导入资料和图片。未匹配的资料不会自动加入书影库。"
      onClose={onClose}
    >
      {!preview ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () =>
                setResults(
                  (await api("/api/metadata/search", { kind, query })).results,
                ),
              );
            }}
          >
            <div className="metadata-search">
              <Pick
                label="作品类型"
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  setResults(null);
                }}
                options={[
                  ["book", "书籍 / Open Library"],
                  ["movie", "电影 / TMDB"],
                ]}
              />
              <Field
                label="书名、ISBN 或电影名称"
                required
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                <Search size={16} />
                {busy ? "检索中…" : "搜索"}
              </Button>
            </div>
          </form>
          {kind === "movie" && !services.tmdb && (
            <p className="notice">
              电影数据源尚未配置 TMDB 读访问令牌。可先手工录入完整资料与来源。
            </p>
          )}
          {results && results.length === 0 && (
            <Empty title="没有找到匹配作品">
              试试原文名称、作者或 ISBN，也可以手工补全。
            </Empty>
          )}
          <div className="metadata-results">
            {results?.map((r) => (
              <button
                className="metadata-result"
                key={r.source_id}
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    setPreview(
                      await api("/api/metadata/detail", {
                        provider: r.provider,
                        source_id: r.source_id,
                      }),
                    ),
                  )
                }
              >
                <Cover work={r} />
                <span>
                  <strong>{r.title}</strong>
                  <span>{r.creator}</span>
                  <span>{r.year}</span>
                  <small>查看资料与图片</small>
                </span>
              </button>
            ))}
          </div>
          <ActionRow>
            <Button
              variant="outline"
              onClick={() => onManual({ kind, title: query })}
            >
              手工录入
            </Button>
          </ActionRow>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            <ArrowLeft size={16} />
            返回候选
          </Button>
          <div className="metadata-preview">
            <Cover key={preview.item.image} work={preview.item} />
            <div>
              <h2>{preview.item.title}</h2>
              <p>
                {preview.item.creator}　{preview.item.year}
              </p>
              <p className="prewrap">
                {preview.item.description || "此来源缺少简介，需要补全。"}
              </p>
              <p className="muted">{preview.item.tags}</p>
              <a
                href={preview.item.source_url}
                target="_blank"
                rel="noreferrer"
              >
                核对原始来源
              </a>
              <p className="muted">
                获取于{" "}
                {new Date(preview.item.scraped_at).toLocaleString("zh-CN")}
              </p>
            </div>
          </div>
          {(!preview.item.image ||
            !preview.item.description ||
            !preview.item.creator) && (
            <p className="notice">当前资料不完整，补全后才能用于正式活动。</p>
          )}
          <ActionRow>
            <Button
              disabled={
                busy ||
                !preview.item.image ||
                !preview.item.description ||
                !preview.item.creator
              }
              onClick={() =>
                run(async () => {
                  await act("metadata.import", {
                    token: preview.token,
                    id: work?.id,
                  });
                  onClose();
                })
              }
            >
              <Download size={16} />
              {busy ? "正在导入…" : "确认匹配并导入"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                onManual({ ...preview.item, ...(work ? { id: work.id } : {}) })
              }
            >
              手工补充 / 合并
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
