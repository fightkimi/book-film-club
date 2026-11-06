const config = require("../config");

function posterUrl(image, size = "w342") {
  const poster =
    /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/([A-Za-z0-9_-]{1,100}\.jpg)$/.exec(
      image || "",
    );
  if (!poster || !config.baseUrl.startsWith("https://")) return image;
  return (
    config.baseUrl +
    "/media/tmdb/" +
    (size === "w500" ? "w500" : "w342") +
    "/" +
    poster[1]
  );
}

function coverThumbnail(url) {
  if (/^https:\/\/cdn\.weread\.qq\.com\/[^?#]+\/t9_[^/?#]+$/.test(url))
    return url.replace(/\/t9_([^/]+)$/, "/t6_$1");
  if (/^https:\/\/wfqqreader-1252317822\.image\.myqcloud\.com\/[^?#]+\.jpe?g$/i.test(url))
    return url + "?imageMogr2/thumbnail/180x240%3E";
  return posterUrl(url);
}
module.exports = { posterUrl, coverThumbnail };
