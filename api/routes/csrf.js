import crypto from "crypto";
import { Router } from "express";

/**
 * @param {{}} _deps
 * @returns {import('express').Router}
 */
export function createCsrfRouter(_deps) {
  const router = Router();
  router.get("/csrf", (req, res) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    res.json({ token: req.session.csrfToken });
  });
  return router;
}
