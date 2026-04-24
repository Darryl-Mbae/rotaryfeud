const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT      = process.env.PORT || 3001;
const CLIENT_DIST = path.join(__dirname, '../client/dist');

app.use(cors());
app.use(express.json());

// Serve the built React app
app.use(express.static(CLIENT_DIST));

// ── Game state (single source of truth) ──────────────────────────────────────
let gameState = {
  phase: 'registration', // registration | game | leaderboard | winner
  tournament: {
    teams: [],
    currentRound: 'setup',
    currentMatch: 0,
    matches: [],
    questionsAnswered: 0
  },
  currentQ: 0,
  wrong: 0,
  flippedCards: [],
  boardScore: 0
};

function resetState() {
  gameState = {
    phase: 'registration',
    tournament: {
      teams: [],
      currentRound: 'setup',
      currentMatch: 0,
      matches: [],
      questionsAnswered: 0
    },
    currentQ: 0,
    wrong: 0,
    flippedCards: [],
    boardScore: 0
  };
}

// ── REST: state snapshot for page-load / refresh ──────────────────────────────
app.get('/api/state', (req, res) => res.json(gameState));

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Send current state immediately so refreshed clients catch up
  socket.emit('stateSync', gameState);

  socket.on('action', (action) => {
    handleAction(action);
  });
});

function broadcast() {
  io.emit('stateSync', gameState);
}

function handleAction(action) {
  switch (action.type) {

    case 'START_TOURNAMENT': {
      const teams = action.teams.map((name, i) => ({
        id: i,
        name: name || `Team ${i + 1}`,
        score: 0
      }));
      gameState.tournament.teams = teams;
      gameState.tournament.currentRound = 'round1';
      gameState.tournament.matches = [
        { team1: 0, team2: 1, questions: 4 },
        { team1: 2, team2: 3, questions: 4 },
        { team1: 4, team2: 5, questions: 4 }
      ];
      gameState.tournament.currentMatch = 0;
      gameState.tournament.questionsAnswered = 0;
      gameState.currentQ = 0;
      gameState.wrong = 0;
      gameState.flippedCards = [];
      gameState.boardScore = 0;
      gameState.phase = 'game';
      break;
    }

    case 'FLIP_CARD': {
      const idx = gameState.flippedCards.indexOf(action.cardIndex);
      if (idx === -1) {
        gameState.flippedCards.push(action.cardIndex);
      } else {
        gameState.flippedCards.splice(idx, 1);
      }
      // Recalculate board score from flipped cards (sent from client)
      gameState.boardScore = action.boardScore ?? gameState.boardScore;
      break;
    }

    case 'WRONG': {
      if (gameState.wrong < 3) gameState.wrong++;
      break;
    }

    case 'NEXT_QUESTION': {
      gameState.tournament.questionsAnswered++;
      gameState.wrong = 0;
      gameState.flippedCards = [];
      gameState.boardScore = 0;
      gameState.pointsAwarded = false;

      const currentMatch = gameState.tournament.matches[gameState.tournament.currentMatch];
      if (gameState.tournament.questionsAnswered >= currentMatch.questions) {
        // Match over — advance match index
        gameState.tournament.currentMatch++;
        gameState.tournament.questionsAnswered = 0;

        if (gameState.tournament.currentMatch >= gameState.tournament.matches.length) {
          // Round over
          if (gameState.tournament.currentRound === 'round1') {
            gameState.phase = 'leaderboard';
          } else if (gameState.tournament.currentRound === 'semifinal') {
            _setupFinal();
          } else if (gameState.tournament.currentRound === 'final') {
            gameState.phase = 'winner';
          }
        } else {
          gameState.currentQ++;
        }
      } else {
        gameState.currentQ++;
      }
      break;
    }

    case 'AWARD_TEAM': {
      // Just bank the points — do NOT advance question yet.
      // Host will click "Next Question" when ready (after showing all answers).
      const { teamNum, points } = action;
      const match = gameState.tournament.matches[gameState.tournament.currentMatch];
      const teamIdx = teamNum === 1 ? match.team1 : match.team2;
      gameState.tournament.teams[teamIdx].score += points;
      gameState.boardScore = 0;
      // Mark that points have been awarded so Next Question knows to count this Q
      gameState.pointsAwarded = true;
      break;
    }

    case 'PROCEED_TO_SEMIFINAL': {
      const sorted = [...gameState.tournament.teams].sort((a, b) => b.score - a.score);
      // Reset scores for the two competing teams — fresh start for this round
      gameState.tournament.teams[sorted[1].id].score = 0;
      gameState.tournament.teams[sorted[2].id].score = 0;
      gameState.tournament.currentRound = 'semifinal';
      gameState.tournament.matches = [
        { team1: sorted[1].id, team2: sorted[2].id, questions: 3 }
      ];
      gameState.tournament.currentMatch = 0;
      gameState.tournament.questionsAnswered = 0;
      gameState.currentQ++;
      gameState.wrong = 0;
      gameState.flippedCards = [];
      gameState.boardScore = 0;
      gameState.phase = 'game';
      break;
    }

    case 'RESTART': {
      resetState();
      break;
    }
  }

  broadcast();
}

function _setupFinal() {
  const sorted = [...gameState.tournament.teams].sort((a, b) => b.score - a.score);
  const rank1  = sorted[0].id;
  const match  = gameState.tournament.matches[0];
  const t1     = gameState.tournament.teams[match.team1];
  const t2     = gameState.tournament.teams[match.team2];
  const winner   = t1.score > t2.score ? match.team1 : match.team2;
  const opponent = winner === rank1 ? sorted[1].id : rank1;

  // Reset both finalists to zero — clean slate for the final
  gameState.tournament.teams[winner].score   = 0;
  gameState.tournament.teams[opponent].score = 0;

  gameState.tournament.currentRound = 'final';
  gameState.tournament.matches = [{ team1: winner, team2: opponent, questions: 3 }];
  gameState.tournament.currentMatch = 0;
  gameState.tournament.questionsAnswered = 0;
  gameState.currentQ++;
  gameState.wrong = 0;
  gameState.flippedCards = [];
  gameState.boardScore = 0;
  gameState.phase = 'game';
}

// All other routes → React app (client-side routing)
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
