import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';
import { Mosaic } from '../components/Mosaic';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="splitPage">
      <div className="splitLeft">
        <div className="splitForm">
          <div className="splitLogo">🎯</div>
          <h1 className="splitTitle">Rotary Feud</h1>
          <p className="splitSub">Real-time Family Feud tournament for your event</p>

          <div className="splitActions">
            <button className="splitBtn primary" onClick={() => navigate('/host-login')}>
              I'm the Host
            </button>
            <div className="splitOr"><span>or</span></div>
            <button className="splitBtn secondary" onClick={() => navigate('/join')}>
              Join as Audience
            </button>
          </div>

          <p className="splitHint">Hosts need a PIN &nbsp;·&nbsp; Audience needs a room code</p>
        </div>
      </div>

      <div className="splitRight">
        <Mosaic />
      </div>
    </div>
  );
}
