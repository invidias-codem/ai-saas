import express, { Router } from "express";
import { FileController } from "../../controllers/v1/FileController.js";
import { controllerWrapper } from "../../utils/AsyncHandler.js";

const router: express.Router = Router();
const fileController = new FileController();

router.get("/storage/file/:path", controllerWrapper(fileController.handle));

export default router; 