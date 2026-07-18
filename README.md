# Epix Mail

End-to-end encrypted P2P mail on [EpixNet](https://epixnet.io), with a Gmail-style interface and group conversations.

## Features

- ECIES end-to-end encryption, ECDSA message signing
- Group conversations: send to many recipients, replies go to every member (reply-all), the whole thread is readable by the whole group
- Gmail-style layout: conversation list, thread view with inline reply, folders
- Folders: Inbox (unread badge), Starred, Archived, Junk, Sent
- Junk: mark a sender as spam and their current and future conversations move to Junk
- Client-side search over decrypted mail (subject, body, participants)
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
├── dbschema.json          # EpixMail DB (conversation table with members)
├── LICENSE                # MIT
├── css/
│   └── all.css            # Token-based stylesheet (Epix UI kit, indigo accent)
├── img/
│   └── logo.svg
├── js/
│   ├── EpixMail.js        # Main app: routing, settings, live updates
│   ├── Shell.js           # Rail / top bar / bottom nav / account block
│   ├── StartScreen.js     # Onboarding (choose xID, generate keys)
│   ├── User.js            # Own mailbox: keys, send path, quota guard
│   ├── ThreadStore.js     # Discovers, decrypts and assembles all threads
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

## Data model

Each user owns one signed file, `data/users/<name>.epix/data.json`:

- `publickey`: the ECIES public key others encrypt to (derived from the xID identity)
- `conversations`: keyed by a random 64-hex `conv_id`
  - `members`: canonical sorted list of every participant (fixed at creation)
  - `peer_xid`: first non-self member, kept so old clients still work
  - `messages`: keyed by timestamp; each message carries one ciphertext per member (`ct`), so every member can read every reply

Each participant writes only their own messages into their own file; the inbox assembles a thread from every member's file and orders messages by timestamp with a deterministic tiebreak.

## Database

- **File:** `data/users/epixmail.db`
- **Tables:** `conversation` (conv_id, peer_xid, members, established, my_seq)
- Discovery: conversations that name me via `peer_xid` (legacy 1:1) or the `members` JSON list

## Encryption

Messages are encrypted with ECIES once per member using their published public keys and signed with ECDSA. Read/starred/archived/junk state stays in private per-user settings on the node, never in the shared files. All encryption happens client-side through the node's crypto API; private keys never reach the page.

## Tech stack

- Vanilla ES6 JavaScript (no build step)
- Maquette virtual DOM
- EpixFrame WebSocket bridge
- Built-in ECIES/ECDSA via the EpixNet node
- All JS wrapped in IIFEs

## Release steps (site owner)

1. `siteSign data/users/content.json` (the per-user `max_size` was raised to 1 MB for group mail), then `siteSign content.json`, then publish.
2. Ship the user-content quota change before or together with the app update: peers reject oversized mailboxes until they have the new rules.

## License

MIT
