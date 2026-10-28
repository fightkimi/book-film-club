import posterCatalog from "./posters.json";
import React, { useState } from "react";
import {
  Button as RadixButton,
  Dialog,
  Select,
  Checkbox,
  Badge,
} from "@radix-ui/themes";
import { Bookmark, X, Star, Search, ImageOff } from "lucide-react";
export { Checkbox };
export function Button({
  children,
  variant = "solid",
  className = "",
  loading = false,
  disabled = false,
  ...props
}) {
  return (
    <RadixButton
      {...props}
      variant={variant}
      loading={loading}
      disabled={disabled || loading}
      className={`criterion-button ${className}`}
    >
      {children}
    </RadixButton>
  );
}
export const labels = {
  book: "读书",
  movie: "观影",
  mixed: "书影联动",
  draft: "筹备中",
  active: "进行中",
  closed: "已结束",
  archived: "已归档",
  planned: "待开始",
  joined: "参加",
  leave: "请假",
  opted_out: "不参加",
  done: "已完成",
  late_done: "补交完成",
  overdue: "逾期",
  in_progress: "进行中",
  not_started: "未开始",
  wish: "想读 / 想看",
  reading: "进行中",
  none: "未收藏",
  all: "全部作品",
  any: "任选一部",
};
export const fmt = (s) =>
  s
    ? new Date(s.includes("T") ? s : s + "T12:00:00+08:00").toLocaleDateString(
        "zh-CN",
        {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
      )
    : "—";
export function Tag({ value, children }) {
  return (
    <Badge
      color={
        ["active", "done", "late_done", "confirmed"].includes(value)
          ? "green"
          : ["overdue", "pending"].includes(value)
            ? "orange"
            : "gray"
      }
      variant="soft"
    >
      {children || labels[value] || value}
    </Badge>
  );
}
export function SectionTitle({ children, detail }) {
  return (
    <div className="section-title">
      <span className="section-mark" />
      <h2>{children}</h2>
      {detail && <p>{detail}</p>}
    </div>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} onInput={props.onChange} />}
    </label>
  );
}
export function Pick({ label, value, onChange, options, compact = false }) {
  return (
    <label
      className={"field criterion-select " + (compact ? "compact-select" : "")}
    >
      <span className="select-label">{label}</span>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger aria-label={label} />
        <Select.Content className="criterion-select-menu" position="popper">
          {options.map(([v, l]) => (
            <Select.Item value={v} key={v}>
              {l}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>
  );
}
export function Check({ label, checked, onChange }) {
  return (
    <label className="check">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>{label}</span>
    </label>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  className = "",
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Content
        className={"modal " + className}
        maxWidth={wide ? "900px" : "640px"}
      >
        <div className="modal-head">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close>
            <button className="icon-button" aria-label="关闭">
              <X size={22} />
            </button>
          </Dialog.Close>
        </div>
        <Dialog.Description className="muted modal-description">
          {description || "填写信息后保存。"}
        </Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}
export function Stars({ rating = 0 }) {
  return (
    <span
      className="stars"
      aria-label={rating ? `${rating.toFixed(1)} 分（满分 5 分）` : "暂无评分"}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={18}
          strokeWidth={1.3}
          fill={i < Math.round(rating) ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}
export function Cover({ work, className = "", backdrop = false }) {
  const [failed, setFailed] = useState(false);
  const src = (backdrop && work?.extra?.backdrop) || work?.image;
  return src && !failed ? (
    <img
      className={`cover ${backdrop && work?.extra?.backdrop ? "cover-backdrop" : "cover-artwork"} ${className}`}
      src={src}
      alt={work.title + "封面"}
      loading={backdrop ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`cover cover-error ${className}`}>
      <ImageOff size={26} />
      <span>{src ? "图片暂时不可用" : "待补充图片"}</span>
    </div>
  );
}
export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder = "搜索名称…" }) {
  return (
    <div className="search-box">
      <Search size={23} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="icon-button"
          aria-label="清除搜索"
          onClick={() => onChange("")}
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
export function WorkCard({
  work,
  reviews = [],
  onClick,
  compact = false,
  shelfStatus,
}) {
  const avg = reviews.length
    ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
    : 0;
  return (
    <article
      className={"work-card " + (compact ? "landscape" : "collection-card")}
    >
      <button className="card-link" onClick={onClick}>
        <Cover work={work} backdrop={compact} />
        <div className="work-caption">
          <span
            className={
              "collection-status " + (shelfStatus === "done" ? "complete" : "")
            }
          >
            {shelfStatus
              ? labels[shelfStatus]
              : work.metadata_status === "confirmed"
                ? "已收录"
                : "资料待补全"}
          </span>
          <h3>{work.title}</h3>
          <div className="byline">{work.creator || "作者 / 导演待补全"}</div>
          {avg > 0 && <Stars rating={avg} />}
          <span className="work-meta">
            {labels[work.kind]}　{work.year}
          </span>
        </div>
      </button>
      {!compact && (
        <div className="collection-actions">
          <Button variant="outline" onClick={onClick}>
            查看作品
          </Button>
        </div>
      )}
    </article>
  );
}
export function ActionRow({ children }) {
  return <div className="actions">{children}</div>;
}

export function ThemeCard({ theme, index, uses = 0, onClick }) {
  const poster =
    posterCatalog.find((p) => p.id === theme.poster_key) ||
    (!theme.poster_key
      ? posterCatalog.find((p) => p.theme === theme.title)
      : null);
  return (
    <button
      className={"theme-card " + (poster ? "poster-theme" : "text-theme")}
      onClick={onClick}
    >
      {poster && (
        <img
          className="theme-poster"
          src={poster.image}
          alt=""
          loading="lazy"
        />
      )}
      <span className="theme-index">{String(index + 1).padStart(2, "0")}</span>
      <div className="theme-copy">
        <div className="eyebrow">
          {labels[theme.kind]} / {theme.enabled ? "候选主题" : "暂不考虑"}
        </div>
        <h3>{theme.title}</h3>
        <p>{theme.description}</p>
        <span className="text-link">
          使用 {uses} 次 <span aria-hidden="true">→</span>
        </span>
        {poster && (
          <small className="poster-credit">
            视觉选片 / {poster.title} ({poster.year})
          </small>
        )}
      </div>
    </button>
  );
}
