import { useEffect, useId, useRef } from "react";

type Props = {
  badges: any[];
  muted: boolean;
  busy: boolean;
  onMute: (muted: boolean) => void;
  onDismiss: (album: boolean) => void;
};

/** Eligibility and acknowledgement belong to the saved learner state. */
export default function BadgeCelebration(props: Props) {
  const { badges, muted, busy, onMute, onDismiss } = props;
  const unique = [
    ...new Map(badges.map((badge) => [badge.id, badge])).values(),
  ];
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const sound = useRef<AudioContext | null>(null);
  const played = useRef(false);
  const playing = useRef(false);

  async function playChime(userGesture = false) {
    if (latest.current.muted || played.current || playing.current) return;
    playing.current = true;
    try {
      const Audio = window.AudioContext || (window as any).webkitAudioContext;
      if (!Audio) return;
      const context: AudioContext = sound.current || new Audio();
      sound.current = context;
      // A suspended context is resumed only after a user gesture on browsers
      // which block autoplay. No permission prompt or recorded audio is needed.
      if (context.state !== "running") {
        if (!userGesture) return;
        await context.resume();
      }
      if (context.state !== "running" || latest.current.muted) return;
      played.current = true;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const start = context.currentTime + index * 0.11;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.09, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.32);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    } catch {
      // Audio is decorative; the celebration remains fully usable without it.
    } finally {
      playing.current = false;
    }
  }

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onDismiss(false);
      }
      if (event.key !== "Tab" || !element) return;
      const controls = [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex="0"]',
        ),
      ];
      const first = controls[0],
        last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        element.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === element)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === element)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    void playChime();
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = oldOverflow;
      const context = sound.current;
      sound.current = null;
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (muted && sound.current?.state === "running")
      void sound.current.suspend().catch(() => {});
  }, [muted]);

  if (!unique.length) return null;
  return (
    <div
      className="celebration-overlay"
      onKeyDown={(event) => {
        if (
          (event.key === "Enter" || event.key === " ") &&
          !(event.target as HTMLElement).closest("[data-sound-toggle]")
        )
          void playChime(true);
      }}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest("[data-sound-toggle]"))
          void playChime(true);
      }}
    >
      <div
        ref={panel}
        className="celebration-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        aria-busy={busy}
      >
        <button
          className="celebration-sound"
          data-sound-toggle
          aria-pressed={muted}
          aria-label={
            muted ? "Unmute celebration sounds" : "Mute celebration sounds"
          }
          onClick={() => {
            latest.current = { ...latest.current, muted: !muted };
            onMute(!muted);
            if (muted) void playChime(true);
          }}
        >
          <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>{" "}
          {muted ? "Sound off" : "Sound on"}
        </button>
        <div className="celebration-story10les" aria-hidden="true">
          ✦ <span>✧</span> ✦
        </div>
        <p className="celebration-eyebrow">A little practice. A big win.</p>
        <h2 id={titleId}>
          {unique.length === 1
            ? "New badge, R!"
            : `${unique.length} new badges, R!`}
        </h2>
        <div className="celebration-badges">
          {unique.map((badge, index) => (
            <article
              className="celebration-badge"
              key={badge.id}
              style={
                {
                  "--badge-color": badge.color || "#efc65e",
                  "--badge-delay": `${index * 80}ms`,
                } as React.CSSProperties
              }
            >
              <div className="celebration-medal" aria-hidden="true">
                <span>{badge.icon}</span>
                <i>✓</i>
              </div>
              <h3>{badge.name}</h3>
              <p>{badge.rule}</p>
            </article>
          ))}
        </div>
        <div className="celebration-actions">
          <button
            className="celebration-primary"
            disabled={busy}
            onClick={() => onDismiss(false)}
          >
            {busy ? "Saving…" : "Keep adventuring →"}
          </button>
          <button
            className="celebration-album"
            disabled={busy}
            onClick={() => onDismiss(true)}
          >
            See my badge album
          </button>
        </div>
      </div>
    </div>
  );
}
