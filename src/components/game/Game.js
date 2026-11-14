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
// back, which wipes React state, so the half-finished city (name, theme,
// and which slot it will replace) is also written to sessionStorage. When
// Strava returns, that draft is what the date and race screens finish.
// The theme is "Denver" or "Austin". The typed name is not the theme.
// A city code opens someone else's save on this phone. Logging a run
// still needs this phone's own Strava login.
//
// Share my city asks CityView for a PNG of the canvas (sky, ground, and
// the grid at the current pinch). The menu and the bottom bar are not in
// that picture. A phone that can share files opens the sheet. Any other
// browser downloads the PNG. Closing the sheet is not an error.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { isRaceDay, uniqueLandmarkCount } from "@/lib/raceDay";
import { randomQuote } from "@/lib/quotes";
import { isRunActivity, replay, shouldFlyPlane } from "@/lib/replay";
import { MAX_SAVES, cleanName } from "@/lib/saves";
import { themeClass } from "./themes/names";
import {
  CodeScreen,
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
  const [sharing, setSharing] = useState(false);
  const [flash, setFlash] = useState(0);
  const flew = useRef(false);
  const playingRef = useRef(false);
  const importRef = useRef(null);
  const viewRef = useRef(null);
  const sharingRef = useRef(false);
  const flashToken = useRef(0);
  const noticeToken = useRef(0);

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
        city: body.city || "Denver",
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
      // A little slower than the first version so the dust at the base
      // of the lot is visible before the next story starts.
      const steps = 14;
      const ms = Math.max(1500, Number(run.miles) * 600);
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
    // A shared city on a phone that has never signed into Strava cannot
    // pull that phone's runs until it does. Demo cities still type a distance.
    if (payload?.save && !payload.save.demo && !payload.connected && payload.stravaConfigured) {
      setNotice("");
      setScreen("strava-play");
      return;
    }
    await importStrava(payload?.activities || [], { askManual: true });
  }

  async function submitCode(code) {
    setNotice("");
    const response = await fetch("/api/city/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNoticeOk(false);
      setNotice(body.error || "That code did not work.");
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

  function showShareSuccess(text) {
    flashToken.current += 1;
    const token = flashToken.current;
    setFlash(token);
    window.setTimeout(() => {
      if (flashToken.current === token) setFlash(0);
    }, 520);
    noticeToken.current += 1;
    const note = noticeToken.current;
    setNoticeOk(true);
    setNotice(text);
    // The note is a toast, not a status that should sit on the bar.
    window.setTimeout(() => {
      if (noticeToken.current !== note) return;
      setNotice((current) => (current === text ? "" : current));
    }, 2600);
  }

  async function shareMyCity() {
    // sharingRef blocks a second tap during the synchronous copy, before
    // React has painted the disabled button.
    if (sharingRef.current) return;
    const view = viewRef.current;
    if (!view?.share) {
      setNoticeOk(false);
      setNotice("CITY IS NOT READY.");
      return;
    }
    sharingRef.current = true;
    setSharing(true);
    setNotice("");
    try {
      const city = payload?.city;
      // No await before view.share(). The copy and navigator.share run
      // inside that call, while this tap still counts on iOS.
      const result = view.share({
        name: payload?.save?.name,
        miles: city?.summary?.totalRunMiles ?? 0,
        buildings: city?.buildings?.length ?? 0,
        landmarks: uniqueLandmarkCount(city),
        theme: payload?.save?.city || "Denver",
      });
      const status = await result.promise;
      if (status === "cancelled") return;
      showShareSuccess(status === "shared" ? "CITY SHARED" : "IMAGE SAVED");
    } catch {
      setNoticeOk(false);
      setNotice("COULD NOT SHARE.");
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  }

  const saves = savesOf(payload);

  // The frame follows the city being built, or the city already on screen.
  // A draft wins while a new city is in progress, so creating Austin does
  // not flash the previous city's colors. An old save with no city is Denver.
  const chrome = (draft?.pending && draft.city) || payload?.save?.city || "Denver";
  if (screen === "boot" || !payload) return <LoadingScreen quote={quote} theme={chrome} />;
  if (screen === "title") {
    return (
      <TitleScreen
        saves={saves}
        playingName={payload.save?.name || ""}
        notice={notice}
        onResume={() => setScreen("resume")}
        onNew={startNew}
        onDemo={startDemo}
        onCode={() => {
          setNotice("");
          setScreen("code");
        }}
        onBack={payload.save ? () => setScreen("city") : null}
      />
    );
  }
  if (screen === "code") {
    return (
      <CodeScreen
        notice={notice}
        onBack={() => {
          setNotice("");
          setScreen("title");
        }}
        onSubmit={submitCode}
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
          remember({ ...(draft || {}), pending: true, city: draft?.city || "Denver", demo: false, name });
          setNotice("");
          setScreen("picker");
        }}
      />
    );
  }
  if (screen === "picker") {
    return (
      <PickerScreen
        city={draft?.city || "Denver"}
        onBack={() => setScreen("name")}
        onNext={(city) => {
          remember({ ...(draft || {}), pending: true, city, demo: false });
          setNotice("");
          setScreen(payload.connected ? "start" : "strava");
        }}
      />
    );
  }
  if (screen === "strava-play") {
    return (
      <StravaScreen
        configured={payload.stravaConfigured}
        notice={notice}
        force={forceReconnect}
        saveName={payload.save?.name || ""}
        theme={payload.save?.city || "Denver"}
        playing
        onBack={() => {
          setNotice("");
          setScreen("city");
        }}
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
        theme={draft?.city || "Denver"}
        onBack={() => setScreen("picker")}
        onSkip={() => setScreen("start")}
        onDemo={() =>
          createCity({
            ...(draft || {}),
            demo: true,
            city: draft?.city || "Denver",
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
        theme={draft?.city || "Denver"}
        initialMode={draft?.startMode}
        initialDate={draft?.startDate}
        onBack={() => setScreen(payload.connected ? "picker" : "strava")}
        onBuild={(mode, date) => {
          remember({ ...(draft || {}), pending: true, city: draft?.city || "Denver", startMode: mode, startDate: date });
          setScreen("race");
        }}
      />
    );
  }
  if (screen === "race") {
    return (
      <RaceScreen
        theme={draft?.pending ? draft.city || "Denver" : payload.save?.city || "Denver"}
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
    <div className={["city-screen", themeClass(payload.save?.city)].filter(Boolean).join(" ")}>
      {/* The save's city ("Denver" or "Austin") picks the drawings. The typed name does not. */}
      <CityView
        city={payload.city}
        fx={fx}
        celebrate={celebrate}
        theme={payload.save?.city || "Denver"}
        viewRef={viewRef}
      />
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
      {notice ? (
        <p className={noticeOk ? "hud-note ok" : "hud-note"} role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
      <footer className="hud">
        <span className="hud-left">{summary ? `${summary.totalRunMiles} MI` : "0 MI"}</span>
        <span className="hud-name">{payload.save?.name || "DENVER"}</span>
        <span className="hud-right">
          <span>{summary ? `${payload.city.buildings.length} BLDG` : "0 BLDG"}</span>
          <span>{`${landmarks} LANDMARKS`}</span>
        </span>
      </footer>
      {menu ? (
        <div className="modal">
          <p>MENU</p>
          {payload.save?.code ? <p className="pixel-chip">CODE {payload.save.code}</p> : null}
          {payload.save?.city && payload.save.city !== "Denver" ? (
            <p className="pixel-note">{payload.save.city.toUpperCase()}</p>
          ) : null}
          <button type="button" className="pixel-btn gold" disabled={playing} onClick={() => { setMenu(false); logRun(); }}>
            LOG RUN
          </button>
          <button type="button" className="pixel-btn" disabled={sharing} onClick={shareMyCity}>
            SHARE MY CITY
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
      {flash ? <div key={flash} className="share-flash" aria-hidden="true" /> : null}
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
