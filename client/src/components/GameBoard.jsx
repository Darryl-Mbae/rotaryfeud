import React, { useEffect, useRef, useState } from 'react';
import questions from '../data/questions.json';
import '../styles/board.css';

const QUESTION_KEYS = Object.keys(questions);

const sounds = {
  correct: new Audio('/sounds/good3.mp3'),
  wrong: new Audio('/sounds/bad3.mp3'),
};
sounds.correct.volume = 1.0;
sounds.wrong.volume = 1.0;

function playSound(name) {
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => { });
}

export default function GameBoard({ state, dispatch, isHost }) {
  const { tournament, currentQ, wrong, flippedCards, pointsAwarded } = state;
  const [showWrong, setShowWrong] = useState(false);
  const [showRoomCode, setShowRoomCode] = useState(true);
  const wrongTimer = useRef(null);
  const roomCode = isHost ? sessionStorage.getItem('roomCode') : null;

  const match = tournament.matches[tournament.currentMatch];
  const team1 = tournament.teams[match?.team1];
  const team2 = tournament.teams[match?.team2];
  const qKey = QUESTION_KEYS[currentQ];
  const answers = qKey ? questions[qKey] : [];

  // Play wrong sound immediately, then show X animation after 800ms delay
  const prevWrong = useRef(wrong);
  useEffect(() => {
    if (wrong > prevWrong.current) {
      playSound('wrong');
      clearTimeout(wrongTimer.current);
      wrongTimer.current = setTimeout(() => {
        setShowWrong(true);
        // Hide the X after it's been visible for 1200ms
        setTimeout(() => setShowWrong(false), 1200);
      }, 800);
    }
    prevWrong.current = wrong;
  }, [wrong]);

  // Compute board score — freeze at 0 once points have been awarded
  // so flipping remaining answers doesn't confusingly update the score display
  const computedScore = pointsAwarded
    ? 0
    : flippedCards.reduce((sum, idx) => {
        const ans = answers[idx];
        return sum + (ans ? parseInt(ans[1]) : 0);
      }, 0);

  // Track previous flippedCards length to detect new flips and play sound
  const prevFlipped = useRef(flippedCards.length);
  useEffect(() => {
    if (flippedCards.length > prevFlipped.current) {
      playSound('correct');
    }
    prevFlipped.current = flippedCards.length;
  }, [flippedCards.length]);

  function handleFlip(idx) {
    if (!isHost) return;
    const newFlipped = flippedCards.includes(idx)
      ? flippedCards.filter(i => i !== idx)
      : [...flippedCards, idx];
    const newScore = newFlipped.reduce((sum, i) => {
      const a = answers[i];
      return sum + (a ? parseInt(a[1]) : 0);
    }, 0);
    dispatch({ type: 'FLIP_CARD', cardIndex: idx, boardScore: newScore });
  }

  function getRoundName() {
    if (tournament.currentRound === 'round1') return `Round 1 — Match ${tournament.currentMatch + 1}`;
    if (tournament.currentRound === 'semifinal') return 'Semi-Final';
    if (tournament.currentRound === 'final') return 'FINAL';
    return '';
  }

  const slots = Array.from({ length: 10 }, (_, i) => answers[i] || null);

  return (
    <div className={`gameBoard${isHost ? ' showHost' : ''}`}>

      {/* Room code — fixed top-right, host only */}
      {isHost && roomCode && (
        <div className="roomCodeOverlay">
          {showRoomCode
            ? <span className="roomCodeText">ROOM: <strong>{roomCode}</strong></span>
            : <span className="roomCodeText">ROOM: ••••••</span>
          }
          <button className="roomCodeToggle" onClick={() => setShowRoomCode(v => !v)}>
            {showRoomCode ? '🙈' : '👁'}
          </button>
        </div>
      )}

      {/* Match info */}
      <div className="matchInfo">
        <h2 className="roundName">{getRoundName()}</h2>
        <div className="teams">{team1?.name} vs {team2?.name}</div>
        <div className="questionCount">
          Question {tournament.questionsAnswered + 1} of {match?.questions}
        </div>
      </div>

      {/* Scores */}
      <div className="score" id="boardScore">{computedScore}</div>
      <div className="score" id="team1">{team1?.score ?? 0}</div>
      <div className="score" id="team2">{team2?.score ?? 0}</div>

      {/* Board */}
      <div id="middleBoard">
        <div className="questionHolder">
          <span className="question">{qKey?.replace(/&x22;/g, '"')}</span>
        </div>
        <div className="colHolder">
          {slots.map((ans, i) => (
            <AnswerCard
              key={i}
              index={i}
              answer={ans}
              flipped={flippedCards.includes(i)}
              isHost={isHost}
              onFlip={handleFlip}
            />
          ))}
        </div>
      </div>

      {/* Wrong X overlay */}
      {showWrong && (
        <div className="wrongX wrongBoard" style={{ display: 'block' }}>
          {Array.from({ length: wrong }, (_, i) => (
            <img key={i} alt="wrong" src="/img/Wrong.svg" />
          ))}
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <div className="btnHolder" id="host">
          <button
            className="button"
            id="awardTeam1"
            disabled={!!pointsAwarded}
            onClick={() => dispatch({ type: 'AWARD_TEAM', teamNum: 1, points: computedScore })}
          >
            Award {team1?.name}
          </button>
          <button
            className="button"
            id="newQuestion"
            onClick={() => dispatch({ type: 'NEXT_QUESTION' })}
          >
            Next Question
          </button>
          <button
            className="button wrongX"
            id="wrong"
            onClick={() => dispatch({ type: 'WRONG' })}
          >
            <img alt="wrong" src="/img/Wrong.svg" />
          </button>
          <button
            className="button"
            id="awardTeam2"
            disabled={!!pointsAwarded}
            onClick={() => dispatch({ type: 'AWARD_TEAM', teamNum: 2, points: computedScore })}
          >
            Award {team2?.name}
          </button>
          <button
            className="button"
            id="restartGame"
            onClick={() => {
              if (confirm('Restart the tournament for everyone?')) {
                dispatch({ type: 'RESTART' });
              }
            }}
          >
            ↺ Restart
          </button>
        </div>
      )}
    </div>
  );
}

function AnswerCard({ index, answer, flipped, isHost, onFlip }) {
  // Empty slot — same blue gradient as filled cards, no cursor
  if (!answer) {
    return (
      <div className="cardHolder empty">
        <div className="front" style={{ backfaceVisibility: 'hidden', position: 'absolute', width: '100%', height: '100%' }} />
      </div>
    );
  }

  return (
    <div
      className="cardHolder"
      style={{ perspective: 800 }}
      onClick={() => onFlip(index)}
    >
      <div
        className="card"
        style={{
          transformStyle: 'preserve-3d',
          transition: 'transform 0.6s',
          transform: flipped ? 'rotateX(-180deg)' : 'rotateX(0deg)',
          position: 'relative',
          height: '50px'
        }}
      >
        {/* Front */}
        <div
          className="front DBG"
          style={{ backfaceVisibility: 'hidden', position: 'absolute', width: '100%', height: '100%' }}
        >
          <span className="DBG">{index + 1}</span>
          {isHost && <span className="answer">{answer[0]}</span>}
        </div>
        {/* Back */}
        <div
          className="back LBG"
          style={{
            backfaceVisibility: 'hidden',
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: 'rotateX(180deg)'
          }}
        >
          <span>{answer[0]}</span>
          <b>{answer[1]}</b>
        </div>
      </div>
    </div>
  );
}
