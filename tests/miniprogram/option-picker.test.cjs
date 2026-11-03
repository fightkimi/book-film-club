const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../miniprogram");

test("readable picker searches labels, keeps source indices and only commits a tapped option", () => {
  let config;
  vm.runInNewContext(
    fs.readFileSync(
      path.join(root, "components/option-picker/index.js"),
      "utf8",
    ),
    {
      Component(value) {
        config = value;
      },
    },
  );
  const calls = [];
  const p = {
    ...config.methods,
    data: {
      ...config.data,
      range: [
        { title: "全部" },
        { title: "离开故乡之后" },
        { title: "城市里的陌生人" },
      ],
      value: 1,
      rangeKey: "title",
    },
    setData(update) {
      Object.assign(this.data, update);
    },
    triggerEvent(name, detail) {
      calls.push([name, detail.value]);
    },
  };
  p.open();
  assert.equal(p.data.anchor, "option-1");
  p.search({ detail: { value: "城市" } });
  assert.equal(p.data.rows.length, 1);
  assert.equal(p.data.rows[0].index, 2);
  p.pick({ currentTarget: { dataset: { index: 2 } } });
  assert.deepEqual(calls, [["change", 2]]);
  assert.equal(p.data.opened, false);
  p.open();
  p.search({ detail: { value: "没有此项" } });
  assert.equal(p.data.rows.length, 0);
  p.close();
  assert.equal(calls.length, 1);
  p.data.disabled = true;
  p.open();
  p.pick({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(calls.length, 1);
  p.data.disabled = false;
  p.data.range = [1, 2, 3];
  p.data.rangeKey = "";
  p.open();
  assert.equal(p.data.rows[2].label, "3");
});
test("all categorical picker fields use the shared sheet; native dates keep their constraints", () => {
  let fields = 0,
    dates = 0;
  for (const name of fs.readdirSync(path.join(root, "pages"))) {
    const p = path.join(root, "pages", name, "index.wxml");
    if (!fs.existsSync(p)) continue;
    const wxml = fs.readFileSync(p, "utf8");
    fields += (wxml.match(/<option-picker\b/g) || []).length;
    for (const tag of wxml.match(/<picker\b[^>]*>/g) || []) {
      assert.match(tag, /mode="date"/);
      dates++;
    }
  }
  assert.ok(fields >= 20);
  assert.equal(dates, 2);
});

test("grouped filters open as a directory, then select a single full-width option by original index", () => {
  let definition;
  vm.runInNewContext(
    fs.readFileSync(
      path.join(root, "components/option-picker/index.js"),
      "utf8",
    ),
    {
      Component: (c) => {
        definition = c;
      },
    },
  );
  const range = [
    { label: "全部主题", section: "", count: 9 },
    { label: "城市里的陌生人", section: "小组主题", count: 1 },
    { label: "离开故乡之后", section: "小组主题", count: 2 },
    { label: "剧情", section: "作品题材", count: 4 },
    { label: "未归类", section: "", count: 1 },
  ];
  const calls = [];
  const p = {
    ...definition.methods,
    data: {
      ...definition.data,
      range,
      rangeKey: "label",
      grouped: true,
      value: 2,
    },
    setData(o) {
      Object.assign(this.data, o);
    },
    triggerEvent(n, d) {
      calls.push(d.value);
    },
  };
  p.open();
  assert.deepEqual(
    Array.from(p.data.rows, (r) => r.opens || r.label),
    ["全部主题", "小组主题", "作品题材", "未归类"],
  );
  assert.equal(p.data.rows[1].activeLabel, "离开故乡之后");
  p.enterSection({ currentTarget: { dataset: { section: "小组主题" } } });
  assert.deepEqual(
    Array.from(p.data.rows, (r) => r.index),
    [1, 2],
  );
  p.backToGroups();
  assert.equal(p.data.rows.length, 4);
  assert.equal(calls.length, 0);
  p.enterSection({ currentTarget: { dataset: { section: "作品题材" } } });
  p.pick({ currentTarget: { dataset: { index: 3 } } });
  assert.deepEqual(calls, [3]);
});
