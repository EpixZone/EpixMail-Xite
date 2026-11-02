const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");

function composer(Page) {
  const app = vm.createContext({Page, _: text => text, Animation: {scramble() {}}});
  app.window = app;
  for (const script of ["utils/LogMixin", "utils/Crypto", "utils/Autocomplete", "MessageCreate"]) {
    const file = path.resolve(__dirname, "../../js", script + ".js");
    vm.runInContext(readFileSync(file, "utf8"), app);
  }

  return new app.MessageCreate();
}

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
  const compose = composer(Page);
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

test("committed input separates recipients while preserving IME composition and the unfinished name", async () => {
  const compose = composer({
    projector: {scheduleRender() {}},
    channel: {async keyLookup([xid]) { return {[xid]: {has_bundle: true}}; }}
  });
  const attrs = compose.autocomplete.attrs;
  const input = {value: "Bob ", selectionStart: 4, setSelectionRange(start) { this.selectionStart = start; }};
  attrs.oninput({target: input, isComposing: true});
  assert.equal(compose.to_list.length, 0);
  assert.equal(input.value, "Bob ");
  attrs.oncompositionend({target: input});
  assert.deepEqual(Array.from(compose.to_list, chip => chip.name), ["bob"]);
  assert.equal(input.value, "");

  input.value = "carol,bob.epix da";
  input.selectionStart = input.value.length;
  attrs.oninput({target: input});
  assert.deepEqual(Array.from(compose.to_list, chip => chip.name), ["bob", "carol"]);
  assert.equal(input.value, "da");
  assert.equal(attrs.value, "da");
  assert.equal(input.selectionStart, 2);
});

test("only a confirmed missing xID is reported as unregistered", async () => {
  const calls = [];
  const compose = composer({
    projector: {scheduleRender() {}},
    channel: {
      async keyLookup([xid]) {
        if (xid === "localerror.epix") throw new Error("channel unavailable");
        return {[xid]: {has_bundle: xid === "local.epix"}};
      }
    },
    async cmd(command, [xid]) {
      assert.equal(command, "xidResolveName");
      calls.push(xid);
      if (xid === "missing.epix") throw {error: "name not found: missing.epix"};
      if (xid === "offline.epix") throw {error: "rpc request failed: gateway not found"};
      if (xid === "empty.epix") return null;
      return {name: "keyless", tld: "epix"};
    }
  });

  for (const name of ["local", "keyless", "missing", "offline", "empty", "localerror"]) compose.addRecipient(name);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["keyless.epix", "missing.epix", "offline.epix", "empty.epix"]);
  const [local, keyless, missing, ...unverified] = compose.to_list;
  assert.equal(local.valid, true);
  assert.equal(keyless.valid, true);
  assert.equal(local.reason, keyless.reason);
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "No registered xID named missing.epix.");
  for (const chip of unverified) {
    assert.equal(chip.valid, null);
    assert.equal(chip.checking, false);
    assert.equal(chip.reason, `Could not verify ${chip.name}.epix. Remove it and try again.`);
  }
});
