/** Never keep microphone tracks alive after navigation, cancellation or hidden tabs. */
export async function recordAnswer(
  onStop: (audio: Blob) => void,
  onError: (message: string) => void,
  signal: AbortSignal,
) {
  let stream: MediaStream | undefined,
    recorder: MediaRecorder | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    cancelled = false,
    cleaned = false;
  const parts: BlobPart[] = [];
  let size = 0;
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (stream && !cleaned) {
      stream.getTracks().forEach((t) => t.stop());
      cleaned = true;
    }
    document.removeEventListener("visibilitychange", hidden);
    signal.removeEventListener("abort", abort);
  };
  const stop = (cancel = false) => {
    cancelled = cancelled || cancel;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    cleanup();
  };
  const abort = () => stop(true);
  const hidden = () => {
    if (document.hidden) {
      stop(true);
      onError("Recording paused. Tap the microphone when you’re ready.");
    }
  };
  signal.addEventListener("abort", abort, { once: true });
  document.addEventListener("visibilitychange", hidden);
  try {
    if (signal.aborted || document.hidden)
      throw new DOMException("Cancelled", "AbortError");
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (cancelled || signal.aborted || document.hidden) {
      cleanup();
      throw new DOMException("Cancelled", "AbortError");
    }
    const type = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    recorder.ondataavailable = (e) => {
      size += e.data.size;
      if (size > 2000000) {
        stop(true);
        onError("That recording was too long. Try a shorter answer.");
      } else parts.push(e.data);
    };
    recorder.onstop = () => {
      cleanup();
      if (!cancelled && !signal.aborted)
        onStop(new Blob(parts, { type: recorder!.mimeType }));
    };
    recorder.onerror = () => {
      stop(true);
      onError("Microphone unavailable. You can type your answer.");
    };
    timer = setTimeout(() => stop(), 20000);
    recorder.start(200);
    return stop;
  } catch (e) {
    cleanup();
    throw e;
  }
}
