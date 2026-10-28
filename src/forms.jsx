import posterCatalog from "./posters.json";
import React, { useState } from "react";
import {
  Field,
  Pick,
  Check,
  Button,
  Modal,
  ActionRow,
  labels,
  Cover,
} from "./ui.jsx";
const types = [
  ["mixed", "书影联动"],
  ["book", "读书"],
  ["movie", "观影"],
];
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function Editor({ initial, onSave, children }) {
  const [form, set] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const patch = (k, v) => set((f) => ({ ...f, [k]: v }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSave(form);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children(form, patch)}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <ActionRow>
        <Button type="submit" loading={busy} disabled={busy}>
          {busy ? "正在保存…" : "保存"}
        </Button>
      </ActionRow>
    </form>
  );
}
export function ThemeForm({ item, onSave, onClose }) {
  return (
    <Modal title={item?.id ? "编辑主题" : "新增主题"} onClose={onClose}>
      <Editor
        initial={{
          title: "",
          description: "",
          angles: "",
          tags: "",
          kind: "mixed",
          weight: 1,
          enabled: true,
          ...item,
          poster_key:
            item?.poster_key ||
            posterCatalog.find((p) => p.theme === item?.title)?.id ||
            "none",
        }}
        onSave={onSave}
      >
        {(f, p) => (
          <>
            <Field
              label="主题名称"
              required
              maxLength={200}
              value={f.title}
              onChange={(e) => p("title", e.target.value)}
            />
            <Pick
              label="适用活动"
              value={f.kind}
              onChange={(v) => p("kind", v)}
              options={types}
            />
            <Field label="主题说明">
              <textarea
                value={f.description}
                maxLength={4000}
                rows={3}
                onChange={(e) => p("description", e.target.value)}
              />
            </Field>
            <Field label="解构角度与讨论问题">
              <textarea
                value={f.angles}
                maxLength={6000}
                rows={6}
                onChange={(e) => p("angles", e.target.value)}
                placeholder="每行一个讨论角度或问题"
              />
            </Field>
            <Field
              label="标签"
              value={f.tags}
              onChange={(e) => p("tags", e.target.value)}
            />
            <Pick
              label="主题海报"
              value={
                f.poster_key ||
                posterCatalog.find((p) => p.theme === f.title)?.id ||
                "none"
              }
              onChange={(v) => p("poster_key", v)}
              options={[
                ["none", "暂不设置海报"],
                ...posterCatalog.map((p) => [p.id, p.title + " / " + p.reason]),
              ]}
            />
            <Field
              label="抽取权重（1～10）"
              type="number"
              min={1}
              max={10}
              value={f.weight}
              onChange={(e) => p("weight", Number(e.target.value))}
            />
            <Check
              label="加入候选池"
              checked={f.enabled}
              onChange={(v) => p("enabled", v)}
            />
          </>
        )}
      </Editor>
    </Modal>
  );
}
export function WorkForm({ item, onSave, onClose }) {
  return (
    <Modal
      title={item?.id ? "编辑作品资料" : "手工补全作品"}
      description="请确认具体作品及版本。完整资料需要作者或导演、简介、图片和来源链接。"
      onClose={onClose}
    >
      <Editor
        initial={{
          kind: "book",
          title: "",
          creator: "",
          year: "",
          description: "",
          image: "",
          source_url: "",
          tags: "",
          metadata_status: "pending",
          ...item,
        }}
        onSave={onSave}
      >
        {(f, p) => (
          <>
            <Pick
              label="作品类型"
              value={f.kind}
              onChange={(v) => p("kind", v)}
              options={types.slice(1)}
            />
            <Field
              label="作品名称"
              required
              value={f.title}
              onChange={(e) => p("title", e.target.value)}
            />
            <div className="form-grid">
              <Field
                label="作者 / 导演"
                value={f.creator}
                onChange={(e) => p("creator", e.target.value)}
              />
              <Field
                label="年份 / 出版日期"
                value={f.year}
                onChange={(e) => p("year", e.target.value)}
              />
            </div>
            <Field label="简介">
              <textarea
                rows={5}
                value={f.description}
                onChange={(e) => p("description", e.target.value)}
              />
            </Field>
            <Field
              label="标签"
              value={f.tags}
              onChange={(e) => p("tags", e.target.value)}
            />
            <Field
              label="封面 / 海报 HTTPS 地址"
              type="url"
              value={f.image}
              onChange={(e) => p("image", e.target.value)}
            />
            {f.image && (
              <Cover key={f.image} work={f} className="small-cover" />
            )}
            <Field
              label="资料来源 HTTPS 地址"
              type="url"
              value={f.source_url}
              onChange={(e) => p("source_url", e.target.value)}
            />
            <Check
              label="已确认资料与图片匹配此作品"
              checked={f.metadata_status === "confirmed"}
              onChange={(v) =>
                p("metadata_status", v ? "confirmed" : "pending")
              }
            />
          </>
        )}
      </Editor>
    </Modal>
  );
}
export function CycleForm({ item, themeId, state, users, onSave, onClose }) {
  return (
    <Modal
      wide
      title={item ? "编辑活动" : "发起新一期活动"}
      description="活动发布后将冻结主题、作品及完成规则。截止时间为所选日期北京时间 23:59。"
      onClose={onClose}
    >
      <Editor
        initial={{
          title: "",
          start: today(),
          end: today(),
          kind: "mixed",
          theme_id: themeId || state.themes[0]?.id || "",
          direction: "",
          member_ids: users.filter((u) => !u.disabled).map((u) => u.id),
          work_ids: [],
          rules: { quantity: "all", review: true, discussion: false },
          ...item,
          ...(item
            ? {
                member_ids: Object.keys(item.participants),
                work_ids: item.works.map((w) => w.id),
              }
            : {}),
        }}
        onSave={onSave}
      >
        {(f, p) => (
          <>
            <Field
              label="活动名称"
              required
              value={f.title}
              onChange={(e) => p("title", e.target.value)}
              placeholder="例如：第 01 期 / 离开故乡之后"
            />
            <div className="form-grid">
              <Field
                label="开始日期"
                type="date"
                required
                value={f.start}
                onChange={(e) => p("start", e.target.value)}
              />
              <Field
                label="截止日期"
                type="date"
                required
                min={f.start}
                value={f.end}
                onChange={(e) => p("end", e.target.value)}
              />
              <Pick
                label="活动类型"
                value={f.kind}
                onChange={(v) => p("kind", v)}
                options={types}
              />
              <Pick
                label="本期主题"
                value={f.theme_id}
                onChange={(v) => p("theme_id", v)}
                options={state.themes.map((t) => [t.id, t.title])}
              />
            </div>
            <Field label="本期讨论方向">
              <textarea
                rows={3}
                value={f.direction}
                onChange={(e) => p("direction", e.target.value)}
              />
            </Field>
            <fieldset>
              <legend>参与成员</legend>
              <div className="check-grid">
                {users
                  .filter((u) => !u.disabled)
                  .map((u) => (
                    <Check
                      key={u.id}
                      label={u.name}
                      checked={f.member_ids.includes(u.id)}
                      onChange={(v) =>
                        p(
                          "member_ids",
                          v
                            ? [...f.member_ids, u.id]
                            : f.member_ids.filter((x) => x !== u.id),
                        )
                      }
                    />
                  ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>确定作品（可先留空，筹备时再添加）</legend>
              <div className="check-grid">
                {state.works
                  .filter((w) => f.kind === "mixed" || w.kind === f.kind)
                  .map((w) => (
                    <Check
                      key={w.id}
                      label={`${w.title}${w.metadata_status !== "confirmed" ? "（资料待补全）" : ""}`}
                      checked={f.work_ids.includes(w.id)}
                      onChange={(v) =>
                        p(
                          "work_ids",
                          v
                            ? [...f.work_ids, w.id]
                            : f.work_ids.filter((x) => x !== w.id),
                        )
                      }
                    />
                  ))}
              </div>
            </fieldset>
            <Pick
              label="作品完成要求"
              value={f.rules.quantity}
              onChange={(v) => p("rules", { ...f.rules, quantity: v })}
              options={[
                ["all", "完成全部作品"],
                ["any", "任选一部完成"],
              ]}
            />
            <Check
              label="需要提交所完成作品的评价"
              checked={f.rules.review}
              onChange={(v) => p("rules", { ...f.rules, review: v })}
            />
            <Check
              label="需要参与本期讨论"
              checked={f.rules.discussion}
              onChange={(v) => p("rules", { ...f.rules, discussion: v })}
            />
          </>
        )}
      </Editor>
    </Modal>
  );
}
export function RecordForm({ cycle, userId, state, users, onSave, onClose }) {
  const user = users.find((u) => u.id === userId);
  const [tab, setTab] = useState(cycle.works[0].id);
  const old = state.records.find(
    (r) => r.cycle_id === cycle.id && r.work_id === tab && r.user_id === userId,
  );
  return (
    <Modal
      title={`登记进度 / ${user.name}`}
      description="这里记录本期任务，独立于个人书单或片单。"
      onClose={onClose}
    >
      <Pick
        label="本期作品"
        value={tab}
        onChange={setTab}
        options={cycle.works.map((w) => [w.id, w.title])}
      />
      <Editor
        key={tab}
        initial={{
          cycle_id: cycle.id,
          work_id: tab,
          user_id: userId,
          progress: old?.progress || 0,
          note: old?.note || "",
        }}
        onSave={onSave}
      >
        {(f, p) => (
          <>
            <Field
              label="完成进度（%）"
              type="number"
              min={0}
              max={100}
              required
              value={f.progress}
              onChange={(e) => p("progress", Number(e.target.value))}
            />
            <Field label="个人笔记（本人和管理员可见）">
              <textarea
                rows={5}
                value={f.note}
                onChange={(e) => p("note", e.target.value)}
              />
            </Field>
          </>
        )}
      </Editor>
    </Modal>
  );
}
export function ReviewForm({ cycle, userId, state, onSave, onClose }) {
  const [tab, setTab] = useState(cycle.works[0].id);
  const old = state.reviews.find(
    (r) => r.cycle_id === cycle.id && r.work_id === tab && r.user_id === userId,
  );
  return (
    <Modal
      title="写下本期感想"
      description="评价将对小组成员可见。包含关键情节时，请勾选剧透标记。"
      onClose={onClose}
    >
      <Pick
        label="评价作品"
        value={tab}
        onChange={setTab}
        options={cycle.works.map((w) => [w.id, w.title])}
      />
      <Editor
        key={tab}
        initial={{
          cycle_id: cycle.id,
          work_id: tab,
          user_id: userId,
          rating: old?.rating || 4,
          body: old?.body || "",
          spoiler: old?.spoiler || false,
        }}
        onSave={onSave}
      >
        {(f, p) => (
          <>
            <Pick
              label="评分"
              value={String(f.rating)}
              onChange={(v) => p("rating", Number(v))}
              options={[1, 2, 3, 4, 5].map((v) => [String(v), `${v} 分`])}
            />
            <Field label="书评 / 影评">
              <textarea
                required
                rows={8}
                maxLength={20000}
                value={f.body}
                onChange={(e) => p("body", e.target.value)}
                placeholder="哪个片段改变了你的看法？它与你理解的主题有什么联系？"
              />
            </Field>
            <Check
              label="包含剧透，默认折叠"
              checked={f.spoiler}
              onChange={(v) => p("spoiler", v)}
            />
          </>
        )}
      </Editor>
    </Modal>
  );
}
export function MemberForm({ onSave, onClose }) {
  return (
    <Modal
      title="添加成员"
      description="创建后由管理员向成员提供账号。成员登录后可修改密码。"
      onClose={onClose}
    >
      <Editor
        initial={{ name: "", username: "", credential: "" }}
        onSave={onSave}
      >
        {(f, p) => (
          <>
            <Field
              label="成员名字"
              required
              maxLength={40}
              value={f.name}
              onChange={(e) => p("name", e.target.value)}
            />
            <Field
              label="登录账号"
              required
              pattern="[a-zA-Z0-9_-]{3,40}"
              value={f.username}
              onChange={(e) => p("username", e.target.value)}
            />
            <Field
              label="初始密码（至少 10 位）"
              type={"pass" + "word"}
              autoComplete="new-password"
              required
              minLength={10}
              value={f.credential}
              onChange={(e) => p("credential", e.target.value)}
            />
          </>
        )}
      </Editor>
    </Modal>
  );
}
export function ParticipationForm({ cycle, userId, onSave, onClose }) {
  return (
    <Modal title="本期参与情况" onClose={onClose}>
      <Editor
        initial={{
          cycle_id: cycle.id,
          user_id: userId,
          ...cycle.participants[userId],
        }}
        onSave={onSave}
      >
        {(f, p) => (
          <>
            <Pick
              label="参与状态"
              value={f.status}
              onChange={(v) => p("status", v)}
              options={["joined", "leave", "opted_out"].map((v) => [
                v,
                labels[v],
              ])}
            />
            <Check
              label="已参与本期讨论"
              checked={f.discussion}
              onChange={(v) => p("discussion", v)}
            />
          </>
        )}
      </Editor>
    </Modal>
  );
}
export function RecapForm({ cycle, initial, onSave, onClose }) {
  return (
    <Modal
      title="编辑活动回顾"
      description="总结与成员原始评价分别保存。请核对共识、分歧和引用。"
      onClose={onClose}
    >
      <Editor
        initial={{ cycle_id: cycle.id, body: initial ?? cycle.recap }}
        onSave={onSave}
      >
        {(f, p) => (
          <Field label="活动回顾">
            <textarea
              required
              rows={14}
              value={f.body}
              maxLength={20000}
              onChange={(e) => p("body", e.target.value)}
            />
          </Field>
        )}
      </Editor>
    </Modal>
  );
}
export function CredentialForm({ onSave, onClose }) {
  return (
    <Modal title="修改密码" onClose={onClose}>
      <Editor initial={{ current: "", credential: "" }} onSave={onSave}>
        {(f, p) => (
          <>
            <Field
              label="当前密码"
              type={"pass" + "word"}
              autoComplete="current-password"
              required
              value={f.current}
              onChange={(e) => p("current", e.target.value)}
            />
            <Field
              label="新密码（至少 10 位）"
              type={"pass" + "word"}
              autoComplete="new-password"
              required
              minLength={10}
              value={f.credential}
              onChange={(e) => p("credential", e.target.value)}
            />
          </>
        )}
      </Editor>
    </Modal>
  );
}

export function WorkFilters({ kind, filter, onApply, onClose }) {
  const [k, setK] = useState(kind),
    [f, setF] = useState(filter);
  return (
    <Modal
      className="criterion-filter-panel"
      title="筛选作品"
      description="选择类型与收藏状态，然后应用筛选。"
      onClose={onClose}
    >
      <div className="filter-panel-body">
        <Pick
          label="作品类型"
          value={k}
          onChange={setK}
          options={[
            ["all", "全部作品"],
            ["book", "书籍"],
            ["movie", "电影"],
          ]}
        />
        <Pick
          label="我的收藏 / 资料状态"
          value={f}
          onChange={setF}
          options={[
            ["all", "全部状态"],
            ["wish", "想读 / 想看"],
            ["reading", "进行中"],
            ["done", "已完成"],
            ["pending", "资料待补全"],
          ]}
        />
      </div>
      <ActionRow>
        <Button onClick={() => onApply(k, f)}>应用筛选</Button>
        <Button
          variant="outline"
          onClick={() => {
            setK("all");
            setF("all");
          }}
        >
          重置
        </Button>
      </ActionRow>
    </Modal>
  );
}
