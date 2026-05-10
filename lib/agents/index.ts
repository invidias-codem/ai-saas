import { ProactivePostPlanner } from "./bluesky/ProactivePostPlanner";
import { BlueskyPoster } from "./bluesky/BlueskyPoster";

export { ProactivePostPlanner } from "./bluesky/ProactivePostPlanner";
export { BlueskyPoster } from "./bluesky/BlueskyPoster";

export function createBlueskyPoster(_generateText: (prompt: string) => Promise<string>) {
  return new BlueskyPoster();
}
