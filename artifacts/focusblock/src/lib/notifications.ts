// Browser notifications give a reliable, OS-level alert when the focus timer
// finishes — including when the tab is in the background, where the Web Audio
// beep is unreliable (browsers suspend audio and throttle timers in hidden
// tabs). Permission must be requested from a user gesture.

const supported = () =>
  typeof window !== "undefined" && "Notification" in window;

export const notificationsBlocked = () =>
  supported() && Notification.permission === "denied";

// Ask for permission. Call this from a user gesture (e.g. clicking Start).
// Safe to call repeatedly — it no-ops once a decision has been made.
export const requestNotificationPermission = () => {
  if (!supported()) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
};

export const showNotification = (title: string, body: string) => {
  if (!supported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      tag: "focusblock-timer",
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (_) {
    // Some browsers throw if Notification is constructed outside a SW context;
    // the audio beep remains as a fallback.
  }
};
