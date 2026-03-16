# Epix Mail

End-to-end encrypted P2P messaging on [EpixNet](https://epixnet.io).

## Features

- ECIES end-to-end encryption
- ECDSA message signing for authentication
- Conversation-based threading
- Inbox and sent message views
- Contact list with autocomplete
- xID identity integration
- Markdown support in messages
- Real-time message delivery
- 10 language translations

## Structure

```
epix1pvta40a8d944w3npr9ztqrfh3wec53hh2je4fa/
├── index.html
├── content.json
├── dbschema.json          # EpixMail DB (v2)
├── LICENSE                # MIT
├── css/
│   └── all.css            # Bundled stylesheet
├── js/
│   ├── EpixMail.js        # Main app (extends EpixFrame)
│   ├── Leftbar.js         # Navigation sidebar
│   ├── StartScreen.js     # Welcome screen
│   ├── User.js            # User profile and conversations
│   ├── Users.js           # Contact list
│   ├── Message.js         # Message model
│   ├── MessageCreate.js   # Compose form
│   ├── MessageList.js     # Base message list
│   ├── MessageListInbox.js
│   ├── MessageListSent.js
│   ├── MessageLists.js    # List container
│   ├── MessageShow.js     # Message detail view
│   ├── lib/               # Maquette, EpixFrame, marked, Base64Number
│   └── utils/             # Crypto, Animation, Autocomplete, Text, etc.
├── languages/             # es, fa, it, nl, pl, pt-br, sk, sl, zh, zh-tw
└── data-default/
    └── users/
        └── content-default.json
```

## Database

- **File:** `data/users/epixmail.db`
- **Tables:** `conversation` (conv_id, peer_xid, established, my_seq)

## Encryption

Messages are encrypted with ECIES using recipient public keys and signed with ECDSA. Conversation IDs are derived from sorted xID pairs via SHA-256. All encryption happens client-side.

## Tech Stack

- Vanilla ES6 JavaScript (no build step)
- Maquette virtual DOM
- EpixFrame WebSocket bridge
- Built-in ECIES/ECDSA via EpixNet wrapper
- All JS wrapped in IIFEs

## License

MIT
