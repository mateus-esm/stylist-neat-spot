import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clinicRouter from "./clinic";
import storageRouter from "./storage";
import clinicTeamRouter from "./clinicTeam";
import clinicPortalRouter from "./clinicPortal";
import clinicWhatsappRouter from "./clinicWhatsapp";

const router: IRouter = Router();

router.use(healthRouter);
// The provider callback is intentionally public (with its optional shared
// token), so this router must be mounted before clinicRouter's auth middleware.
router.use(clinicWhatsappRouter);
router.use(clinicRouter);
router.use(clinicTeamRouter);
router.use(clinicPortalRouter);
router.use(storageRouter);

export default router;
