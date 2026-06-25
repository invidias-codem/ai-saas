import * as Sentry from "@sentry/nextjs";
import { initSentry } from "@/lib/observability/sentry";

initSentry();

export { Sentry };
