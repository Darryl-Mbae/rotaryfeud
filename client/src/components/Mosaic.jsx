import React from 'react';

const TILES = [
  { shape: 'circle',   s: 0 }, { shape: 'quarter',  s: 1 }, { shape: 'half',     s: 2 }, { shape: 'blank',    s: 0 },
  { shape: 'dots',     s: 0 }, { shape: 'diamond',  s: 2 }, { shape: 'blank',    s: 1 }, { shape: 'diamond',  s: 0 },
  { shape: 'triangle', s: 1 }, { shape: 'blank',    s: 0 }, { shape: 'circle',   s: 2 }, { shape: 'blank',    s: 1 },
  { shape: 'blank',    s: 0 }, { shape: 'plus',     s: 2 }, { shape: 'half',     s: 0 }, { shape: 'circle',   s: 1 },
  { shape: 'square',   s: 2 }, { shape: 'blank',    s: 1 }, { shape: 'triangle', s: 0 }, { shape: 'dots',     s: 2 },
  { shape: 'half',     s: 1 }, { shape: 'diamond',  s: 0 }, { shape: 'circle',   s: 2 }, { shape: 'quarter',  s: 1 },
];

// Blue shades matching the game board palette
const BG = ['#0c4779', '#1e5799', '#207cca'];
const FG = ['rgba(125,185,232,0.9)', 'rgba(161,205,240,0.5)', 'rgba(200,225,245,0.25)'];

function Tile({ shape, s }) {
  const bg = BG[s];
  const fg = FG[s];
  const wrap = {
    width: '100%', height: '100%',
    background: bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0, position: 'relative'
  };

  const el = {
    circle:   <div style={{ width: 52, height: 52, borderRadius: '50%', background: fg }} />,
    quarter:  <div style={{ width: 90, height: 90, borderRadius: '0 0 0 90px', background: fg, position: 'absolute', top: 0, right: 0 }} />,
    half:     <div style={{ width: 90, height: 45, borderRadius: '0 0 45px 45px', background: fg, alignSelf: 'flex-end' }} />,
    diamond:  <div style={{ width: 38, height: 38, background: fg, transform: 'rotate(45deg)' }} />,
    triangle: <div style={{ width: 0, height: 0, borderLeft: '38px solid transparent', borderRight: '38px solid transparent', borderBottom: `66px solid ${fg}` }} />,
    dots:     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,10px)', gap: 5 }}>
                {Array(9).fill(0).map((_, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: fg }} />)}
              </div>,
    plus:     <div style={{ position: 'relative', width: 42, height: 42 }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: 8, background: fg, transform: 'translateY(-50%)' }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, width: 8, height: '100%', background: fg, transform: 'translateX(-50%)' }} />
              </div>,
    square:   <div style={{ width: 42, height: 42, background: fg }} />,
    blank:    null,
  }[shape];

  return <div style={wrap}>{el}</div>;
}

export function Mosaic() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gridTemplateRows: 'repeat(6, 1fr)',
      width: '100%',
      height: '100%',
      minHeight: '100vh',
      gap: 2
    }}>
      {TILES.map((t, i) => <Tile key={i} shape={t.shape} s={t.s} />)}
    </div>
  );
}
