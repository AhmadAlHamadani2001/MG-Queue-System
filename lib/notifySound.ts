"use client";

// A short two-tone chime, synthesized on the fly so there's no audio
// asset to host or load. Mobile browsers (especially iOS Safari)
// block audio until a real user gesture has happened on the page, so
// call unlockAudio() once on the first tap/touch, then playCallChime()
// whenever the alert itself is needed — the unlock only has to happen
// once per page load.

let ctx: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  return ctx;
}

// Real browser popup notifications — works well on Android Chrome even
// when the tab isn't focused, as long as the browser itself is still
// running. iOS Safari doesn't support the Notification API for a
// regular tab at all (only for a home-screen-installed PWA with a full
// push backend, which is a separate, bigger build) — this function
// simply does nothing there, no error, no crash.
export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function showCallNotification(advisorName: string | null, ticketNumber: string, lang: "en" | "ar") {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const title = lang === "en" ? "It's your turn!" : "حان دورك!";
    const body =
      lang === "en"
        ? `Please proceed now${advisorName ? ` — ${advisorName} is ready for you` : ""}. Ticket ${ticketNumber}.`
        : `الرجاء التوجه الآن${advisorName ? ` — ${advisorName} بانتظارك` : ""}. التذكرة ${ticketNumber}.`;
    new Notification(title, {
      body,
      icon: "/mg-logo.jpg",
      tag: "queue-call",
      requireInteraction: true,
    });
  } catch {
    // Not supported here — the chime/speech/vibration already fired regardless.
  }
}

export function unlockAudio() {
  if (unlocked) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  unlocked = true;
}

export function unlockSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const utter = new SpeechSynthesisUtterance("");
    utter.volume = 0;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

// Speaks "Please proceed now, <advisor> is ready for you" in English
// then Arabic, back to back — utterances queue automatically, so two
// speak() calls play sequentially without needing callbacks. Falls
// back to a name-less phrase if the advisor's name isn't available.
export function playCallAnnouncement(advisorName: string | null) {
  playCallChime();

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  // Give the chime room to finish and register with the listener
  // before the voice starts, instead of talking right over it.
  setTimeout(() => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();

      const englishText = advisorName
        ? `Please proceed now. ${advisorName} is ready for you.`
        : "Please proceed now. We are ready for you.";
      const arabicText = advisorName
        ? `الرجاء التوجه الآن. ${advisorName} بانتظارك.`
        : "الرجاء التوجه الآن. نحن بانتظارك.";

      const utterEn = new SpeechSynthesisUtterance(englishText);
      utterEn.lang = "en-US";
      const utterAr = new SpeechSynthesisUtterance(arabicText);
      utterAr.lang = "ar-SA";

      synth.speak(utterEn);
      synth.speak(utterAr);
    } catch {
      // Speech is a nice-to-have here too — the chime/vibration above
      // already fired regardless.
    }
  }, 2000);
}

export function playCallChime() {
  try {
    const audioCtx = getContext();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    const now = audioCtx.currentTime;
    [880, 1108.73].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.22;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  } catch {
    // Audio is a nice-to-have here, never worth breaking the page over.
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      // ignore
    }
  }
}
