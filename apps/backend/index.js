// Compatibility shim: `node index.js` === `node src/server.js`.
// Prefer `npm start` / `npm run dev` (they run src/server.js directly).
require("./src/server");
