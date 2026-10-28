import React, { useEffect, useRef, useState } from "react";
import { TextAnimate } from "./components/TextAnimate.jsx";
import { Wheel } from "./vendor/spin-wheel/index.js";
import {
  BookOpen,
  Clapperboard,
  Play,
  SkipForward,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { Button, Modal, Pick, ActionRow } from "./ui.jsx";
export default function Draw({ state, act, onClose, onUse }) {
  const [kind, setKind] = useState("book"),
    [mode, setMode] = useState("fresh"),
    [result, setResult] = useState(null),
    [phase, setPhase] = useState("idle"),
    [error, setError] = useState(""),
    [remaining, setRemaining] = useState(3);
  const timer = useRef(null),
    wheelHost = useRef(null),
    wheel = useRef(null),
    alive = useRef(true);
  const used = state.cycles
    .filter((c) => c.status !== "draft")
    .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""))
    .map((c) => c.theme_id);
  const eligible = state.themes.filter(
    (t) =>
      t.enabled &&
      (kind === "mixed" || t.kind === "mixed" || t.kind === kind) &&
      (mode === "random" ||
        (mode === "fresh"
          ? !used.slice(0, 3).includes(t.id)
          : used.includes(t.id))),
  );
  const candidates = result?.candidates || eligible;
  const pending = ["request", "animating"].includes(phase);
  function reveal() {
    clearInterval(timer.current);
    setPhase("revealed");
    if (wheel.current && result)
      wheel.current.spinToItem(
        candidates.findIndex((t) => t.id === result.theme_id),
        0,
        true,
        0,
        1,
      );
  }
  useEffect(
    () => () => {
      alive.current = false;
      clearInterval(timer.current);
      wheel.current?.remove();
    },
    [],
  );
  useEffect(() => {
    wheel.current?.remove();
    wheel.current = null;
    if (kind === "mixed" && wheelHost.current && candidates.length) {
      wheel.current = new Wheel(wheelHost.current, {
        items: candidates.map((t) => ({ label: t.title, weight: t.weight })),
        itemBackgroundColors: ["#e8ecee", "#9caab2", "#495f6c", "#ced5d9"],
        itemLabelColors: ["#161616"],
        borderWidth: 0,
        lineWidth: 1,
        itemLabelFont: "serif",
        itemLabelFontSizeMax: 20,
        isInteractive: false,
        radius: 0.94,
      });
    }
    return () => {
      wheel.current?.remove();
      wheel.current = null;
    };
  }, [kind, JSON.stringify(candidates)]);
  useEffect(() => {
    if (phase === "animating" && kind === "mixed" && wheel.current && result)
      wheel.current.spinToItem(
        candidates.findIndex((t) => t.id === result.theme_id),
        2700,
        true,
        2,
        1,
      );
  }, [phase, result, kind]);
  async function draw() {
    setError("");
    setPhase("request");
    try {
      const response = await act("theme.draw", { kind, mode });
      if (!alive.current) return;
      setResult(response.result);
      setRemaining(3);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPhase("revealed");
        return;
      }
      setPhase("animating");
      let count = 3;
      timer.current = setInterval(() => {
        count--;
        setRemaining(count);
        if (count <= 0) {
          clearInterval(timer.current);
          setPhase("revealed");
        }
      }, 900);
    } catch (e) {
      if (alive.current) {
        setError(e.message);
        setPhase("idle");
      }
    }
  }
  function reset(which, value) {
    clearInterval(timer.current);
    setResult(null);
    setPhase("idle");
    (which === "kind" ? setKind : setMode)(value);
  }
  return (
    <Modal
      wide
      title="让下一次相遇，带一点偶然"
      description="从符合条件的候选主题中随机抽取。每次抽取都会保留记录。"
      onClose={onClose}
    >
      <div className="draw-toolbar">
        <Pick
          label="活动类型"
          value={kind}
          onChange={(v) => {
            if (!pending) reset("kind", v);
          }}
          options={[
            ["book", "主题书架"],
            ["movie", "主题放映室"],
            ["mixed", "书影联动转盘"],
          ]}
        />
        <Pick
          label="抽取方式"
          value={mode}
          onChange={(v) => {
            if (!pending) reset("mode", v);
          }}
          options={[
            ["fresh", "换个口味 / 避开最近三期"],
            ["continue", "延续用过的主题"],
            ["random", "完全随机"],
          ]}
        />
      </div>
      <div className={`draw-stage ${kind} ${phase}`} aria-busy={pending}>
        {kind === "book" && (
          <>
            <div className="shelf-label">
              <BookOpen size={20} />
              <span>THE THEME LIBRARY</span>
            </div>
            <div className="theme-shelf">
              {candidates.slice(0, 12).map((t, i) => (
                <div
                  key={t.id}
                  className={`theme-spine tone-${i % 4} ${result?.theme_id === t.id ? "chosen" : ""}`}
                >
                  <span className="spine-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{t.title}</span>
                </div>
              ))}
            </div>
            {phase === "animating" && (
              <div className="falling-book" aria-hidden="true">
                <BookOpen size={32} />
                <span>{result.theme_title}</span>
              </div>
            )}
            <div className="shelf-caption">
              {candidates.length} 个主题，等待翻开
            </div>
          </>
        )}
        {kind === "movie" && (
          <>
            <div className="cinema-label">
              <Clapperboard size={20} />
              <span>BOOK & FILM PICTURES</span>
            </div>
            <div className="cinema-screen">
              {phase === "animating" ? (
                <div className="film-count" key={remaining}>
                  {remaining || 1}
                </div>
              ) : phase === "revealed" ? (
                <div className="film-title">
                  <span>本期主题</span>
                  <TextAnimate text={result.theme_title} />
                  <p>现在，让故事开始。</p>
                </div>
              ) : (
                <>
                  <Play size={40} strokeWidth={1} />
                  <p>下一场，关于什么？</p>
                </>
              )}
            </div>
            <div className="cinema-caption">THE NEXT STORY IS WAITING</div>
          </>
        )}
        {kind === "mixed" && (
          <div className="wheel-wrap">
            <ChevronDown className="wheel-pointer" size={30} />
            <div ref={wheelHost} className="wheel" />
          </div>
        )}
        {phase === "revealed" && kind !== "movie" && (
          <div className="draw-reveal">
            <span>本期主题</span>
            <TextAnimate text={result.theme_title} />
          </div>
        )}
      </div>
      <div aria-live="polite" className="draw-status">
        {phase === "revealed"
          ? `抽中：${result.theme_title}`
          : phase === "request"
            ? "正在抽取…"
            : phase === "animating"
              ? "正在揭晓主题…"
              : `${eligible.length} 个主题符合条件`}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <ActionRow>
        {phase === "animating" ? (
          <Button onClick={reveal}>
            <SkipForward size={16} />
            跳过动画
          </Button>
        ) : (
          <Button onClick={draw} disabled={pending || !eligible.length}>
            {result ? <RotateCcw size={16} /> : <Play size={16} />}{" "}
            {result ? "再抽一次" : "抽取主题"}
          </Button>
        )}
        {phase === "revealed" && (
          <Button variant="outline" onClick={() => onUse(result.theme_id)}>
            用这个主题发起活动
          </Button>
        )}
      </ActionRow>
    </Modal>
  );
}
