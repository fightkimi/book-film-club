import React, { useEffect, useState } from "react";
import { Button, Modal, Cover, ActionRow } from "./ui.jsx";
export default function FilmSources({ work, api, onClose, onSearch }) {
  const [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError("");
    setResult(null);
    api(
      work ? "/api/metadata/extras" : "/api/metadata/charts",
      work ? { work_id: work.id } : { page },
    )
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [work?.id, page]);
  return (
    <Modal
      wide
      title={work ? "评分与相关影片" : "TMDB 高分电影榜"}
      description={
        work
          ? `《${work.title}》 · 不同评分尺度分别呈现，不合成总分。`
          : "榜单顺序由 TMDB 提供，按获取时的结果展示。"
      }
      onClose={onClose}
    >
      {busy && <p role="status">正在获取资料…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {result && (
        <>
          {work && (
            <>
              <div className="rating-grid">
                {result.ratings.map((r, i) => (
                  <article key={i}>
                    <h3>{r.source}</h3>
                    <strong>{r.value}</strong>
                    {r.votes != null && <p>{r.votes} 人评分</p>}
                    <p className="muted">
                      {r.via ? "经 " + r.via + " 获取" : "直接来自 TMDB"}
                    </p>
                  </article>
                ))}
              </div>
              {result.warnings.map((w, i) => (
                <p className="notice" key={i}>
                  {w}
                </p>
              ))}
              <p className="muted">
                跨站评分由 OMDb 转述，可能不完整或滞后。
                <a
                  href="https://www.omdbapi.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  来源与许可
                </a>
              </p>
              <h3>相关影片</h3>
            </>
          )}
          <p className="muted">
            获取时间：{new Date(result.at).toLocaleString("zh-CN")}
          </p>
          <div className="source-films">
            {(result.related || result.items || []).map((w) => (
              <article key={w.source_id}>
                <Cover work={w} />
                <h3>
                  {w.rank ? `${w.rank}. ` : ""}
                  {w.title}
                </h3>
                <p>{w.year}</p>
                <Button variant="outline" onClick={() => onSearch(w.title)}>
                  搜索核对资料
                </Button>
              </article>
            ))}
          </div>
          {!(result.related || result.items || []).length && (
            <p className="muted">
              {work ? "暂时没有相关影片推荐。" : "本页暂无影片，可返回上一页。"}
            </p>
          )}
          {!work && (
            <ActionRow>
              <Button
                variant="outline"
                disabled={page <= 1 || busy}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </Button>
              <span>第 {page} 页</span>
              <Button
                variant="outline"
                disabled={page >= 10 || busy || !result.items.length}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </ActionRow>
          )}
        </>
      )}
    </Modal>
  );
}
