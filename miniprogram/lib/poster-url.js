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

module.exports = { posterUrl };
