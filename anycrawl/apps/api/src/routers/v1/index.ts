import express, { Router, ErrorRequestHandler } from "express";
import { ScrapeController } from "../../controllers/v1/ScrapeController.js";
import { SearchController } from "../../controllers/v1/SearchController.js";
import { CrawlController } from "../../controllers/v1/CrawlController.js";
import { controllerWrapper } from "../../utils/AsyncHandler.js";

const router: express.Router = Router();
const scrapeController = new ScrapeController();
const searchController = new SearchController();
const crawlController = new CrawlController();

router.post("/scrape", controllerWrapper(scrapeController.handle));
router.post("/search", controllerWrapper(searchController.handle));

// Crawl routes
router.post("/crawl", controllerWrapper(crawlController.start));
router.get("/crawl/:jobId/status", controllerWrapper(crawlController.status));
router.get("/crawl/:jobId", controllerWrapper(crawlController.results));
router.delete("/crawl/:jobId", controllerWrapper(crawlController.cancel));

// Error handler
router.use(((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
}) as ErrorRequestHandler);

export default router;
