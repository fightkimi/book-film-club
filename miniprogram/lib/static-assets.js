const { baseUrl } = require("../config");
const base = baseUrl + "/mini-assets/v161/";
const media = base + "v163/";
module.exports = {
  login: media + "film/hirayama-reading-room.jpg",
  themeProjector: media + "motion/theme-projector.gif",
  themePosters: {
    "cinema-paradiso": media + "themes/cinema-paradiso.jpg",
    rashomon: media + "themes/rashomon.jpg",
    "the-truman-show": media + "themes/the-truman-show.jpg",
    "in-the-mood-for-love": media + "themes/in-the-mood-for-love.jpg",
    her: media + "themes/her.jpg",
    "lost-in-translation": media + "themes/lost-in-translation.jpg",
  },
  paterson: base + "paterson.jpg",
  sisters: base + "sisters.jpg",
  bookshop: base + "bookshop.jpg",
  board: base + "october.jpg",
  lekaiOne: base + "sh-lekai-1.jpg",
  lekaiTwo: base + "sh-lekai-2.jpg",
  potatoOne: base + "sh-giant-potato-1.jpg",
  potatoTwo: base + "sh-giant-potato-2.jpg",
};
