"use client";

// The whole beta in one client tree: opening screens, then the city.
// It is a Client Component because the screen changes without a new URL
// and the Log run playback is a timer in the browser. The server still
// owns the saves. This file only fetches /api/* and draws what comes back.
//
// A copy of the last payload sits in sessionStorage so a refresh can paint
// the skyline before the network returns. The database (or the JSON file)
// is still what the next response replays from.
//
// Naming a city happens before Strava. Strava sends the browser away and
// back, which wipes React state, so the half-finished city (name, and
// which slot it will replace) is also written to sessionStorage. When
// Strava returns, that draft is what the date and race screens finish.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { isRaceDay, uniqueLandmarkCount } from "@/lib/raceDay";
import { randomQuote } from "@/lib/quotes";
import { isRunActivity, replay, shouldFlyPlane } from "@/lib/replay";
import { MAX_SAVES, cleanName } from "@/lib/saves";
import {
  ConfirmReplaceScreen,
  LoadingScreen,
  ManualDialog,
  NameScreen,
  PickerScreen,
  RaceScreen,
  ReplaceScreen,
  ResumeScreen,
  StartScreen,
  StravaScreen,
  TitleScreen,
} from "./Screens";

const CityView = dynamic(() => import("./CityView"), { ssr: false });

const CACHE = "mc-city";
const DRAFT_KEY = "mc-new-city";

function cacheWrite(payload) {
  try {
    sessionStorage.setItem(CACHE, JSON.stringify(payload));
  } catch {
    // Private mode can refuse storage. The city still works; it just waits
    // on the network next time.
  }
}

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

function writeDraft(draft) {
  try {
    if (draft?.pending) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Same as the city cache. This visit still works. A reload mid-connect
    // would ask for the name again.
  }
}

function savesOf(payload) {
  const listed = payload?.saves?.length ? payload.saves : payload?.save ? [payload.save] : [];
  // A cache written before named saves has a city and no id. Ignore it
  // here so Resume cannot open a slot the server does not know.
  return listed.filter((save) => save?.id);
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
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [forceRace, setForceRace] = useState(false);
  const [banner, setBanner] = useState("");
  const [bannerLeft, setBannerLeft] = useState("18%");
  const [forceReconnect, setForceReconnect] = useState(false);
  const [noticeOk, setNoticeOk] = useState(false);
  const flew = useRef(false);
  const playingRef = useRef(false);
  const importRef = useRef(null);

  function remember(next) {
    setDraft(next);
    writeDraft(next);
  }

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
      setForceRace(new URLSearchParams(window.location.search).get("raceday") === "1");
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE) || "null");
        // A draft means Strava is about to return into a new city. Painting
        // the previous skyline here would flash the wrong save.
        if (cached?.save && !readDraft()?.pending) {
          setPayload(cached);
          setScreen((current) => (current === "boot" ? "city" : current));
        }
      } catch {
        // Ignore a corrupt cache and wait for /api/session.
      }
    }, 0);
    const params = new URLSearchParams(window.location.search);
    const strava = params.get("strava");
    const flyover = params.get("flyover") === "1";
    if (strava) window.history.replaceState({}, "", "/");
    const pending = readDraft();
    fetch("/api/session")
      .then((response) => response.json())
      .then(async (body) => {
        setPayload(body);
        cacheWrite(body);
        // A new city that left for Strava still has a draft. Land on the
        // date screen instead of the city that was already saved, or the
        // name and the slot to replace would be thrown away.
        const returning = Boolean(strava && pending?.pending);
        if (returning && (strava === "error" || strava === "denied")) {
          setDraft(pending);
          setNoticeOk(false);
          setNotice("Strava did not connect. Try again, or build without it.");
          setScreen("strava");
        } else if (returning && strava === "scope") {
          setDraft(pending);
          setNoticeOk(false);
          setForceReconnect(true);
          setNotice("Check the box for all activities, including private ones, then connect again.");
          setScreen("strava");
        } else if (returning && strava === "connected" && !body.connected) {
          setDraft(pending);
          setNoticeOk(false);
          setNotice("Strava did not stay connected. Connect again.");
          setScreen("strava");
        } else if (returning && strava === "connected") {
          setDraft(pending);
          setScreen("start");
        } else if (strava === "error" || strava === "denied") {
          writeDraft(null);
          setDraft(null);
          setNoticeOk(false);
          setNotice("Strava did not connect. Try again, or build without it.");
          setScreen(body.save ? "city" : "strava");
        } else if (strava === "scope") {
          writeDraft(null);
          setDraft(null);
          setNoticeOk(false);
          setForceReconnect(true);
          setNotice("Check the box for all activities, including private ones, then connect again.");
          setScreen("strava");
        } else if (strava === "connected" && !body.connected) {
          writeDraft(null);
          setDraft(null);
          setNoticeOk(false);
          setNotice("Strava did not stay connected. Connect again.");
          setScreen(body.save ? "city" : "strava");
        } else if (strava === "connected" && !body.save) {
          const next = pending?.pending ? pending : { pending: true, city: "Denver" };
          setDraft(next);
          writeDraft(next);
          setScreen(cleanName(next.name) ? "start" : "name");
        } else if (body.save) {
          writeDraft(null);
          setDraft(null);
          setScreen("city");
          // A city that has never synced stays empty until something asks
          // Strava. The Log run button used to be the only ask, so a finished
          // sign-in left a blank skyline. Pull once on load when that is the case.
          const neverSynced = body.connected && !body.save.demo && !body.save.lastSyncedAt;
          if (neverSynced) {
            setNoticeOk(false);
            setNotice("SYNCING STRAVA");
            await importRef.current?.(body.activities || [], { askManual: false });
          }
        } else {
          writeDraft(null);
          setDraft(null);
          setScreen("title");
        }
        if (body.city && !returning && !flew.current && flyover) {
          flew.current = true;
          startFlyover();
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
    setNotice("");
    const response = await fetch("/api/city", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: body.name,
        city: "Denver",
        startMode: body.startMode,
        startDate: body.startDate,
        raceDate: body.raceDate || null,
        raceName: body.raceName || null,
        demo: Boolean(body.demo),
        replaceId: body.replaceId || null,
      }),
    });
    const next = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(next.error || "Could not start the city.");
      setScreen(response.status === 409 ? "replace" : "name");
      return;
    }
    remember(null);
    setReplaceTarget(null);
    setPayload(next);
    cacheWrite(next);
    setScreen("city");
    // The start-date choice is only known once the city row exists, so the
    // first Strava pull happens here rather than on the OAuth redirect.
    if (next.connected && !next.save?.demo) {
      await importRef.current?.(next.activities || [], { askManual: false });
    }
  }

  function startNew() {
    const next = { pending: true, city: "Denver", demo: false, replaceId: null };
    remember(next);
    setReplaceTarget(null);
    setNotice("");
    setScreen(savesOf(payload).length >= MAX_SAVES ? "replace" : "name");
  }

  function startDemo() {
    const next = { pending: true, city: "Denver", demo: true, name: "Demo city", replaceId: null };
    remember(next);
    setReplaceTarget(null);
    setNotice("");
    if (savesOf(payload).length >= MAX_SAVES) setScreen("replace");
    else createCity(next);
  }

  function chooseReplace(save) {
    setReplaceTarget(save);
    setScreen("replace-confirm");
  }

  function confirmReplace() {
    if (!replaceTarget) {
      setScreen("replace");
      return;
    }
    const next = { ...(draft || { pending: true, city: "Denver" }), pending: true, replaceId: replaceTarget.id };
    remember(next);
    if (next.demo) {
      createCity({ ...next, name: cleanName(next.name) || "Demo city" });
      return;
    }
    setScreen("name");
  }

  async function openSave(saveId) {
    setScreen("boot");
    setNotice("");
    const response = await fetch("/api/city/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saveId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "Could not open that city.");
      setScreen("resume");
      return;
    }
    setPayload(body);
    cacheWrite(body);
    setScreen("city");
    const neverSynced = body.save && body.connected && !body.save.demo && !body.save.lastSyncedAt;
    if (neverSynced) {
      setNoticeOk(false);
      setNotice("SYNCING STRAVA");
      await importRef.current?.(body.activities || [], { askManual: false });
    }
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
      if (!isRunActivity(run)) {
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

  async function importStrava(prior, { askManual }) {
    setNoticeOk(false);
    setNotice("SYNCING STRAVA");
    const response = await fetch("/api/sync", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "SYNC FAILED. TRY LOG RUN.");
      return;
    }
    const fresh = body.newActivities || [];
    if (body.needsManual || fresh.length === 0) {
      setPayload(body);
      cacheWrite(body);
      if (askManual && (body.save?.demo || body.connected)) {
        setNotice("");
        setManual(true);
      } else if (!body.connected && !body.save?.demo) {
        setNotice("STRAVA IS NOT CONNECTED.");
      } else {
        setNotice("NO NEW RUNS FROM STRAVA.");
      }
      return;
    }
    // A full history can be hundreds of runs. Playing each one keeps the
    // skyline on the first mile for a long time, which looks like a blank city.
    if (fresh.length > 5) {
      setPayload(body);
      cacheWrite(body);
      setNoticeOk(true);
      setNotice(`${fresh.length} RUNS FROM STRAVA`);
      return;
    }
    setNotice("");
    await playRuns(prior, fresh, body);
  }

  useEffect(() => {
    importRef.current = importStrava;
  });

  async function logRun() {
    await importStrava(payload?.activities || [], { askManual: true });
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
    setScreen("title");
  }

  const saves = savesOf(payload);

  if (screen === "boot" || !payload) return <LoadingScreen quote={quote} />;
  if (screen === "title") {
    return (
      <TitleScreen
        saves={saves}
        playingName={payload.save?.name || ""}
        notice={notice}
        onResume={() => setScreen("resume")}
        onNew={startNew}
        onDemo={startDemo}
        onBack={payload.save ? () => setScreen("city") : null}
      />
    );
  }
  if (screen === "resume") {
    return (
      <ResumeScreen
        saves={saves}
        onOpen={openSave}
        onBack={() => setScreen("title")}
      />
    );
  }
  if (screen === "replace") {
    return (
      <ReplaceScreen
        saves={saves}
        notice={notice}
        onBack={() => {
          remember(null);
          setScreen("title");
        }}
        onPick={chooseReplace}
      />
    );
  }
  if (screen === "replace-confirm") {
    return (
      <ConfirmReplaceScreen
        save={replaceTarget}
        onBack={() => setScreen("replace")}
        onConfirm={confirmReplace}
      />
    );
  }
  if (screen === "name") {
    return (
      <NameScreen
        initial={draft?.name || ""}
        notice={notice}
        onBack={() => {
          if (draft?.replaceId) setScreen("replace-confirm");
          else {
            remember(null);
            setScreen("title");
          }
        }}
        onNext={(name) => {
          remember({ ...(draft || {}), pending: true, city: "Denver", demo: false, name });
          setNotice("");
          setScreen("picker");
        }}
      />
    );
  }
  if (screen === "picker") {
    return (
      <PickerScreen
        onBack={() => setScreen("name")}
        onNext={() => setScreen(payload.connected ? "start" : "strava")}
      />
    );
  }
  if (screen === "strava") {
    return (
      <StravaScreen
        configured={payload.stravaConfigured}
        notice={notice}
        force={forceReconnect}
        saveName={draft?.name || ""}
        onBack={() => setScreen("picker")}
        onSkip={() => setScreen("start")}
        onDemo={() =>
          createCity({
            ...(draft || {}),
            demo: true,
            city: "Denver",
            name: cleanName(draft?.name) || "Demo city",
          })
        }
      />
    );
  }
  if (screen === "start") {
    return (
      <StartScreen
        saveName={draft?.name || ""}
        initialMode={draft?.startMode}
        initialDate={draft?.startDate}
        onBack={() => setScreen(payload.connected ? "picker" : "strava")}
        onBuild={(mode, date) => {
          remember({ ...(draft || {}), pending: true, city: "Denver", startMode: mode, startDate: date });
          setScreen("race");
        }}
      />
    );
  }
  if (screen === "race") {
    return (
      <RaceScreen
        initialDate={draft?.pending ? null : payload.save?.raceDate}
        initialName={draft?.pending ? "" : payload.save?.raceName}
        onBack={() => setScreen(draft?.pending ? "start" : "city")}
        onDone={async (raceDate, raceName) => {
          if (draft?.pending) {
            const next = { ...draft, raceDate, raceName };
            remember(next);
            if (!cleanName(next.name)) {
              setScreen("name");
              return;
            }
            await createCity(next);
            return;
          }
          const response = await fetch("/api/city/race", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raceDate, raceName }),
          });
          const body = await response.json();
          if (response.ok) {
            setPayload(body);
            cacheWrite(body);
          }
          setScreen("city");
        }}
      />
    );
  }

  const summary = payload.city?.summary;
  const celebrate = forceRace || isRaceDay(payload.save?.raceDate);
  const landmarks = uniqueLandmarkCount(payload.city);
  const others = saves.length > 1;
  return (
    <div className="city-screen">
      <CityView city={payload.city} fx={fx} celebrate={celebrate} />
      <button type="button" className="pixel-btn menu-btn" onClick={() => setMenu(true)}>
        MENU
      </button>
      {fx?.label ? <p className="story-pop">{fx.label}</p> : null}
      {fx?.milesShown != null ? <p className="mile-pop">{fx.milesShown.toFixed(2)} MI</p> : null}
      {celebrate && payload.save?.raceName ? <p className="race-name">{payload.save.raceName}</p> : null}
      {banner ? (
        <p className="plane-banner" style={{ left: bannerLeft }}>
          {banner}
        </p>
      ) : null}
      {notice ? <p className={noticeOk ? "hud-note ok" : "hud-note"}>{notice}</p> : null}
      <footer className="hud">
        <span>{summary ? `${summary.totalRunMiles} MI` : "0 MI"}</span>
        <span>{payload.save?.name || "DENVER"}</span>
        <span>{summary ? `${payload.city.buildings.length} BLDG` : "0 BLDG"}</span>
        <span>{`${landmarks} LANDMARKS`}</span>
      </footer>
      {menu ? (
        <div className="modal">
          <p>MENU</p>
          <button type="button" className="pixel-btn gold" disabled={playing} onClick={() => { setMenu(false); logRun(); }}>
            LOG RUN
          </button>
          <button type="button" className="pixel-btn" onClick={() => { setMenu(false); setNotice(""); setScreen("title"); }}>
            CITIES
          </button>
          <button type="button" className="pixel-btn" onClick={() => { setMenu(false); setScreen("race"); }}>
            RACE DAY
          </button>
          <button type="button" className="pixel-btn" onClick={() => { setMenu(false); setConfirmReset(true); }}>
            RESET
          </button>
          <button type="button" className="pixel-btn" onClick={() => setMenu(false)}>
            CLOSE
          </button>
        </div>
      ) : null}
      {manual ? <ManualDialog busy={playing} onCancel={() => setManual(false)} onSubmit={submitManual} /> : null}
      {confirmReset ? (
        <div className="modal">
          <p>{others ? "ERASE THIS SAVE? THE OTHERS STAY." : "ERASE THIS CITY?"}</p>
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
