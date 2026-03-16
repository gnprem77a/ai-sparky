export function useTrackEvent() {
  const track = (feature: string) => {
    fetch("/api/events/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ feature }),
    }).catch(() => {});
  };
  return track;
}
