const request = require("supertest");
const app = require("../../src/app");

const USERNAME = "admin";
const PASSWORD = "admin1";

async function main() {
  const agent = request.agent(app);

  const loginRes = await agent
    .post("/api/auth/login")
    .send({ username: USERNAME, password: PASSWORD })
    .expect("Content-Type", /json/);

  if (loginRes.body.error) process.exit(1);

  const formsRes = await agent.get("/api/form-info/forms");
  const inputsRes = await agent.get("/api/form-info/inputs");

  console.log("forms:", formsRes.status, "inputs:", inputsRes.status);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
