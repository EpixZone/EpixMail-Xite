const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");

test("a phone keyboard's capitalized xID sends once to the registered name", async () => {
  const lookups = [];
  const deliveries = [];
  const Page = {
    projector: {scheduleRender() {}},
    channel: {
      async keyLookup(xids) {
        lookups.push(...xids);
        return {"bob.epix": {has_bundle: true}};
      }
    },
    user: {
      publickey: true,
      sendMessage(recipients, subject, body) {
        deliveries.push({recipients: Array.from(recipients), subject, body});
      }
    }
  };
  const app = vm.createContext({Page, Animation: {scramble() {}}});
  app.window = app;
  for (const script of ["utils/LogMixin", "utils/Crypto", "utils/Autocomplete", "MessageCreate"]) {
    const file = path.resolve(__dirname, "../../js", script + ".js");
    vm.runInContext(readFileSync(file, "utf8"), app);
  }

  const compose = new app.MessageCreate();
  compose.node = {querySelector() {}, querySelectorAll() { return []; }};
  compose.subject = "Subject";
  compose.body = "Body";
  compose.addRecipient("Bob");
  compose.addRecipient("BOB.EPIX");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(lookups, ["bob.epix"]);
  assert.equal(compose.isFilled(), true);

  compose.handleSendClick();
  assert.deepEqual(deliveries, [{recipients: ["bob.epix"], subject: "Subject", body: "Body"}]);
});
