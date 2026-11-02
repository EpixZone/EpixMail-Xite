const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadApp(cmd) {
  const page = {
    cmd,
    user: {getMyXid: () => "alice"},
    projector: {scheduleRender() {}}
  };
  const context = vm.createContext({Page: page, location: {pathname: "/"}, marked: {Renderer: class {}}});
  context.window = context;
  for (const file of ["utils/Deferred", "utils/Crypto", "Channel", "ThreadStore", "utils/Text", "utils/Autocomplete"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js", file + ".js"), "utf8"), context);
  }
  page.channel = new context.Channel(page);
  return {context, page, store: new context.ThreadStore()};
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("contacts come from all pages of this identity's mail, including sent-only and archived threads", async () => {
  const sent = {members: JSON.stringify(["ALICE.EPIX", "bob", "Bob.EPIX", null, 8, " "])};
  const inbox = Array(500).fill(sent).concat({members: '["alice.epix","older.epix"]'});
  const archive = [{peer_xid: "legacy.epix", members: "not JSON"}, {members: '["bob","group.epix"]'}];
  const calls = [];
  const {store} = loadApp((command, [params], reply) => {
    assert.equal(command, "channelThreads");
    assert.equal(params.app, "mail");
    const {folder, offset, limit} = params;
    calls.push([folder, offset]);
    const source = folder === "archived" ? archive : inbox;
    reply({threads: source.slice(offset, offset + limit)});
  });

  assert.deepEqual([...store.getContacts()], []);
  await flush();
  const count = calls.length;
  assert(calls.some(([folder, offset]) => folder === "all" && offset > 0));
  for (let i = 0; i < 4; i++) {
    assert.deepEqual([...store.getContacts()], ["bob.epix", "group.epix", "legacy.epix", "older.epix"]);
  }
  await flush();
  assert.equal(calls.length, count);
});

test("account switch clears visible contacts and prevents a late reply restoring them", async () => {
  const pending = [];
  const {store, page} = loadApp((command, params, reply) => pending.push(reply));
  store.getContacts();
  pending.shift()({threads: [{peer_xid: "first.epix"}]});
  await flush();
  pending.shift()({threads: []});
  await flush();
  assert.deepEqual([...store.getContacts()], ["first.epix"]);

  store.invalidate();
  store.getContacts();
  const late = pending.shift();
  page.user.getMyXid = () => "other";
  store.reset();
  assert.deepEqual([...store.getContacts()], []);
  pending.shift()({threads: [{members: '["other.epix","second.epix"]'}]});
  await flush();
  pending.shift()({threads: []});
  late({threads: [{peer_xid: "stale.epix"}]});
  await flush();
  assert.deepEqual([...store.getContacts()], ["second.epix"]);
});

test("autocomplete highlights typed literals and renders contact names as text", () => {
  const {context} = loadApp(() => {});
  context.h = (selector, properties, children) => ({selector, properties, children});
  const name = "a[<img src=x onerror=alert(1)>]";
  const autocomplete = new context.Autocomplete(() => [name], {});
  assert.deepEqual([...autocomplete.filterValues("[")], [name]);
  const parts = Array.from(autocomplete.highlightedName(name, "["));
  assert.equal(parts[1].selector, "b");
  assert.equal(parts[1].children, "[");
  assert.equal(parts[2], "<img src=x onerror=alert(1)>]");
});
