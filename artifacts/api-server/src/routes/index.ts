import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clinicRouter from "./clinic";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clinicRouter);
router.use(storageRouter);

export default router;
