const http = require("http");

const options = {
  hostname: "localhost",
  port: 3001,
  path: "/api/form-info/inputs",
  method: "GET",
};

const req = http.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Body:", body);
  });
});

req.on("error", (e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

req.end();
