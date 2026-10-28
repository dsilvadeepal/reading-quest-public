export function practiceActive(
  page: string,
  hidden: boolean,
  lastInteraction: number,
  now: number,
) {
  return page === "practice" && !hidden && now - lastInteraction < 60000;
}
