import { BlueskyPoster } from "./bluesky/BlueskyPoster";

export { BlueskyPoster } from "./bluesky/BlueskyPoster";
export {
  logProactiveBlueskyPost,
  planDistributionBlueskyPost,
  planProactiveBlueskyPost,
  updateBlueskyTopicState,
} from "./bluesky/ProactivePostPlanner";

export function createBlueskyPoster(_generateText: (prompt: string) => Promise<string>) {
  return new BlueskyPoster();
}
