import { useEffect, useRef, useState } from "react";
export default function Parent() {
  const [pin, setPin] = useState(""),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const token = useRef("");
  const generation = useRef(0);
  const lock = () => {
    generation.current++;
    token.current = "";
    setData(null);
    setPin("");
  };
  useEffect(() => {
    const timer = setInterval(() => {
      if (token.current && Number(token.current.split(".")[0]) <= Date.now())
        lock();
    }, 1000);
    const hidden = () => {
      if (document.hidden) lock();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function refresh() {
    const requestedToken = token.current;
    const r = await fetch("/api/parent/progress", {
      headers: { Authorization: "Bearer " + token.current },
    });
    const d: any = await r.json();
    if (!r.ok) {
      lock();
      throw Error(d.error);
    }
    if (token.current === requestedToken && requestedToken) setData(d);
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    const loginGeneration = generation.current;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/parent/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d: any = await r.json();
      setPin("");
      if (!r.ok) throw Error(d.error);
      if (generation.current !== loginGeneration || document.hidden) return;
      token.current = d.token;
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const duration = (seconds: number) =>
    seconds >= 3600
      ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
      : seconds >= 60
        ? `${Math.floor(seconds / 60)}m`
        : `${Math.floor(seconds)}s`;
  const date = (value: number | string, options: Intl.DateTimeFormatOptions) =>
    new Date(value).toLocaleString("en-US", {
      timeZone: "America/New_York",
      ...options,
    });
  const dayDate = (day: string) => `${day}T12:00:00Z`;
  const artwork: Record<string, [string, string]> = {
    story01: ["🎨", "#e5c57d"],
    story04: ["🔎", "#b7cbbf"],
    story05: ["🌊", "#a4c5d8"],
    story02: ["🐹", "#ccbddc"],
    story03: ["🏚", "#b4bbaa"],
    story06: ["🐉", "#c2cddd"],
    "story07": ["🤖", "#c4b6d8"],
    "story08": ["👾", "#b9c79c"],
    "story09": ["✏️", "#e6ba95"],
    story10: ["🔥", "#dfad93"],
  };
  return (
    <div className="parent-shell">
      <header className="parent-topbar">
        <a className="parent-brand" href="/" onClick={lock}>
          <span aria-hidden="true">☀</span>Reading Quest
        </a>
        <nav className="parent-toggle" aria-label="App view">
          <a href="/" onClick={lock}>
            R
          </a>
          <span aria-current="page">Parent</span>
        </nav>
      </header>
      <main className="parent-page">
        <div className="parent-title">
          <div>
            <p className="parent-eyebrow">Your quiet check-in</p>
            <h1>R’s progress</h1>
          </div>
          {data && (
            <div className="parent-last">
              <span>Last practiced</span>
              <strong>
                {data.lastPractice
                  ? date(data.lastPractice, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "No practice yet"}
              </strong>
              <small>Eastern · Last submitted answer</small>
            </div>
          )}
        </div>
        {error && (
          <p className="parent-error" role="alert">
            {error}
          </p>
        )}
        {!data ? (
          <form className="parent-login" onSubmit={login}>
            <h2>Parent view</h2>
            <p>Your own four-digit PIN.</p>
            <label htmlFor="parent-pin">Parent PIN</label>
            <input
              id="parent-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="off"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            <button disabled={busy}>
              {busy ? "Opening…" : "Open parent view"}
            </button>
            <small>Locks when you leave this tab or after 15 minutes.</small>
          </form>
        ) : (
          <>
            <section
              className="parent-week"
              aria-label="Last seven days of practice"
            >
              <div>
                <h2>Last 7 days</h2>
                <p className="parent-label">
                  {data.week.calendar?.length > 0 &&
                    `${date(dayDate(data.week.calendar[0].day), { month: "long", day: "numeric" })} – ${date(data.asOf, { month: "short", day: "numeric" })}`}
                </p>
                <div className="parent-numbers">
                  <div>
                    <strong>
                      {data.week.days}
                      <small> / 7</small>
                    </strong>
                    <span>days practiced</span>
                  </div>
                  <div>
                    <strong>
                      {duration(data.week.activeSeconds)}
                      {!data.week.completeTime && <small>+</small>}
                    </strong>
                    <span>active practice</span>
                  </div>
                  <div>
                    <strong>{data.week.completed}</strong>
                    <span>practice sessions</span>
                  </div>
                </div>
                {!data.week.completeTime && (
                  <p className="parent-time-note">
                    Earlier daily minutes weren’t recorded. All-time total is
                    preserved.
                  </p>
                )}
              </div>
              <div className="parent-days" aria-label="Practice calendar">
                {data.week.calendar.map((d: any, i: number) => (
                  <div
                    className="parent-day"
                    key={d.day}
                    aria-label={`${date(dayDate(d.day), { month: "long", day: "numeric" })}: ${d.practiced ? "practiced" : "no submitted answers"}`}
                  >
                    <span>{date(dayDate(d.day), { weekday: "short" })}</span>
                    <div
                      className={`parent-day-dot ${d.practiced ? "done" : ""} ${i === data.week.calendar.length - 1 ? "today" : ""}`}
                      aria-hidden="true"
                    >
                      {d.practiced ? "✓" : "—"}
                    </div>
                    <span>{Number(d.day.slice(-2))}</span>
                  </div>
                ))}
              </div>
            </section>
            <div className="parent-totals" aria-label="All-time totals">
              <span className="parent-label">ALL TIME</span>
              <span>
                <b>{duration(data.activeSeconds)}</b> practiced
              </span>
              <span>
                <b>{data.activeDays}</b> active days
              </span>
              <span>
                <b>{data.completed}</b> sessions
              </span>
              <span>
                <b>{data.points}</b> points
              </span>
              <span>
                <b>{data.badges.length}</b> badges
              </span>
            </div>
            <div className="parent-books-heading">
              <h2>His bookshelf</h2>
              <span className="parent-legend">
                <span>● Independent</span>
                <span>● With help</span>
                <span>● Missed</span>
              </span>
            </div>
            <div className="parent-books">
              {data.books.map((b: any) => {
                const art = artwork[b.id] || ["📖", "#d4c6af"];
                const helped = b.hinted + b.choices;
                return (
                  <details className="parent-book" key={b.id}>
                    <summary>
                      <span
                        className="parent-cover"
                        style={{ background: art[1] }}
                        aria-hidden="true"
                      >
                        {art[0]}
                      </span>
                      <span>
                        <strong className="parent-book-name">{b.title}</strong>
                        <span className="parent-sub">
                          {b.read ? "Finished reading" : "Not marked read"}
                        </span>
                      </span>
                      <span className="parent-coverage">
                        <b>
                          {b.available
                            ? `${b.covered} / ${b.available}`
                            : "Questions coming"}
                        </b>
                        <span className="parent-sub">
                          {b.available
                            ? "questions practiced"
                            : "No practice data yet"}
                        </span>
                        {b.available > 0 && (
                          <span className="parent-bar">
                            <span
                              style={{
                                width: `${(100 * b.covered) / b.available}%`,
                              }}
                            />
                          </span>
                        )}
                      </span>
                      <span className="parent-result">
                        {b.covered > 0 ? (
                          <>
                            <b>{b.independent} independently correct</b>
                            <span className="parent-sub">
                              {b.hinted} with hint · {b.choices} with choices ·{" "}
                              {b.missed} missed
                            </span>
                            <span className="parent-bar">
                              <span
                                style={{
                                  width: `${(100 * b.independent) / b.covered}%`,
                                }}
                              />
                              <span
                                style={{
                                  width: `${(100 * helped) / b.covered}%`,
                                }}
                              />
                            </span>
                          </>
                        ) : (
                          <span className="parent-label">
                            Not enough practice yet
                          </span>
                        )}
                      </span>
                      <span className="parent-chevron" aria-hidden="true">
                        ›
                      </span>
                    </summary>
                    <div className="parent-book-inside">
                      {b.review.length ? (
                        <>
                          <div className="parent-inside-title">
                            <b>Questions needing help</b>
                            <span>{b.review.length} total</span>
                          </div>
                          <ul>
                            {b.review.map((q: any) => (
                              <li key={q.number}>
                                <span>
                                  <span className="parent-qnum">
                                    Q{q.number}
                                  </span>
                                  {q.question}
                                </span>
                                <span
                                  className={`parent-support ${q.support === "Answer revealed" ? "missed" : ""}`}
                                >
                                  {q.support === "Answer revealed"
                                    ? "Missed"
                                    : q.support}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="parent-label">
                          {b.covered
                            ? "All practiced questions were last answered independently."
                            : b.available
                              ? "No questions practiced yet."
                              : "Practice results appear when questions are available."}
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
            <p className="parent-note">
              Latest result per question. Coverage shown separately.
            </p>
            {data.historicalAnswers > 0 && (
              <p className="parent-note">
                {data.historicalAnswers} retired or earlier-version answers
                excluded from book results; earned points and badges kept.
              </p>
            )}
            <footer className="parent-footer">
              <span>
                Updated{" "}
                {date(data.asOf, { hour: "numeric", minute: "2-digit" })}{" "}
                Eastern · Read-only
              </span>
              <div>
                <button
                  className="parent-quiet-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Refreshing…" : "Refresh"}
                </button>
                <button className="parent-quiet-button" onClick={lock}>
                  Lock parent view
                </button>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
