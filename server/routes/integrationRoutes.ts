import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import stremioIntegrationService, {
  IntegrationLifecycleError,
  StremioIntegrationService,
} from "../services/integrations/stremioIntegrationService";
import { StremioClientError } from "../services/integrations/stremioClient";
import stremioPipelineService, {
  StremioPipelineError,
  StremioPipelineService,
} from "../services/integrations/stremioPipelineService";

const EMAIL_MAX_LENGTH = 320;
const PASSWORD_MAX_LENGTH = 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const providerFailure = (error: unknown, res: Response) => {
  if (error instanceof IntegrationLifecycleError) {
    res.status(400).json({ msg: "A valid email and password are required." });
    return;
  }
  if (error instanceof StremioClientError) {
    if (error.code === "invalid_credentials") {
      res.status(401).json({
        msg: "Stremio credentials were not accepted.",
        code: "invalid_credentials",
      });
      return;
    }
    const status = error.code === "provider_unavailable" || error.code === "network_error" ? 503 : 502;
    res.status(status).json({
      msg: "Stremio could not complete the request.",
      code: error.code,
    });
    return;
  }
  res.status(500).json({ msg: "Integration request failed." });
};

const pipelineFailure = (error: unknown, res: Response) => {
  if (!(error instanceof StremioPipelineError)) {
    res.status(500).json({ msg: "Stremio sync failed.", code: "stremio_sync_failed" });
    return;
  }
  const statusByCode: Record<StremioPipelineError["code"], number> = {
    stremio_not_connected: 409,
    stremio_reauth_required: 401,
    stremio_provider_unavailable: 503,
    integration_changed: 409,
    stremio_sync_failed: 500,
  };
  res.status(statusByCode[error.code]).json({
    msg: "Stremio sync could not be completed.",
    code: error.code,
  });
};

export const createIntegrationRouter = ({
  lifecycleService = stremioIntegrationService,
  pipelineService = stremioPipelineService,
}: {
  lifecycleService?: StremioIntegrationService;
  pipelineService?: StremioPipelineService;
} = {}) => {
  const router = express.Router();

  router.get("/", authenticate, async (req: Request, res: Response) => {
    try {
      res.json({ integrations: await lifecycleService.listForUser(req.user!.id) });
    } catch {
      res.status(500).json({ msg: "Unable to load integrations." });
    }
  });

  router.post("/stremio/connect", authenticate, async (req: Request, res: Response) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (
      !email ||
      email.length > EMAIL_MAX_LENGTH ||
      !EMAIL_PATTERN.test(email) ||
      !password ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      res.status(400).json({ msg: "A valid email and password are required." });
      return;
    }

    try {
      const integration = await lifecycleService.connect(req.user!.id, email, password);
      res.json({ integration });
    } catch (error) {
      providerFailure(error, res);
    }
  });

  router.post("/stremio/sync", authenticate, async (req: Request, res: Response) => {
    try {
      res.json(await pipelineService.syncCurrentStremioIntegration(req.user!.id));
    } catch (error) {
      pipelineFailure(error, res);
    }
  });

  router.delete("/stremio", authenticate, async (req: Request, res: Response) => {
    try {
      res.json(await lifecycleService.disconnect(req.user!.id));
    } catch (error) {
      providerFailure(error, res);
    }
  });

  return router;
};

export default createIntegrationRouter();
