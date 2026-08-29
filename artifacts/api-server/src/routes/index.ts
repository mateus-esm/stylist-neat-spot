import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clinicRouter from "./clinic";
import storageRouter from "./storage";
import clinicTeamRouter from "./clinicTeam";
import clinicPortalRouter from "./clinicPortal";
import clinicWhatsappRouter from "./clinicWhatsapp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clinicRouter);
router.use(clinicTeamRouter);
router.use(clinicPortalRouter);
router.use(clinicWhatsappRouter);
router.use(storageRouter);

export default router;
