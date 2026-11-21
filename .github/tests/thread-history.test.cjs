const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function mailbox(channel) {
  const page = {
    channel,
    user: {getMyXid: () => "alice"},
    projector: {scheduleRender() {}}
  };
  const context = vm.createContext({Page: page, LogMixin: {}, h() {}, _: text => text});
  context.window = context;
  for (const script of ["utils/Deferred", "ThreadStore", "MessageThread"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js", script + ".js"), "utf8"), context);
  }
  page.thread_store = new context.ThreadStore();
  return {store: page.thread_store, view: new context.MessageThread()};
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const reply = {msg_id: 11, dir: "in", sender_xid: "bob.epix", body: "Reply"};
const summary = {conv_id: "first", members: ["alice.epix", "bob.epix"], subject: "Wallet Testing"};

test("a deep link outside the first page opens the indexed conversation and preserves its members", async () => {
  const inbox = Array.from({length: 100}, (_, i) => ({conv_id: "new-" + i})).concat(summary);
  const reads = [];
  const {store, view} = mailbox({
    async threads(folder, offset, limit) { return folder === "all" ? inbox.slice(offset, offset + limit) : []; },
    async sent() { return []; },
    async conversation(id) { reads.push(id); return [reply]; }
  });

  view.setConvId("first");
  await flush();
  assert.equal(store.getThread("first"), null);
  view.renderNotFound();
  await flush();
  const thread = view.getThread();
  await flush();
  assert.equal(thread, view.getThread());
  assert.deepEqual([...thread.members], summary.members);
  assert.equal(thread.thread_messages[0].body, "Reply");
  assert.deepEqual(reads, ["first"]);
});

test("archived history loads with the inbox and stays outside the inbox badge", async () => {
  const {store} = mailbox({
    async threads(folder) { return folder === "archived" ? [{...summary, archived: true, unread: 1}] : []; },
    async sent() { return []; },
    async conversation() { return [reply]; }
  });
  store.load();
  await flush();
  const thread = store.getThread("first");
  await flush();
  assert.equal(thread.folder, "archived");
  assert.equal(thread.thread_messages.length, 1);
  assert.equal(store.unreadCount(), 0);
});

test("a delayed mailbox snapshot cannot replace a newer sync result", async () => {
  const pending = [];
  const {store} = mailbox({
    threads(folder) { return folder === "all" ? new Promise(r => pending.push(r)) : Promise.resolve([]); },
    async sent() { return []; }
  });
  store.load();
  store.load();
  pending[1]([{...summary, msg_count: 3}]);
  await flush();
  pending[0]([{...summary, msg_count: 1}]);
  await flush();
  assert.equal(store.threads[0].thread_count, 3);
});
