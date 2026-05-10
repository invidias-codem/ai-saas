import { ProactivePostPlanner } from "./bluesky/ProactivePostPlanner";
import { BlueskyPoster } from "./bluesky/BlueskyPoster";

export { ProactivePostPlanner } from "./bluesky/ProactivePostPlanner";
export { BlueskyPoster } from "./bluesky/BlueskyPoster";

export function createBlueskyPoster(generateText: (prompt: string) => Promise<string>) {
  const planner = new ProactivePostPlanner();
  return new BlueskyPoster(planner, generateText);
}
