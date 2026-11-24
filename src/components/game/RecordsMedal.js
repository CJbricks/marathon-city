"use client";

// The medal in the top-right corner. Tapping it opens this city's
// personal records. The button is HTML, like MENU, so a pinch does not
// drag it and Share my city does not paint it into the PNG.
//
// The rows come from the server. This file does not compute a time from
// miles. While Strava still owes us some activities, the copy says so,
// and a distance with no effort is simply not rendered.

import { useEffect, useRef, useState } from "react";

function MedalMark() {
  // Ribbon, a round disc, and a star. The fills are the theme colors:
  // Denver's gold on navy, Austin's burnt orange rim and cream face.
  return (
    <svg className="medal-mark" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <rect className="ribbon" x="4" y="0" width="3" height="4" />
      <rect className="ribbon" x="9" y="0" width="3" height="4" />
      <rect className="rim" x="5" y="3" width="6" height="2" />
      <rect className="rim" x="3" y="6" width="10" height="8" />
      <rect className="rim" x="4" y="5" width="8" height="10" />
      <rect className="face" x="5" y="6" width="6" height="8" />
      <rect className="face" x="4" y="7" width="8" height="6" />
      <rect className="star" x="7" y="7" width="2" height="1" />
      <rect className="star" x="6" y="8" width="4" height="1" />
      <rect className="star" x="5" y="9" width="6" height="1" />
      <rect className="star" x="6" y="10" width="1" height="1" />
      <rect className="star" x="9" y="10" width="1" height="1" />
      <rect className="star" x="5" y="11" width="1" height="1" />
      <rect className="star" x="10" y="11" width="1" height="1" />
    </svg>
  );
}

function statusCopy(view, { pausedNote, connected }) {
  if (pausedNote) return pausedNote;
  if (!view) return "Checking your runs…";
  // A phone with no Strava session cannot fetch. It still shows whatever
  // is already cached, and it says the rest has not been gathered.
  if (view.pending && !connected) {
    return view.rows?.length
      ? "Still gathering records from Strava."
      : "Records from Strava are still being gathered.";
  }
  if (view.pending && !view.rows?.length) return "Checking your runs…";
  if (view.pending) return "Still checking the rest of this city's runs.";
  if (!view.rows?.length) return "No mile, 5K, 10K, half, or marathon in this city's runs.";
  return "";
}

// Prefer a list that knows about more of this city's runs. A session
// response that left before the panel's fetch has the same run count and
// fewer cached ids, and that one must not cover the rows just loaded.
function preferRecords(incoming, fetched) {
  if (!fetched) return incoming || null;
  if (!incoming) return fetched;
  if (incoming.runs !== fetched.runs) return incoming;
  if ((incoming.cached || 0) >= (fetched.cached || 0)) return incoming;
  return fetched;
}

export default function RecordsMedal({ records, connected, hidden }) {
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(null);
  const [pausedNote, setPausedNote] = useState("");
  const [hiddenSeen, setHiddenSeen] = useState(hidden);
  const closeRef = useRef(null);
  // Menu, reset, and the manual-run dialog take the screen. Close the
  // panel in the same render that covers it, instead of after an effect.
  if (hidden !== hiddenSeen) {
    setHiddenSeen(hidden);
    if (hidden) {
      setOpen(false);
      setPausedNote("");
    }
  }
  const view = preferRecords(records, fetched);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open || hidden) return undefined;
    let cancelled = false;
    let timer = 0;
    async function pull(round) {
      if (cancelled) return;
      try {
        const response = await fetch("/api/records", { method: "POST" });
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setPausedNote("Could not check Strava. Showing saved records.");
          return;
        }
        if (body.records) setFetched(body.records);
        if (body.authError) {
          setPausedNote(body.authError);
          return;
        }
        if (body.paused) {
          setPausedNote("Strava is busy. These are the records saved so far.");
          return;
        }
        setPausedNote("");
        // Another handful only while this open is finding new rows.
        // Eight rounds is 40 activities, under the 15-minute cap.
        const more = body.records?.pending && body.connected && body.filled > 0 && round < 8;
        if (more) timer = window.setTimeout(() => pull(round + 1), 1000);
      } catch {
        if (!cancelled) setPausedNote("Could not check Strava. Showing saved records.");
      }
    }
    pull(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, hidden]);

  const shown = view;
  const note = open ? statusCopy(shown, { pausedNote, connected }) : "";
  const rows = shown?.rows || [];

  return (
    <>
      <button
        type="button"
        className={open ? "pixel-btn medal-btn on" : "pixel-btn medal-btn"}
        aria-label="Personal records"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <MedalMark />
      </button>
      {open ? (
        <>
          <div className="records-scrim" onClick={() => setOpen(false)} />
          <div className="records-panel" role="dialog" aria-modal="true" aria-labelledby="records-title">
            <div className="records-head">
              <p id="records-title" className="records-title">
                RECORDS
              </p>
              <button
                ref={closeRef}
                type="button"
                className="pixel-btn records-x"
                aria-label="Close records"
                onClick={() => setOpen(false)}
              >
                X
              </button>
            </div>
            {rows.length ? (
              <ul className="pr-list">
                {rows.map((row) => (
                  <li key={row.key} className="pr-row">
                    <div className="pr-top">
                      <span className="pr-label">{row.label}</span>
                      <span className="pr-time">{row.time}</span>
                    </div>
                    <p className="pr-date">{row.date}</p>
                    {row.title || row.url ? (
                      row.url ? (
                        <a className="pr-link" href={row.url} target="_blank" rel="noreferrer">
                          {row.title || "View on Strava"}
                        </a>
                      ) : (
                        <p className="pr-name">{row.title}</p>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {note ? <p className="records-status">{note}</p> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
