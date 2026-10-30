"use client";

// The whole beta in one client tree: opening screens, then the city.
// It is a Client Component because the screen changes without a new URL
// and the Log run playback is a timer in the browser. The server still
// owns the save. This file only fetches /api/* and draws what comes back.
//
// A copy of the last payload sits in sessionStorage so a refresh can paint
// the skyline before the network returns. The database (or the JSON file)
// is still what the next response replays from.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { randomQuote } from "@/lib/quotes";
import { replay, shouldFlyPlane } from "@/lib/replay";
import { LoadingScreen, ManualDialog, PickerScreen, StartScreen, StravaScreen, TitleScreen } from "./Screens";

const CityView = dynamic(() => import("./CityView"), { ssr: false });

const CACHE = "mc-city";

function cacheWrite(payload) {
  try {
    sessionStorage.setItem(CACHE, JSON.stringify(payload));
  } catch {
    // Private mode can refuse storage. The city still works; it just waits
    // on the network next time.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Game() {
  const [payload, setPayload] = useState(null);
  const [screen, setScreen] = useState("boot");
  const [quote, setQuote] = useState("");
  const [notice, setNotice] = useState("");
  const [fx, setFx] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [manual, setManual] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [banner, setBanner] = useState("");
  const [bannerLeft, setBannerLeft] = useState("18%");
  const flew = useRef(false);
  const playingRef = useRef(false);

  function startFlyover() {
    if (playingRef.current) return;
    const line = randomQuote();
    const started = performance.now();
    const tick = () => {
      const progress = (performance.now() - started) / 8000;
      if (progress >= 1) {
        setFx((current) => (current?.plane ? { ...current, plane: null } : current));
        setBanner("");
        return;
      }
      setFx((current) => ({ ...(current || {}), plane: { progress, quote: line } }));
      setBanner(line);
      setBannerLeft(`${6 + progress * 50}%`);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  useEffect(() => {
    // sessionStorage and Math.random do not match the server HTML. A timeout
    // applies both after hydration, so the loading quote and a cached city
    // cannot cause a hydration mismatch.
    const timer = setTimeout(() => {
      setQuote((current) => current || randomQuote());
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE) || "null");
        if (cached?.save) {
          setPayload(cached);
          setScreen((current) => (current === "boot" ? "city" : current));
        }
      } catch {
        // Ignore a corrupt cache and wait for /api/session.
      }
    }, 0);
    const params = new URLSearchParams(window.location.search);
    const strava = params.get("strava");
    if (strava) window.history.replaceState({}, "", "/");
    fetch("/api/session")
      .then((response) => response.json())
      .then((body) => {
        setPayload(body);
        cacheWrite(body);
        if (body.save) setScreen("city");
        else if (strava === "connected") setScreen("start");
        else setScreen("title");
        if (
          body.city &&
          !flew.current &&
          new URLSearchParams(window.location.search).get("flyover") === "1"
        ) {
          flew.current = true;
          startFlyover();
        }
        if (strava === "error" || strava === "denied") {
          setNotice("Strava did not connect. Try again, or build without it.");
          setScreen(body.save ? "city" : "strava");
        }
      })
      .catch(() => {
        setNotice("Could not load the save.");
        setScreen("title");
      });
    return () => clearTimeout(timer);
  }, []);

  async function createCity(body) {
    setScreen("boot");
    const response = await fetch("/api/city", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const next = await response.json();
    if (!response.ok) {
      setNotice(next.error || "Could not start the city.");
      setScreen("title");
      return;
    }
    setPayload(next);
    cacheWrite(next);
    setScreen("city");
  }

  useEffect(() => {
    // ?flyover=1 replays the plane without waiting for a long run, so a
    // screenshot can catch the banner. It does not write a run.
    if (screen !== "city" || !payload?.city || flew.current) return;
    if (new URLSearchParams(window.location.search).get("flyover") === "1") {
      flew.current = true;
      startFlyover();
    }
  }, [screen, payload]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "f" && screen === "city" && !playingRef.current) startFlyover();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  async function playRuns(prior, fresh, nextPayload) {
    setPlaying(true);
    playingRef.current = true;
    let base = prior;
    const save = nextPayload.save;
    const asOf = nextPayload.asOf;
    for (let i = 0; i < fresh.length; i++) {
      const run = fresh[i];
      if (run.type !== "Run") {
        base = [...base, run];
        continue;
      }
      const steps = 12;
      const ms = Math.max(1200, Number(run.miles) * 500);
      setBanner(fresh.length > 1 ? `RUN ${i + 1} OF ${fresh.length}` : "");
      for (let step = 1; step <= steps; step++) {
        const frac = step / steps;
        const partial = {
          ...run,
          miles: Number(run.miles) * frac,
          seconds: (Number(run.seconds) || 0) * frac,
          stravaId: `${run.stravaId}#part`,
        };
        const frame = replay([...base, partial], save, asOf);
        const site = frame.buildings.find((b) => b.status === "in_progress");
        setFx({
          city: frame,
          crane: site ? { x: site.x, y: site.y, stories: site.storiesBuilt } : null,
          dust: true,
          milesShown: Number(run.miles) * frac,
          label: step % 3 === 0 ? "+1 STORY" : null,
          plane: null,
        });
        await sleep(ms / steps);
      }
      base = [...base, run];
      if (shouldFlyPlane([...base], run)) {
        const line = randomQuote();
        const started = performance.now();
        while (performance.now() - started < 8000) {
          const progress = (performance.now() - started) / 8000;
          setFx((current) => ({ ...(current || {}), plane: { progress, quote: line } }));
          setBanner(line);
          setBannerLeft(`${6 + progress * 50}%`);
          await sleep(50);
        }
      }
    }
    setFx(null);
    setBanner("");
    setPlaying(false);
    playingRef.current = false;
    setPayload(nextPayload);
    cacheWrite(nextPayload);
  }

  async function logRun() {
    setNotice("");
    const prior = payload?.activities || [];
    const response = await fetch("/api/sync", { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.error || "Sync failed.");
      return;
    }
    if (body.needsManual) {
      setManual(true);
      return;
    }
    await playRuns(prior, body.newActivities || [], body);
  }

  async function submitManual(miles) {
    const prior = payload?.activities || [];
    const response = await fetch("/api/sync/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ miles }),
    });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.error || "Could not add that run.");
      return;
    }
    setManual(false);
    await playRuns(prior, body.newActivities || [], body);
  }

  async function resetCity() {
    setConfirmReset(false);
    const response = await fetch("/api/city/reset", { method: "POST" });
    const body = await response.json();
    setPayload(body);
    cacheWrite(body);
    setScreen("picker");
  }

  if (screen === "boot" || !payload) return <LoadingScreen quote={quote} />;
  if (screen === "title") {
    return (
      <TitleScreen
        save={payload.save}
        summary={payload.city?.summary}
        onResume={() => setScreen("city")}
        onNew={() => setScreen("picker")}
        onDemo={() => createCity({ demo: true, city: "Denver" })}
      />
    );
  }
  if (screen === "picker") {
    return <PickerScreen onBack={() => setScreen("title")} onNext={() => setScreen("strava")} />;
  }
  if (screen === "strava") {
    return (
      <StravaScreen
        configured={payload.stravaConfigured}
        notice={notice}
        onSkip={() => setScreen("start")}
        onDemo={() => createCity({ demo: true, city: "Denver" })}
      />
    );
  }
  if (screen === "start") {
    return (
      <StartScreen
        onBuild={(mode, date) => createCity({ city: "Denver", startMode: mode, startDate: date })}
      />
    );
  }

  const summary = payload.city?.summary;
  return (
    <div className="city-screen">
      <CityView city={payload.city} fx={fx} />
      <header className="hud-top">
        <span>{summary ? `${summary.totalRunMiles} MI` : ""}</span>
        <span>{summary ? `${summary.buildingsCompleted} BLDG` : ""}</span>
        <span>{fx?.milesShown != null ? `${fx.milesShown.toFixed(2)} MI` : ""}</span>
      </header>
      {fx?.label ? <p className="story-pop">{fx.label}</p> : null}
      {banner ? (
        <p className="plane-banner" style={{ left: bannerLeft }}>
          {banner}
        </p>
      ) : null}
      {notice ? <p className="hud-note">{notice}</p> : null}
      <footer className="hud">
        <button type="button" className="pixel-btn gold" disabled={playing} onClick={logRun}>
          LOG RUN
        </button>
        <button type="button" className="pixel-btn" onClick={() => setConfirmReset(true)}>
          RESET
        </button>
      </footer>
      {manual ? <ManualDialog busy={playing} onCancel={() => setManual(false)} onSubmit={submitManual} /> : null}
      {confirmReset ? (
        <div className="modal">
          <p>ERASE THIS CITY?</p>
          <div className="btn-row">
            <button type="button" className="pixel-btn" onClick={() => setConfirmReset(false)}>
              CANCEL
            </button>
            <button type="button" className="pixel-btn gold" onClick={resetCity}>
              RESET CITY
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
