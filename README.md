# Epix Mail

Encrypted peer-to-peer mail on [EpixNet](https://epixnet.io), with a Gmail-style interface and group conversations. The connected EpixNet node encrypts and decrypts messages; use a node you trust.

## Features

- Message encryption through the EpixNet node’s channel API
- Group conversations: send to many recipients, replies go to every member (reply-all), the whole thread is readable by the whole group
- Gmail-style layout: conversation list, thread view with inline reply, folders
- Folders: Inbox (unread badge), Starred, Archived, Junk, Sent
- Junk: mark a sender as spam and their current and future conversations move to Junk
- Search over the connected node’s decrypted mail index (subject, body, participants)
- Contacts page with per-person message button and spam toggle
- Live updates: new mail appears as it syncs, no refresh needed
- xID identity integration (avatars and directory names come from the chain)
- Markdown in message bodies
- Deep link: `?to=<name>` opens the composer prefilled (used by the Epix Post profile Message button)
- Responsive: desktop rail, icon rail on narrow windows, top bar + bottom nav + FAB on mobile; light and dark themes
- 10 language translations, resolved client-side

## Structure

```
epix1pvta40a8d944w3npr9ztqrfh3wec53hh2je4fa/
├── index.html
├── content.json
├── LICENSE                # MIT
├── css/
│   └── all.css            # Token-based stylesheet (Epix UI kit, indigo accent)
├── img/
│   └── logo.svg
├── js/
│   ├── EpixMail.js        # Main app: routing, settings, live updates
│   ├── Shell.js           # Rail / top bar / bottom nav / account block
│   ├── StartScreen.js     # Onboarding (choose xID, generate keys)
│   ├── User.js            # Identity and mailbox state
│   ├── Channel.js         # Node channel API calls
│   ├── ThreadStore.js     # Loads and presents threads from the node
│   ├── Message.js         # Conversation list row
│   ├── MessageList.js     # Generic folder view (full reconcile by key)
│   ├── MessageListThreads.js  # Inbox/Starred/Archived/Junk filters
│   ├── MessageListSent.js # Flat sent view
│   ├── MessageLists.js    # Folder registry + search state
│   ├── MessageThread.js   # Thread view with inline reply-all
│   ├── MessageCreate.js   # Compose modal with recipient chips
│   ├── SearchBar.js
│   ├── ContactsPage.js
│   ├── lib/               # Maquette, EpixFrame, marked
│   └── utils/             # Crypto, Animation, Menu, Translate, SearchIndex, ...
├── languages/             # es, fa, it, nl, pl, pt-br, sk, sl, zh, zh-tw
└── data-default/
    └── users/
        └── content-default.json
```

## Message processing and privacy

`js/Channel.js` calls the connected node's `channelSessionInfo`, `channelSend`,
`channelThreads`, `channelConversation`, and `channelSearch` commands. The node
handles message encryption, decryption, indexing, and search. This replaces the
legacy per-user mail-file architecture described in earlier versions of this README.

Message content is plaintext in the mail UI and in the node while being processed.
The node maintains a local decrypted index. Its optional `channel_encrypt_at_rest`
setting is off by default in the current node source; do not assume that message
content or local files are always encrypted at rest. Device access, recipients,
and the operator of a remote node remain trust considerations. Encryption does
not prevent a recipient from copying or sharing a message.

xID integration and peer networking use supporting network infrastructure.
The application does not provide a guarantee of anonymity or delivery.

## Tech stack

- Vanilla ES6 JavaScript (no build step)
- Maquette virtual DOM
- EpixFrame WebSocket bridge
- Channel encryption and storage via the EpixNet node
- All JS wrapped in IIFEs

## Release steps (site owner)

1. Validate the xite against the target EpixNet node version and its channel API.
2. Sign the changed xite content and publish it using the owner's signing workflow.
   Source changes alone do not update signed content already distributed to peers.

## License

MIT
