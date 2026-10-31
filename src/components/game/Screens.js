"use client";

// Opening-flow screens. They are laid out on a 320×200 stage, the same
// size as the prototype intro, and the stage is scaled to the window so a
// phone shows the whole card without a horizontal scrollbar. Labels match
// the prototype: Resume City, New City, the five-city picker (only Denver
// is READY), Connect with Strava, all history or a start date, then the
// race-day question.

import { useEffect, useState } from "react";

export const CITIES = ["AUSTIN", "DENVER", "BOULDER", "NEW YORK", "TOKYO"];

function localToday() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function Stage({ children, height = 200 }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const w = Math.min(window.innerWidth - 16, (window.innerHeight - 16) * (320 / height));
      setScale(Math.max(0.5, w / 320));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [height]);
  return (
    <div className="stage-wrap">
      <div className="stage-sizer" style={{ width: 320 * scale, height: height * scale }}>
        <div className="stage-px" style={{ transform: `scale(${scale})`, height }}>
          <div className="sky-stripes" />
          {children}
          <div className="sky-stripes bottom" />
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen({ quote }) {
  return (
    <Stage>
      <p className="pixel-title">MARATHON CITY</p>
      <p className="pixel-quote">{quote}</p>
      <div className="load-track">
        <div className="load-bar" />
      </div>
    </Stage>
  );
}

export function TitleScreen({ save, summary, onResume, onNew, onDemo }) {
  const last = summary?.inProgress?.[0]?.startDate;
  const buildings = summary?.buildingsCompleted;
  return (
    <Stage>
      <p className="pixel-kicker">5280 FT</p>
      <h1 className="pixel-title">MARATHON CITY</h1>
      <div className="btn-row">
        <button type="button" className="pixel-btn gold" disabled={!save} onClick={onResume}>
          RESUME CITY
        </button>
        <button type="button" className="pixel-btn" onClick={onNew}>
          NEW CITY
        </button>
      </div>
      {save ? (
        <div className="save-card">
          DENVER - {buildings ?? 0} BUILDINGS
          {last ? ` - LAST ${last}` : ""}
        </div>
      ) : (
        <p className="pixel-note">NO SAVE YET</p>
      )}
      <button type="button" className="pixel-btn demo" onClick={onDemo}>
        DEMO CITY
      </button>
    </Stage>
  );
}

export function PickerScreen({ onNext, onBack }) {
  return (
    <Stage>
      <h2 className="pixel-heading">PICK YOUR CITY</h2>
      <div className="city-row">
        {CITIES.map((name) => {
          const on = name === "DENVER";
          return (
            <div key={name} className={on ? "city-card on" : "city-card"}>
              <span>{name}</span>
              <em>{on ? "READY" : "SOON"}</em>
            </div>
          );
        })}
      </div>
      <p className="pixel-note">MORE CITIES COMING SOON</p>
      <div className="btn-row">
        <button type="button" className="pixel-btn" onClick={onBack}>
          BACK
        </button>
        <button type="button" className="pixel-btn gold" onClick={onNext}>
          NEXT
        </button>
      </div>
    </Stage>
  );
}

export function StravaScreen({ configured, notice, onSkip, onDemo }) {
  return (
    <Stage>
      <h2 className="pixel-heading">CONNECT STRAVA</h2>
      <p className="pixel-chip">DENVER</p>
      <p className="pixel-note">YOUR RUNS BUILD THE CITY</p>
      {configured ? (
        <a className="pixel-btn strava" href="/api/strava/start">
          CONNECT WITH STRAVA
        </a>
      ) : (
        <p className="pixel-note">ADD STRAVA KEYS TO .env.local</p>
      )}
      {notice ? <p className="pixel-note warn">{notice}</p> : null}
      <div className="btn-row">
        <button type="button" className="pixel-btn" onClick={onSkip}>
          BUILD WITHOUT STRAVA
        </button>
        <button type="button" className="pixel-btn" onClick={onDemo}>
          DEMO
        </button>
      </div>
      <p className="pixel-note">READ-ONLY ACCESS TO YOUR ACTIVITIES</p>
    </Stage>
  );
}

export function StartScreen({ onBuild }) {
  const [mode, setMode] = useState("date");
  const [date, setDate] = useState(localToday);
  return (
    <Stage>
      <h2 className="pixel-heading">BUILD YOUR CITY</h2>
      <div className={mode === "all" ? "choice on" : "choice"} onClick={() => setMode("all")} role="button" tabIndex={0}>
        ALL STRAVA HISTORY
        <small>EVERY RUN SINCE DAY ONE</small>
      </div>
      <div className={mode === "date" ? "choice on" : "choice"} onClick={() => setMode("date")}>
        START FROM A DATE
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setMode("date");
            setDate(event.target.value);
          }}
        />
        <small>DEFAULTS TO TODAY</small>
      </div>
      <button type="button" className="pixel-btn gold" onClick={() => onBuild(mode, date)}>
        NEXT
      </button>
    </Stage>
  );
}

export function RaceScreen({ initialDate, initialName, onDone, onBack }) {
  const [yes, setYes] = useState(Boolean(initialDate));
  const [date, setDate] = useState(initialDate || "2027-02-14");
  const [name, setName] = useState(initialName || "");
  return (
    <Stage height={248}>
      <h2 className="pixel-heading">RACE DAY</h2>
      <p className="pixel-note">ARE YOU TRAINING FOR A SPECIFIC DATE?</p>
      <div className="btn-row">
        <button type="button" className={yes ? "pixel-btn gold" : "pixel-btn"} onClick={() => setYes(true)}>
          YES
        </button>
        <button type="button" className="pixel-btn" onClick={() => onDone(null, null)}>
          NO
        </button>
      </div>
      {yes ? (
        <>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <input
            type="text"
            value={name}
            maxLength={32}
            placeholder="AUSTIN MARATHON"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="button" className="pixel-btn gold" onClick={() => onDone(date, name.trim() || null)}>
            NEXT
          </button>
        </>
      ) : null}
      {onBack ? (
        <button type="button" className="pixel-btn" onClick={onBack}>
          BACK
        </button>
      ) : null}
    </Stage>
  );
}

export function ManualDialog({ onSubmit, onCancel, busy }) {
  const [miles, setMiles] = useState("");
  return (
    <form
      className="modal"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(Number(miles));
      }}
    >
      <p>NO NEW STRAVA RUN</p>
      <label>
        HOW FAR DID YOU GO?
        <input
          inputMode="decimal"
          value={miles}
          autoFocus
          onChange={(event) => setMiles(event.target.value)}
          placeholder="6.2"
        />
      </label>
      <div className="btn-row">
        {[3, 5, 10].map((n) => (
          <button key={n} type="button" className="pixel-btn" onClick={() => onSubmit(n)}>
            {n} MI
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" className="pixel-btn" onClick={onCancel}>
          CANCEL
        </button>
        <button type="submit" className="pixel-btn gold" disabled={busy}>
          BUILD
        </button>
      </div>
    </form>
  );
}
