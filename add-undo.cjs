const fs = require("fs");
const p = __dirname + "/styles.css";
let s = fs.readFileSync(p, "utf8");
const marker = ".toast.error { border-left-color: var(--debit); }\r\n";
if (!s.includes(marker)) { console.error("marker missing"); process.exit(1); }
const add = marker + "\r\n/* Undo button inside a toast. */\r\n.toast .toast-undo {\r\n  background: transparent;\r\n  color: var(--accent);\r\n  border: none;\r\n  font-weight: 600;\r\n  font-size: 0.85rem;\r\n  padding: 0 0 0 10px;\r\n  cursor: pointer;\r\n}\r\n.toast .toast-undo:hover { text-decoration: underline; }\r\n";
fs.writeFileSync(p, s.replace(marker, add), "utf8");
console.log("undo style added");
