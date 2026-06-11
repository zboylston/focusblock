import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import tasksRouter from "./tasks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(tasksRouter);

export default router;
