function accepts(work, kind) {
  return !!work && (kind === "mixed" || work.kind === kind);
}

function choices(works, kind, query) {
  const q = String(query || "").trim().toLowerCase();
  const matches = works.filter(work => accepts(work, kind) && (!q || [
    work.title, work.creator, work.extra?.original_title, ...(work.extra?.aliases || []),
  ].join(" ").toLowerCase().includes(q)));
  if (kind !== "mixed") return matches;
  // A mixed event should expose both media in its first page of choices.
  const books = matches.filter(w => w.kind !== "movie");
  const movies = matches.filter(w => w.kind === "movie");
  const rows = [];
  for (let i = 0; i < Math.max(books.length, movies.length); i++) {
    if (books[i]) rows.push(books[i]);
    if (movies[i]) rows.push(movies[i]);
  }
  return rows;
}

function existing(api, work) {
  return api.get()?.state.works.find(w => w.kind === "movie" &&
    w.provider === "tmdb" && String(w.source_id) === String(work.source_id));
}

async function resolve(api, work) {
  const known = existing(api, work);
  if (known) return known;
  const preview = await api.request("/api/metadata/detail", {
    provider: "tmdb", source_id: work.source_id,
  });
  if (!preview.token || preview.item?.kind !== "movie" || preview.item.provider !== "tmdb" ||
      String(preview.item.source_id) !== String(work.source_id))
    throw new Error("电影资料不匹配，请重新选择");
  try {
    // Use the existing server-issued preview token, never client-supplied metadata.
    return (await api.action("metadata.import", {token: preview.token})).result;
  } catch (error) {
    if (error.status && error.status !== 409) throw error;
    // A concurrent import or a lost success response must not add a duplicate.
    await api.refresh(true);
    const imported = existing(api, work);
    if (imported) return imported;
    throw error;
  }
}

module.exports = {accepts, choices, resolve};
