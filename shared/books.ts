export const books = [
  {
    "id": "story01",
    "title": "The Missing Map",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🗺️",
    "color": "#e7b65b",
    "badge": "The Missing Map Explorer"
  },
  {
    "id": "story02",
    "title": "The Garden Gate",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🌿",
    "color": "#bc9cde",
    "badge": "The Garden Gate Explorer"
  },
  {
    "id": "story03",
    "title": "The Lantern Walk",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🏮",
    "color": "#a6c5ac",
    "badge": "The Lantern Walk Explorer"
  },
  {
    "id": "story04",
    "title": "The Pocket Notebook",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "📒",
    "color": "#f3b1ac",
    "badge": "The Pocket Notebook Explorer"
  },
  {
    "id": "story05",
    "title": "The River Bridge",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🌉",
    "color": "#91cbd2",
    "badge": "The River Bridge Explorer"
  },
  {
    "id": "story06",
    "title": "The Kite Workshop",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🪁",
    "color": "#e7b65b",
    "badge": "The Kite Workshop Explorer"
  },
  {
    "id": "story07",
    "title": "The Clock Repair",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🕰️",
    "color": "#bc9cde",
    "badge": "The Clock Repair Explorer"
  },
  {
    "id": "story08",
    "title": "The Library Box",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "📦",
    "color": "#a6c5ac",
    "badge": "The Library Box Explorer"
  },
  {
    "id": "story09",
    "title": "The Hilltop Picnic",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🧺",
    "color": "#f3b1ac",
    "badge": "The Hilltop Picnic Explorer"
  },
  {
    "id": "story10",
    "title": "The Seed Exchange",
    "author": "Original sample story",
    "date": "",
    "read": false,
    "icon": "🌱",
    "color": "#91cbd2",
    "badge": "The Seed Exchange Explorer"
  }
];
export const badgeDefinitions = [
  ...books.map((b) => ({
    id: "master-" + b.id,
    name: b.badge,
    icon: b.icon,
    color: b.color,
    rule: "Attempt every available question in this book on each of two different days, with at least 90% correct without help each day.",
  })),
  ...[1, 3, 5, 10].map((n, i) => ({
    id: "read-" + n,
    name: ["First Chapter", "Shelf Explorer", "Halfway Hero", "Top Reader"][i],
    icon: "📚",
    color: "#ecc66e",
    rule: `Confirm your reading progress with ${n} books marked as read.`,
  })),
  ...[2, 10].map((n) => ({
    id: "masters-" + n,
    name: n === 2 ? "Double Master" : "Master Collection",
    icon: "🏆",
    color: "#bfa9e4",
    rule: `Earn mastery badges for ${n} books.`,
  })),
  ...[3, 5, 7, 14].map((n) => ({
    id: "streak-" + n,
    name: n + "-day Voyage",
    icon: "⚡",
    color: "#eaa5a0",
    rule: `Practice on ${n} consecutive days. A day counts after a session with 5 questions, or all questions if fewer are available.`,
  })),
  ...[30, 60, 120, 300].map((n) => ({
    id: "minutes-" + n,
    name: n === 30 ? "Getting Going" : n / 60 + "-hour Explorer",
    icon: "⏱",
    color: "#9bcbd2",
    rule: `Spend ${n} active minutes practicing. Idle and hidden time do not count.`,
  })),
  {
    id: "first",
    name: "First Quest",
    icon: "🚩",
    color: "#a8cba8",
    rule: "Complete your first qualifying practice session.",
  },
  {
    id: "comeback",
    name: "Comeback Kid",
    icon: "↗",
    color: "#efb393",
    rule: "Recall a previously missed answer without help in a later session.",
  },
  ...[10, 50].map((n) => ({
    id: "recall-" + n,
    name: n === 10 ? "Finding Your Feet" : "Recall Ranger",
    icon: String(n),
    color: "#a3bde3",
    rule: `Answer ${n} different questions correctly without help.`,
  })),
  {
    id: "mix",
    name: "Mix Master",
    icon: "🧭",
    color: "#c2b0e3",
    rule: "Practice questions from 3 books in one mixed session.",
  },
  {
    id: "sessions",
    name: "Back for More",
    icon: "⛵",
    color: "#edca7b",
    rule: "Complete 10 qualifying practice sessions.",
  },
];
