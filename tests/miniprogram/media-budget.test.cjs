const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("packaged images and audio stay within the 200 KB media budget", () => {
  const repo = path.resolve(__dirname, "../..");
  const config = JSON.parse(
    fs.readFileSync(path.join(repo, "project.config.json"), "utf8"),
  );
  const root = path.join(repo, config.miniprogramRoot);
  // These files are hosted remotely and deliberately excluded from the upload.
  const ignoredFiles = new Set(
    config.packOptions.ignore
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.value),
  );
  const media =
    /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|mp3|wav|m4a|aac|ogg|flac)$/i;
  const oversized = [];
  let total = 0;
  let checked = 0;
  function walk(directory, relative = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, name);
      else if (media.test(name) && !ignoredFiles.has(name)) {
        checked++;
        const bytes = fs.statSync(absolute).size;
        total += bytes;
        if (bytes > 200_000) oversized.push(`${name}: ${bytes} bytes`);
      }
    }
  }
  walk(root);
  assert.ok(checked > 0, "media scan must not silently skip all assets");
  assert.deepEqual(oversized, [], oversized.join("\n"));
  assert.ok(total <= 200_000, `packaged media total: ${total} bytes`);
});
