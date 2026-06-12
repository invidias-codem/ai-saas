import { Inngest } from "inngest";
const inngest = new Inngest({ id: "test" });
inngest.createFunction(
  { id: "test" },
  { event: "test" },
  async ({ event }) => {}
);
