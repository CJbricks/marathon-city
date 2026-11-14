"use client";

// Opening-flow screens, including the save name, the resume list, the city
// code, and the replace confirm. They use the loading screen's stage:
// 320 wide, scaled to the phone, pixel font, and a frame. Denver keeps the
// Nuggets stripes and the gold frame. Austin passes theme="Austin", which
// adds the theme-austin class and swaps those colors for burnt orange.
// The picker enables every name in OPEN_THEMES. The others stay SOON.

import { useEffect, useState } from "react";
import { normalizeCityCode } from "@/lib/cityCode";
import { MAX_SAVES, NAME_MAX, cleanName, saveLabel } from "@/lib/saves";
import { OPEN_THEMES, themeClass } from "./themes/names";

export const CITIES = ["AUSTIN", "DENVER", "BOULDER", "NEW YORK", "TOKYO"];

const OPEN = new Set(OPEN_THEMES.map((name) => name.toUpperCase()));

function themeFromCard(card) {
  return OPEN_THEMES.find((name) => name.toUpperCase() === card) || "Denver";
}

function localToday() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function Stage({ children, height = 200, theme = "Denver" }) {
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
  const frame = ["stage-wrap", themeClass(theme)].filter(Boolean).join(" ");
  return (
    <div className={frame}>
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

export function LoadingScreen({ quote, theme = "Denver" }) {
  return (
    <Stage theme={theme}>
      <p className="pixel-title">MARATHON CITY</p>
      <p className="pixel-quote">{quote}</p>
      <div className="load-track">
        <div className="load-bar" />
      </div>
    </Stage>
  );
}

export function TitleScreen({ saves, playingName, notice, onResume, onNew, onDemo, onCode, onBack }) {
  const count = saves?.length || 0;
  return (
    <Stage height={playingName || notice ? 280 : 250}>
      <p className="pixel-kicker">5280 FT</p>
      <h1 className="pixel-title">MARATHON CITY</h1>
      <div className="btn-row">
        <button type="button" className="pixel-btn gold" disabled={count === 0} onClick={onResume}>
          RESUME CITY
        </button>
        <button type="button" className="pixel-btn" onClick={onNew}>
          NEW CITY
        </button>
      </div>
      <p className="pixel-note">{count === 0 ? "NO SAVE YET" : `${count} OF ${MAX_SAVES} CITIES`}</p>
      {playingName ? <p className="pixel-note">PLAYING {playingName}</p> : null}
      {notice ? <p className="pixel-note warn">{notice}</p> : null}
      <button type="button" className="pixel-btn demo" onClick={onDemo}>
        DEMO CITY
      </button>
      <button type="button" className="pixel-btn" onClick={onCode}>
        ENTER CITY CODE
      </button>
      {onBack ? (
        <button type="button" className="pixel-btn" onClick={onBack}>
          BACK
        </button>
      ) : null}
    </Stage>
  );
}

function SaveButtons({ saves, selectedId, onSelect }) {
  return (
    <div className="save-list">
      {saves.map((save) => {
        const on = selectedId ? save.id === selectedId : false;
        const miles = Number(save.totalRunMiles || 0);
        return (
          <button
            key={save.id || save.name}
            type="button"
            className={on ? "pixel-btn save-pick on" : "pixel-btn save-pick"}
            onClick={() => onSelect(save)}
          >
            {save.name || save.city || "DENVER"}
            <small>
              {saveLabel(save)} - {miles} MI{save.code ? ` - CODE ${save.code}` : ""}
              {save.active ? " - PLAYING" : ""}
            </small>
          </button>
        );
      })}
    </div>
  );
}

export function ResumeScreen({ saves, onOpen, onBack }) {
  return (
    <Stage height={320}>
      <h2 className="pixel-heading">YOUR CITIES</h2>
      <SaveButtons saves={saves} onSelect={(save) => onOpen(save.id)} />
      <p className="pixel-note">{saves.length} OF {MAX_SAVES} CITIES</p>
      <button type="button" className="pixel-btn" onClick={onBack}>
        BACK
      </button>
    </Stage>
  );
}

export function ReplaceScreen({ saves, notice, onPick, onBack }) {
  const [selectedId, setSelectedId] = useState(saves[0]?.id || "");
  const chosen = saves.find((save) => save.id === selectedId) || saves[0];
  return (
    <Stage height={340}>
      <h2 className="pixel-heading">ALL 3 CITIES ARE FULL</h2>
      <p className="pixel-note">PICK ONE TO REPLACE</p>
      <SaveButtons saves={saves} selectedId={chosen?.id} onSelect={(save) => setSelectedId(save.id)} />
      {notice ? <p className="pixel-note warn">{notice}</p> : null}
      <div className="btn-row">
        <button type="button" className="pixel-btn" onClick={onBack}>
          BACK
        </button>
        <button type="button" className="pixel-btn gold" disabled={!chosen} onClick={() => onPick(chosen)}>
          NEXT
        </button>
      </div>
    </Stage>
  );
}

export function ConfirmReplaceScreen({ save, onConfirm, onBack }) {
  return (
    <Stage height={240}>
      <h2 className="pixel-heading">REPLACE THIS CITY?</h2>
      <p className="pixel-chip">{save?.name}</p>
      <p className="pixel-note">YOU CAN REBUILD IT LATER WITH THE SAME STRAVA DATES.</p>
      <div className="btn-row">
        <button type="button" className="pixel-btn" onClick={onBack}>
          BACK
        </button>
        <button type="button" className="pixel-btn gold" onClick={onConfirm}>
          REPLACE
        </button>
      </div>
    </Stage>
  );
}

export function NameScreen({ initial, notice, onNext, onBack }) {
  const [name, setName] = useState(initial || "");
  const ready = Boolean(cleanName(name));
  return (
    <Stage height={240}>
      <h2 className="pixel-heading">NAME THIS CITY</h2>
      <p className="pixel-note">THIS NAME IS THE SAVE FILE</p>
      <form
        className="name-form"
        onSubmit={(event) => {
          event.preventDefault();
          const cleaned = cleanName(name);
          if (cleaned) onNext(cleaned);
        }}
      >
        <input
          type="text"
          value={name}
          maxLength={NAME_MAX}
          autoFocus
          autoComplete="off"
          enterKeyHint="next"
          spellCheck={false}
          aria-label="City name"
          placeholder="TRAINING BLOCK"
          onChange={(event) => setName(event.target.value)}
        />
        <p className="pixel-note">{NAME_MAX} CHARACTERS MAX</p>
        {notice ? <p className="pixel-note warn">{notice}</p> : null}
        <button type="submit" className="pixel-btn gold" disabled={!ready}>
          NEXT
        </button>
      </form>
      <button type="button" className="pixel-btn" onClick={onBack}>
        BACK
      </button>
    </Stage>
  );
}

export function PickerScreen({ city = "Denver", onNext, onBack }) {
  // The card the person last chose. Denver is the start, so a fresh city
  // still lands on the gold frame until they tap Austin.
  const [selected, setSelected] = useState(city === "Austin" ? "AUSTIN" : "DENVER");
  const theme = themeFromCard(selected);
  return (
    <Stage theme={theme}>
      <h2 className="pixel-heading">PICK YOUR CITY</h2>
      <div className="city-row">
        {CITIES.map((name) => {
          const open = OPEN.has(name);
          const on = selected === name;
          const cls = ["city-card", on ? "on" : "", open && !on ? "open" : ""].filter(Boolean).join(" ");
          return (
            <button
              key={name}
              type="button"
              className={cls}
              disabled={!open}
              aria-pressed={on}
              onClick={() => setSelected(name)}
            >
              <span>{name}</span>
              <em>{!open ? "SOON" : on ? "READY" : "OPEN"}</em>
            </button>
          );
        })}
      </div>
      <p className="pixel-note">MORE CITIES COMING SOON</p>
      <div className="btn-row">
        <button type="button" className="pixel-btn" onClick={onBack}>
          BACK
        </button>
        <button type="button" className="pixel-btn gold" onClick={() => onNext(theme)}>
          NEXT
        </button>
      </div>
    </Stage>
  );
}

export function CodeScreen({ notice, busy, onSubmit, onBack }) {
  const [code, setCode] = useState("");
  const ready = Boolean(normalizeCityCode(code));
  return (
    <Stage height={240}>
      <h2 className="pixel-heading">ENTER CITY CODE</h2>
      <p className="pixel-note">FIVE DIGITS FROM THE OTHER PHONE</p>
      <form
        className="name-form"
        onSubmit={(event) => {
          event.preventDefault();
          const cleaned = normalizeCityCode(code);
          if (cleaned && !busy) onSubmit(cleaned);
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={5}
          value={code}
          aria-label="City code"
          placeholder="04821"
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 5))}
        />
        {notice ? <p className="pixel-note warn">{notice}</p> : null}
        <button type="submit" className="pixel-btn gold" disabled={!ready || busy}>
          OPEN CITY
        </button>
      </form>
      <button type="button" className="pixel-btn" onClick={onBack}>
        BACK
      </button>
    </Stage>
  );
}

export function StravaScreen({ configured, notice, force, saveName, playing, theme = "Denver", onSkip, onBack, onDemo }) {
  return (
    <Stage height={playing ? 220 : 240} theme={theme}>
      <h2 className="pixel-heading">CONNECT STRAVA</h2>
      <p className="pixel-chip">{theme.toUpperCase()}</p>
      {saveName ? <p className="pixel-note">{saveName}</p> : null}
      <p className="pixel-note">{playing ? "THIS PHONE SIGNS IN ON ITS OWN" : "YOUR RUNS BUILD THE CITY"}</p>
      {configured ? (
        <a className="pixel-btn strava" href={force ? "/api/strava/start?prompt=force" : "/api/strava/start"}>
          CONNECT WITH STRAVA
        </a>
      ) : (
        <p className="pixel-note">ADD STRAVA KEYS TO .env.local</p>
      )}
      {notice ? <p className="pixel-note warn">{notice}</p> : null}
      <div className="btn-row">
        <button type="button" className="pixel-btn" onClick={onBack}>
          BACK
        </button>
        {playing ? null : (
          <button type="button" className="pixel-btn" onClick={onSkip}>
            BUILD WITHOUT STRAVA
          </button>
        )}
        {playing ? null : (
          <button type="button" className="pixel-btn" onClick={onDemo}>
            DEMO
          </button>
        )}
      </div>
      <p className="pixel-note">READ-ONLY ACCESS TO YOUR ACTIVITIES</p>
    </Stage>
  );
}

export function StartScreen({ saveName, initialMode, initialDate, theme = "Denver", onBuild, onBack }) {
  // Back from the race question should not forget all-history vs a date.
  const [mode, setMode] = useState(initialMode === "all" ? "all" : "date");
  const [date, setDate] = useState(initialDate || localToday);
  return (
    <Stage height={240} theme={theme}>
      <h2 className="pixel-heading">BUILD YOUR CITY</h2>
      {saveName ? <p className="pixel-note">{saveName}</p> : null}
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
      <div className="btn-row">
        {onBack ? (
          <button type="button" className="pixel-btn" onClick={onBack}>
            BACK
          </button>
        ) : null}
        <button type="button" className="pixel-btn gold" onClick={() => onBuild(mode, date)}>
          NEXT
        </button>
      </div>
    </Stage>
  );
}

export function RaceScreen({ initialDate, initialName, theme = "Denver", onDone, onBack }) {
  const [yes, setYes] = useState(Boolean(initialDate));
  const [date, setDate] = useState(initialDate || "2027-02-14");
  const [name, setName] = useState(initialName || "");
  return (
    <Stage height={248} theme={theme}>
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
