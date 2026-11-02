import React, { useEffect, useState } from "react";
import { Button, Modal, Field, ActionRow } from "./ui.jsx";
export default function StudyNotebook({
  work,
  mode,
  state,
  api,
  act,
  enabled,
  onClose,
}) {
  const old = (state.studies || []).find(
    (s) => s.work_id === work.id && s.mode === mode,
  );
  const [notes, setNotes] = useState(old?.notes || ""),
    [shots, setShots] = useState(old?.shots || []),
    [reflection, setReflection] = useState(old?.reflection || "");
  const [video, setVideo] = useState(null),
    [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [original, setOriginal] = useState(null);
  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video);
    },
    [video],
  );
  const evidence = JSON.stringify({ notes, shots });
  const change = (fn) => {
    fn();
    setSaved(false);
  };
  const update = (i, key, value) =>
    change(() =>
      setShots((list) =>
        list.map((s, n) => (n === i ? { ...s, [key]: value } : s)),
      ),
    );
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
      title={mode === "shots" ? "逐镜记录" : "作品深读"}
      description={`《${work.title}》 · 笔记仅自己可见，可导出；不会影响活动完成状态。`}
      onClose={onClose}
    >
      {mode === "shots" && (
        <>
          <Field label="本地片段（只在本机播放，不上传）">
            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) setVideo(URL.createObjectURL(f));
              }}
            />
          </Field>
          {video && (
            <video
              className="study-video"
              src={video}
              controls
              preload="metadata"
              onError={() =>
                setError(
                  "浏览器无法播放这个片段，请尝试 MP4 / H.264 格式；镜头笔记仍可手工保存。",
                )
              }
            />
          )}
          <p className="muted">
            边播放边记录。时间按此片段起点的秒数填写；镜头不应重叠。AI
            只读取文字证据，不读取视频画面。
          </p>
          {shots.map((s, i) => (
            <fieldset className="shot-row" key={i} disabled={busy}>
              <legend>镜头 {i + 1}</legend>
              <div className="form-grid">
                <Field
                  label="开始（秒）"
                  type="number"
                  min={0}
                  step="0.1"
                  value={s.start}
                  onChange={(e) => update(i, "start", Number(e.target.value))}
                />
                <Field
                  label="结束（秒）"
                  type="number"
                  min={0}
                  step="0.1"
                  value={s.end}
                  onChange={(e) => update(i, "end", Number(e.target.value))}
                />
              </div>
              <Field label="实际看到 / 听到的证据">
                <textarea
                  rows={3}
                  value={s.evidence}
                  maxLength={1000}
                  onChange={(e) => update(i, "evidence", e.target.value)}
                  placeholder="先写观察事实，再写解释。不要把猜测当作镜头内容。"
                />
              </Field>
              <div className="form-grid">
                {[
                  ["composition", "景别 / 构图"],
                  ["movement", "运镜 / 调度"],
                  ["cut", "剪点 / 转场"],
                  ["sound", "声音 / 音乐"],
                ].map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    maxLength={1000}
                    value={s[key]}
                    onChange={(e) => update(i, key, e.target.value)}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  change(() => setShots((v) => v.filter((_, n) => n !== i)))
                }
              >
                移除此镜头
              </Button>
            </fieldset>
          ))}
          <Button
            disabled={busy || shots.length >= 30}
            variant="outline"
            onClick={() =>
              change(() =>
                setShots((v) => [
                  ...v,
                  {
                    start: v.at(-1)?.end || 0,
                    end: (v.at(-1)?.end || 0) + 5,
                    evidence: "",
                    composition: "",
                    movement: "",
                    cut: "",
                    sound: "",
                  },
                ]),
              )
            }
          >
            添加镜头
          </Button>
        </>
      )}
      <Field label={mode === "shots" ? "片段背景与观察笔记" : "我的观察证据"}>
        <textarea
          rows={7}
          maxLength={12000}
          value={notes}
          onChange={(e) => change(() => setNotes(e.target.value))}
          placeholder="记录你注意到的片段、人物选择、叙述视角和主题联系。可以注明页码或时间，但不要补造证据。"
        />
      </Field>
      <ActionRow>
        <Button
          disabled={!enabled || busy}
          loading={busy}
          variant="outline"
          onClick={() =>
            run(async () => {
              const result = await api("/api/ai", {
                task: "study",
                work_id: work.id,
                mode,
                notes,
                shots,
              });
              setDraft({ source: evidence, reflection, draft: result.draft });
            })
          }
        >
          根据我的证据分析
        </Button>
      </ActionRow>
      {!enabled && (
        <p className="notice">AI 尚未配置，观察笔记和镜头记录可以直接保存。</p>
      )}
      {draft && (
        <section className="companion-guide">
          <h3>AI 解读草稿</h3>
          <p>{draft.draft.summary}</p>
          {draft.draft.claims.map((c, i) => (
            <div key={i}>
              <blockquote>{c.quote}</blockquote>
              <p>{c.interpretation}</p>
            </div>
          ))}
          <h4>继续观察</h4>
          <ul>
            {draft.draft.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          <p className="muted">
            引用来自你填写的证据；解释仍需核对。未读取原片或原文。
          </p>
          {(draft.source !== evidence || draft.reflection !== reflection) && (
            <p role="status">笔记已改变，请重新分析。</p>
          )}
          <Button
            disabled={
              busy ||
              draft.source !== evidence ||
              draft.reflection !== reflection
            }
            onClick={() => {
              setOriginal(reflection);
              setReflection(
                [
                  draft.draft.summary,
                  ...draft.draft.claims.map(
                    (c) => `证据：${c.quote}\n解读：${c.interpretation}`,
                  ),
                  "继续观察：\n" + draft.draft.questions.join("\n"),
                ].join("\n\n"),
              );
              setDraft(null);
              setSaved(false);
            }}
          >
            采用到我的解读
          </Button>
        </section>
      )}
      <Field label="我的解读（可修改后保存）">
        <textarea
          rows={7}
          maxLength={16000}
          value={reflection}
          onChange={(e) => change(() => setReflection(e.target.value))}
        />
      </Field>
      {original !== null && (
        <Button
          variant="outline"
          onClick={() => {
            setReflection(original);
            setOriginal(null);
            setSaved(false);
          }}
        >
          恢复采用前解读
        </Button>
      )}
      <ActionRow>
        <Button
          loading={busy}
          disabled={busy}
          onClick={() =>
            run(async () => {
              await act("study.save", {
                work_id: work.id,
                mode,
                notes,
                shots,
                reflection,
              });
              setSaved(true);
            })
          }
        >
          保存笔记
        </Button>
        {saved && <span role="status">已保存，仅自己可见</span>}
      </ActionRow>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
