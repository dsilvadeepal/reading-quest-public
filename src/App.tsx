import { useEffect, useRef, useState } from "react";
import { practiceActive } from "./activity";
import Compass from "./Compass";
import BadgeCelebration from "./BadgeCelebration";
import { recordAnswer } from "./voice";
function Cover({ book }: { book: any; index: number }) {
 return <div className="cover" style={{background:book.color}}><div className="cover-fallback"><span>{book.icon}</span><strong>{book.title}</strong><small>Original sample story</small></div></div>;
}
function Medal({ badge }: { badge: any }) {
  return (
    <div
      className={"medal " + (badge.earned ? "earned" : "")}
      style={{ "--medal": badge.color } as any}
    >
      <span>{badge.icon}</span>
      <i>{badge.earned ? "✓" : "◇"}</i>
    </div>
  );
}
export default function App() {
  const [data, setData] = useState<any>(null),
    [config, setConfig] = useState<any>({}),
    [page, setPage] = useState("trail"),
    [book, setBook] = useState<string | null>(null),
    [badge, setBadge] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [answer, setAnswer] = useState(""),
    [pin, setPin] = useState(""),
    [pinConfirm, setPinConfirm] = useState(""),
    [invite, setInvite] = useState(
      () =>
        location.hash.slice(1) ||
        sessionStorage.getItem("quest-pending-invite") ||
        "",
    ),
    [recording, setRecording] = useState(false),
    [summary, setSummary] = useState<any>(null),
    [notice, setNotice] = useState("");
  const returnBadges = useRef<string[]>([]);
  const pageRef = useRef(page),
    resetClock = useRef(false),
    recordController = useRef<AbortController | null>(null);
  pageRef.current = page;
  const client = useRef(
    sessionStorage.getItem("quest-client") || crypto.randomUUID(),
  );
  const stateRef = useRef(data),
    busyRef = useRef(false),
    lastInteraction = useRef(Date.now()),
    stopRecording = useRef<null | ((cancel?: boolean) => void)>(null);
  useEffect(() => {
    sessionStorage.setItem("quest-client", client.current);
    if (location.hash) {
      sessionStorage.setItem("quest-pending-invite", location.hash.slice(1));
    }
    if (location.hash) history.replaceState(null, "", location.pathname);
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig);
    refresh();
    const interact = () => (lastInteraction.current = Date.now());
    window.addEventListener("pointerdown", interact);
    window.addEventListener("keydown", interact);
    return () => {
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("keydown", interact);
      recordController.current?.abort();
      stopRecording.current?.(true);
      speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    stateRef.current = data;
  }, [data]);
  async function refresh() {
    try {
      const r = await fetch("/api/state");
      if (r.status === 401) {
        setData(null);
        return;
      }
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      returnBadges.current = (d.pendingBadges || []).map((b: any) => b.id);
      if (returnBadges.current.length && d.session) {
        pageRef.current = "trail";
        setPage("trail");
      }
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const tick = setInterval(() => {
      if (
        stateRef.current?.session?.clientId === client.current &&
        !busyRef.current
      ) {
        const reset = resetClock.current;
        resetClock.current = false;
        send(
          "heartbeat",
          {
            active: practiceActive(
              pageRef.current,
              document.hidden,
              lastInteraction.current,
              Date.now(),
            ),
            resetClock: reset,
          },
          true,
        );
      }
    }, 15000);
    const visible = () => {
      resetClock.current = true;
      if (document.hidden) {
        if (stateRef.current?.session && !busyRef.current)
          send("heartbeat", { active: false }, true);
      } else if (!busyRef.current) refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  async function send(type: string, extra: any = {}, quiet = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!quiet) setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          requestId: crypto.randomUUID(),
          clientId: client.current,
          expectedVersion: stateRef.current.version,
          ...extra,
        }),
      });
      const d: any = await r.json();
      if (!r.ok) {
        if (d.state) {
          setData(d.state);
          stateRef.current = d.state;
        }
        if (r.status === 401) setData(null);
        throw Error(d.error);
      }
      if (
        (type === "finish" || type === "next") &&
        !d.session &&
        stateRef.current.session
      ) {
        setSummary({ results: stateRef.current.session.results });
        setPage("finish");
      }
      setData(d);
      stateRef.current = d;
      if (["answer", "next", "start", "restart"].includes(type)) setAnswer("");
      if (type === "start" || type === "restart" || type === "resume") {
        setBook(null);
        setPage("practice");
        setSummary(null);
      }
      if (type === "dispute")
        setNotice(
          "Saved for review. Keep going—you won’t lose points for asking.",
        );
    } catch (e) {
      if (type === "heartbeat") resetClock.current = true;
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      if (!quiet) setBusy(false);
    }
  }
  async function login(local = false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(local ? "/api/dev-login" : "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.pinEnabled ? { pin } : { invite }),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setPin("");
      setInvite("");
      sessionStorage.removeItem("quest-pending-invite");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function configurePin() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, confirm: pinConfirm }),
      });
      const result: any = await response.json();
      if (!response.ok) throw Error(result.error);
      setPin("");
      setPinConfirm("");
      setInvite("");
      sessionStorage.removeItem("quest-pending-invite");
      setData(null);
      setConfig({ ...config, pinEnabled: true });
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const autoLogin = useRef(false);
  useEffect(() => {
    if (
      invite &&
      config.localPreview === false &&
      !config.pinEnabled &&
      !autoLogin.current
    ) {
      autoLogin.current = true;
      void login();
    }
  }, [config.localPreview, invite]);
  function navigate(next: string) {
    resetClock.current = true;
    if (stateRef.current?.session && !busyRef.current)
      send("heartbeat", { active: false }, true);
    recordController.current?.abort();
    stopRecording.current?.(true);
    setRecording(false);
    speechSynthesis?.cancel();
    setPage(next);
    setNotice("");
    window.scrollTo({ top: 0 });
  }
  async function voice() {
    if (recording) {
      if (stopRecording.current) stopRecording.current();
      else recordController.current?.abort();
      setRecording(false);
      return;
    }
    setError("");
    recordController.current?.abort();
    const controller = new AbortController();
    recordController.current = controller;
    stopRecording.current = null;
    try {
      setRecording(true);
      stopRecording.current = await recordAnswer(
        async (blob) => {
          if (controller.signal.aborted) return;
          setRecording(false);
          setBusy(true);
          try {
            const f = new FormData();
            f.set("file", blob, "answer");
            const r = await fetch("/api/transcribe", {
              method: "POST",
              body: f,
              signal: controller.signal,
            });
            const d: any = await r.json();
            if (!r.ok) throw Error(d.error);
            if (!d.text.trim())
              throw Error(
                "I didn’t catch that. Try again or type your answer.",
              );
            setAnswer(d.text);
            setNotice(
              "Check what I heard. You can change any words before checking.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        },
        (message) => {
          setRecording(false);
          setError(message);
        },
        controller.signal,
      );
    } catch {
      setRecording(false);
      if (!controller.signal.aborted)
        setError("Microphone access is unavailable. You can type your answer.");
    }
  }
  const s = data?.session,
    selected = data?.books.find((b: any) => b.id === book),
    selectedIndex = data?.books.findIndex((b: any) => b.id === book);
  const celebrationBadges = (data?.pendingBadges || []).filter(
    (b: any) =>
      !data.session || page === "finish" || returnBadges.current.includes(b.id),
  );
  return (
    <>
      {celebrationBadges.length > 0 && page !== "practice" && (
        <BadgeCelebration
          badges={celebrationBadges}
          muted={!!data.badgeMuted}
          busy={busy}
          onMute={(muted) => {
            void send("badge-sound", { muted });
          }}
          onDismiss={(album) => {
            void send("acknowledge-badges", {
              badgeIds: celebrationBadges.map((b: any) => b.id),
            }).then(() => {
              if (album) setPage("badges");
            });
          }}
        />
      )}
      <aside className="demo-notice">Public learning edition · R is a sample learner · Original sample stories · Local data only</aside>
      <header className="topbar">
        <a className="parent-switch" href="/parent">
          Parent view
        </a>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("trail");
          }}
        >
          <span className="brand-mark">☀</span>
          <span>
            R’s<span className="brand-sub">READING QUEST</span>
          </span>
        </a>
        {data && (
          <>
            <nav aria-label="Main navigation">
              {[
                ["trail", "🧭", "Adventure"],
                ["practice", "⚡", "Practice"],
                ["badges", "🏅", "Badges"],
              ].map(([id, icon, label]) => (
                <button
                  key={id}
                  className={page === id ? "active" : ""}
                  onClick={() => navigate(id)}
                >
                  <span>{icon}</span>
                  {label}
                </button>
              ))}
            </nav>
            <div className="avatar" aria-label="R">
              R
            </div>
          </>
        )}
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {!data ? (
        <main className="login">
          <div className="welcome-art">
            <Compass />
          </div>
          <p className="eyebrow">YOUR NEXT ADVENTURE AWAITS</p>
          <h1>Welcome aboard, R!</h1>
          <p className="muted">Ten sample stories. A whole world to discover.</p>
          {config.localPreview ? (
            <>
              <p className="local-label">
                Local preview · progress stays on this computer’s server
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => login(true)}
              >
                Set sail →
              </button>
            </>
          ) : config.pinEnabled ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <label htmlFor="quest-pin">Enter your four-digit PIN</label>
              <input
                id="quest-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
              />
              <button className="primary" disabled={busy || pin.length !== 4}>
                {busy ? "Opening…" : "Set sail →"}
              </button>
            </form>
          ) : (
            <div>
              <p className="muted">
                {invite
                  ? "Your private adventure is ready."
                  : "Open your private adventure link to set sail."}
              </p>
              {invite && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => login()}
                >
                  {busy ? "Opening your adventure…" : "Open my adventure →"}
                </button>
              )}
            </div>
          )}
        </main>
      ) : (
        <main>
          {!config.pinEnabled && !config.localPreview && (
            <form
              className="pin-setup"
              onSubmit={(e) => {
                e.preventDefault();
                void configurePin();
              }}
            >
              <h2>Set your four-digit PIN</h2>
              <p>
                Keep your progress and use the normal app address. Saving
                disables the old private link and signs out existing devices.
              </p>
              <label htmlFor="new-pin">New PIN</label>
              <input
                id="new-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
              />
              <label htmlFor="confirm-pin">Confirm PIN</label>
              <input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="new-password"
                value={pinConfirm}
                onChange={(e) =>
                  setPinConfirm(e.target.value.replace(/\D/g, ""))
                }
                required
              />
              <button
                className="primary"
                disabled={busy || pin.length !== 4 || pin !== pinConfirm}
              >
                Save PIN
              </button>
            </form>
          )}
          {page === "trail" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="red-dot" /> R’S GRAND READING ADVENTURE
                  </div>
                  <h1>
                    Big stories.
                    <br />
                    Bigger adventures.
                  </h1>
                  <p>Your crew is ready. Let’s discover what you remember!</p>
                  <div className="quest-actions">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => (s ? send("resume") : send("start"))}
                    >
                      {s
                        ? `Resume your quest — question ${s.index + 1} of ${s.total}`
                        : "Start today’s quest"}{" "}
                      <span>→</span>
                    </button>
                    {s && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Start a fresh quest? Your current place will be replaced with a new mix of questions. You keep all earned points and badges. Choose Cancel to keep your place.",
                            )
                          )
                            void send("restart");
                        }}
                      >
                        Start fresh
                      </button>
                    )}
                  </div>
                  <span className="session-note">
                    10–15 minutes · a little new, a little review
                  </span>
                </div>
                <div className="hero-character">
                  <span className="speech-bubble">Let’s set sail!</span>
                  <Compass />
                  <span className="character-name">YOUR CREWMATE · COMPASS</span>
                </div>
                <span className="hero-story10 one">✦</span>
                <span className="hero-story10 two">✧</span>
              </section>
              <section className="stats" aria-label="Your progress">
                <div>
                  <span>⚡</span>
                  <p>
                    <strong>{data.points}</strong> adventure points
                  </p>
                </div>
                <div>
                  <span>🔥</span>
                  <p>
                    <strong>{data.streak}</strong> day streak
                  </p>
                </div>
                <div>
                  <span>📚</span>
                  <p>
                    <strong>
                      {data.books.filter((b: any) => b.read).length}
                      <small> / 10</small>
                    </strong>{" "}
                    books read
                  </p>
                </div>
                <div>
                  <span>🏅</span>
                  <p>
                    <strong>
                      {data.badges.filter((b: any) => b.earned).length}
                      <small> / 30</small>
                    </strong>{" "}
                    badges earned
                  </p>
                </div>
              </section>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ONE BOOK. ONE NEW WORLD.</p>
                  <h2>Your adventure trail</h2>
                </div>
                <span className="chip">Pick any book to explore</span>
              </div>
              <section className="trail" aria-label="Book adventure trail">
                <div className="trail-line" />
                {data.books.map((b: any, i: number) => (
                  <button
                    className={"island island-" + (i % 4)}
                    key={b.id}
                    onClick={() => setBook(b.id)}
                  >
                    <span className="island-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="book-art">
                      <Cover book={b} index={i} />
                      <span className={"read-stamp " + (b.read ? "yes" : "")}>
                        {b.read ? "✓ READ" : "TO READ"}
                      </span>
                    </div>
                    <h3>{b.title}</h3>
                    <span className="island-status">
                      {b.count
                        ? `${b.count} questions ready`
                        : "Questions coming soon"}
                    </span>
                    <div className="progress-track">
                      <span
                        style={{
                          width:
                            (b.count ? (b.attempted / b.count) * 100 : 0) + "%",
                        }}
                      />
                    </div>
                    <small>
                      {b.count
                        ? `${b.attempted} explored · ${b.masterDays}/2 mastery days`
                        : "A new adventure is on its way"}
                    </small>
                  </button>
                ))}
              </section>
              <aside className="tip">
                <span>☀</span>
                <div>
                  <strong>Every small quest counts.</strong>
                  <p>
                    You can practice a book before finishing it. Full recaps
                    unlock when you mark it read.
                  </p>
                </div>
              </aside>
            </>
          )}
          {page === "practice" &&
            (!s ? (
              <section className="empty">
                <Compass />
                <p className="eyebrow">READY WHEN YOU ARE</p>
                <h1>A little practice. A big adventure.</h1>
                <p>
                  Mix questions from your books, or choose one on the trail.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => send("start")}
                >
                  Start a mixed quest →
                </button>
                <button
                  className="text-button"
                  onClick={() => navigate("trail")}
                >
                  Choose a book
                </button>
              </section>
            ) : s.clientId !== client.current ? (
              <section className="empty">
                <h1>Your quest is waiting.</h1>
                <p>
                  It’s open on another screen. Resume here to switch devices.
                </p>
                <button className="primary" onClick={() => send("resume")}>
                  Resume here
                </button>
              </section>
            ) : (
              <section className="practice">
                <div className="practice-top">
                  <button
                    className="text-button"
                    disabled={busy || recording}
                    onClick={() => {
                      if (
                        window.confirm(
                          "End this quest? You keep your earned points and badges, but cannot resume this question. To save your place, choose Cancel, then Pause & save my place.",
                        )
                      )
                        void send("finish");
                    }}
                  >
                    End this quest
                  </button>
                  <span>
                    Question {s.index + 1} of {s.total}
                  </span>
                  <span>
                    ⚡{" "}
                    {s.results.reduce((n: number, r: any) => n + r.points, 0)}{" "}
                    pts
                  </span>
                </div>
                <p className="session-note">
                  Taking a break?{" "}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => navigate("trail")}
                  >
                    Pause &amp; save my place
                  </button>
                  <br />
                  Ending the quest keeps your rewards, but clears your place.
                </p>
                <div className="quest-track">
                  <span style={{ width: (s.index / s.total) * 100 + "%" }} />
                </div>
                {s.activeSeconds >= 900 && (
                  <p className="notice">
                    You’ve had a good practice! You can finish after this
                    question.
                  </p>
                )}
                <article className="question-card">
                  <p className="eyebrow">
                    {
                      data.books.find((b: any) => b.id === s.question.bookId)
                        ?.title
                    }
                  </p>
                  <div className="question-stage">
                    {s.revealed
                      ? "TREASURE FOUND"
                      : s.stage === 0
                        ? "GIVE IT A GO"
                        : s.stage === 1
                          ? "A LITTLE HELP"
                          : "NARROW IT DOWN"}
                  </div>
                  <h1>{s.question.text}</h1>
                  <button
                    className="listen"
                    onClick={() => {
                      speechSynthesis.cancel();
                      speechSynthesis.speak(
                        new SpeechSynthesisUtterance(s.question.text),
                      );
                    }}
                  >
                    ◖)) Read it to me
                  </button>
                  {s.stage >= 1 && !s.revealed && (
                    <div className="hint">
                      <span>💡</span>
                      <p>{s.question.hint}</p>
                    </div>
                  )}
                  {!s.revealed && s.stage < 2 && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        send("answer", { answer });
                      }}
                    >
                      <div className="answer-input">
                        <textarea
                          aria-label="Your answer"
                          placeholder="Your answer goes here…"
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          maxLength={500}
                          rows={2}
                        />
                        {config.voiceEnabled && (
                          <button
                            type="button"
                            className={"mic " + (recording ? "recording" : "")}
                            onClick={voice}
                            aria-label={
                              recording ? "Stop recording" : "Record answer"
                            }
                          >
                            {recording ? "■" : "🎙"}
                          </button>
                        )}
                      </div>
                      <p className="input-note">
                        {config.voiceEnabled
                          ? "Say it, check the words, then check your answer."
                          : "Type your answer for now. Voice will join the crew soon."}
                      </p>
                      <button
                        className="primary"
                        disabled={busy || recording || !answer.trim()}
                      >
                        Check my answer →
                      </button>
                      {s.stage === 1 && answer.trim() && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => send("dispute", { answer })}
                        >
                          I think my answer is right
                        </button>
                      )}
                    </form>
                  )}
                  {!s.revealed && s.stage === 2 && (
                    <div className="choice-grid">
                      {s.question.choices.map((c: any, i: number) => (
                        <button
                          key={c.id}
                          disabled={busy}
                          onClick={() => send("answer", { choiceId: c.id })}
                        >
                          <span>{"ABCD"[i]}</span>
                          {c.text}
                        </button>
                      ))}
                    </div>
                  )}
                  {s.revealed && (
                    <div
                      className={
                        "feedback " + (s.question.correct ? "correct" : "")
                      }
                    >
                      <div className="feedback-icon">
                        {s.question.correct ? "✦" : "🌱"}
                      </div>
                      <h2>
                        {s.question.correct
                          ? "You found it!"
                          : "One to remember for next time."}
                      </h2>
                      <p className="correct-answer">
                        <small>Correct answer and spelling: </small>
                        {s.question.answer}
                      </p>
                      <p>
                        {s.stage === 0 && s.question.correct
                          ? "You remembered without help. Nice work!"
                          : "We’ll bring this back in a later quest so it sticks."}
                      </p>
                      <span className="chip">
                        +{s.question.points} adventure points
                      </span>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => send("next")}
                      >
                        {s.index === s.total - 1
                          ? "Finish quest"
                          : "Next question"}{" "}
                        →
                      </button>
                    </div>
                  )}
                  {notice && (
                    <p className="notice" role="status">
                      {notice}
                    </p>
                  )}
                </article>
              </section>
            ))}
          {page === "finish" && (
            <section className="empty finish">
              <div className="celebrate">✦ 🏴‍☠️ ✦</div>
              <p className="eyebrow">ANOTHER ADVENTURE IN THE BOOKS</p>
              <h1>Nice sailing, R!</h1>
              <p>You explored {summary?.results.length || 0} questions.</p>
              <div className="finish-stats">
                <strong>
                  +
                  {summary?.results.reduce(
                    (n: number, r: any) => n + r.points,
                    0,
                  ) || 0}
                  <small>points earned</small>
                </strong>
                <strong>
                  {summary?.results.filter(
                    (r: any) => r.correct && r.stage === 0,
                  ).length || 0}
                  <small>without help</small>
                </strong>
              </div>
              <p className="muted">
                Every try helps. Questions with hints or choices will return for
                another adventure.
              </p>
              <button className="primary" onClick={() => navigate("trail")}>
                Back to the trail →
              </button>
              <button
                className="text-button"
                onClick={() => navigate("badges")}
              >
                Open badge album
              </button>
            </section>
          )}
          {page === "badges" && (
            <section>
              <div className="album-header">
                <div>
                  <p className="eyebrow">COLLECT YOUR OWN STORY</p>
                  <h1>R’s badge album</h1>
                  <p className="muted">
                    Little victories. Big keepsakes. Yours forever once earned.
                  </p>
                </div>
                <div className="album-total">
                  <strong>
                    {data.badges.filter((b: any) => b.earned).length}
                  </strong>{" "}
                  / 30
                  <br />
                  <small>COLLECTED</small>
                </div>
              </div>
              {[
                ["Book treasures", 0, 10],
                ["Reading milestones", 10, 16],
                ["Keep the adventure going", 16, 24],
                ["Quest achievements", 24, 30],
              ].map(([title, start, end]) => (
                <div className="badge-section" key={title}>
                  <h2>{title}</h2>
                  <div className="badge-grid">
                    {data.badges.slice(start, end).map((b: any) => (
                      <button
                        className="badge-card"
                        key={b.id}
                        onClick={() => setBadge(b)}
                      >
                        <Medal badge={b} />
                        <h3>{b.name}</h3>
                        <small>
                          {b.earned
                            ? "Earned " + b.earned
                            : "Still to discover"}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
          <footer>
            <span>Made for R · One quest at a time</span>
            <button
              onClick={async () => {
                recordController.current?.abort();
                stopRecording.current?.(true);
                await fetch("/api/logout", { method: "POST" });
                setData(null);
              }}
            >
              Sign out
            </button>
          </footer>
        </main>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setBook(null)}>
          <section
            className="modal book-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setBook(null)}
              aria-label="Close book"
            >
              ×
            </button>
            <div className="book-modal-head">
              <Cover book={selected} index={selectedIndex} />
              <div>
                <p className="eyebrow">YOUR BOOK COLLECTION</p>
                <h2 id="book-title">{selected.title}</h2>
                <p className="muted">{selected.author}</p>
                <button
                  className="read-button"
                  disabled={busy}
                  onClick={() =>
                    send("read", { bookId: selected.id, read: !selected.read })
                  }
                >
                  {selected.read
                    ? "✓ Finished reading · undo"
                    : "Mark as read ✓"}
                </button>
              </div>
            </div>
            <p className="muted">{selected.introduction}</p>
            <div className="recap">
              <strong>
                {selected.read ? "🔓 Story refresher" : "🔒 Story refresher"}
              </strong>
              <p>{selected.recap}</p>
              {selected.read && (
                <details>
                  <summary>About this summary</summary>
                  <p className="muted">
                    A short reminder of the story, not a chapter-by-chapter
                    guide.
                  </p>
                  {selected.summarySources?.map(
                    (source: { label: string; url: string }) => (
                      <p key={source.url}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.label}
                        </a>
                      </p>
                    ),
                  )}
                </details>
              )}
            </div>
            <p>
              {selected.count
                ? `${selected.count} questions ready to explore`
                : "Your questions are coming soon. You can still mark this book as read."}
            </p>
            <button
              className="primary"
              disabled={busy || !selected.count || !!s}
              onClick={() => send("start", { bookId: selected.id })}
            >
              Practice this book →
            </button>
            {s && (
              <p className="muted">
                Finish or resume your current quest first.
              </p>
            )}
          </section>
        </div>
      )}
      {badge && (
        <div className="modal-backdrop" onClick={() => setBadge(null)}>
          <section
            className="modal badge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="badge-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setBadge(null)}
              aria-label="Close badge"
            >
              ×
            </button>
            <Medal badge={badge} />
            <p className="eyebrow">
              {badge.earned ? "YOUR TREASURE" : "YOUR NEXT DISCOVERY"}
            </p>
            <h2 id="badge-title">{badge.name}</h2>
            <p>{badge.rule}</p>
            <p className="muted">
              Once earned, this badge stays yours—even when new questions
              arrive.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
