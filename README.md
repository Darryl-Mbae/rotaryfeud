# Rotary Feud — Family Feud Tournament App

A real-time Family Feud tournament game built with React, Node.js, Express, and Socket.io. Supports 6 teams across a full bracket: Round 1 → Semi-Final → Final.

## Tech Stack

- **Frontend**: React 18, React Router v6, Vite
- **Backend**: Node.js, Express, Socket.io
- **Database**: SQLite (via `better-sqlite3`) — zero config, file-based
- **Security**: Helmet, CORS lockdown, rate limiting, HMAC session tokens

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/MacEvelly/Family-Feud.git
cd Family-Feud/server
npm install
cd ../client
npm install
```

### 2. Configure environment

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
HOST_PIN=your-pin-here
SESSION_SECRET=a-long-random-string
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001
LOG_LEVEL=info
```

### 3. Build the client

```bash
cd client
npm run build
```

### 4. Start the server

```bash
cd server
npm start
```

Open `http://localhost:3001`

---

## Development

Run both the server and Vite dev server simultaneously:

```bash
# Terminal 1 — backend
cd server
npm run dev

# Terminal 2 — frontend (hot reload)
cd client
npm run dev
```

Frontend dev server runs on `http://localhost:5173` and proxies API/socket calls to port 3001.

> After any code changes, run `npm run build` in `client/` before testing on port 3001.

---

## How to Play

### Landing page
Everyone opens the same URL. You'll see two options:

- **I'm the Host** — requires the host PIN set in `.env`
- **Join Audience** — requires the room code shared by the host

### Host flow
1. Click **I'm the Host** → enter your PIN
2. You're taken to the **Setup** page — fill in 6 team names
3. A **room code** is displayed — share it with your audience
4. Click **START TOURNAMENT** → you control the game board

### Audience flow
1. Click **Join Audience** → enter the room code from the host
2. You're taken to the audience view — it waits until the host starts
3. The board updates live as the host reveals answers

### Host controls (during game)
- Click answer cards to reveal them
- Press **✗ Wrong** to register a wrong answer (up to 3)
- **Award Team 1 / Team 2** to bank the board score
- **Next Question** to advance
- After Round 1, a leaderboard shows — host proceeds to Semi-Final then Final

---

## Tournament Structure

```
Round 1:   3 matches × 4 questions  (6 teams → top 2 advance)
Semi-Final: 1 match  × 3 questions  (2nd vs 3rd place)
Final:      1 match  × 3 questions  (1st vs semi-final winner)
```

---

## Security Features

| Feature | Details |
|---|---|
| Host authentication | SHA-256 hashed PIN, HMAC-signed session token (8hr expiry) |
| Audience authentication | Room code validated server-side |
| Input sanitization | Team names stripped of HTML/XSS on the server |
| Rate limiting | 100 req/15min (API), 10 req/15min (auth), 30 actions/10s (socket) |
| CORS | Locked to `ALLOWED_ORIGINS` in `.env` |
| Security headers | Helmet.js |

---

## Project Structure

```
Family-Feud/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.jsx       # Entry — host or audience choice
│   │   │   ├── HostLogin.jsx     # PIN login → issues token + room code
│   │   │   ├── AudienceJoin.jsx  # Room code entry for audience
│   │   │   ├── Registration.jsx  # Host sets up teams
│   │   │   ├── Host.jsx          # Host game view
│   │   │   ├── Audience.jsx      # Audience game view
│   │   │   ├── Leaderboard.jsx   # Between rounds
│   │   │   └── Winner.jsx        # End screen
│   │   ├── components/
│   │   │   └── GameBoard.jsx     # Shared board (host + audience)
│   │   └── useGameState.js       # Socket state hook
│   └── vite.config.js
└── server/
    ├── index.js                  # Express + Socket.io server
    ├── db.js                     # SQLite — sessions & PIN storage
    ├── logger.js                 # Winston logger
    ├── validation.js             # Action validation & sanitization
    ├── .env                      # Your config (not committed)
    ├── .env.example              # Template
    ├── data/                     # SQLite database file (auto-created)
    └── logs/                     # Log files (auto-created)
```

---

## Deployment (Render)

A `render.yaml` is included. Set these environment variables in your Render dashboard:

- `HOST_PIN`
- `SESSION_SECRET`
- `ALLOWED_ORIGINS` — your production domain
- `NODE_ENV=production`

Build command: `cd client && npm install && npm run build`  
Start command: `cd server && npm install && node index.js`
