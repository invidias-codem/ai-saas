export {
    CheerioEngineFactory,
    PlaywrightEngineFactory,
    PuppeteerEngineFactory,
    EngineFactoryRegistry
} from "./EngineFactory.js";
export type { Engine, IEngineFactory } from "./EngineFactory.js";
// Additional type exports for better API surface
export type { EngineOptions, CrawlingContext } from "./Base.js"; 