/**
 * Public FX helpers — rates + conversion (Frankfurter ECB data).
 *
 * GET /currency/rates?base=USD
 * GET /currency/convert?amount=100&from=USD&to=EUR
 */
import { Router } from "express";
import { z } from "zod";
import { getLatestRates, convertWithRates } from "../services/currencyService.js";

const router = Router();

const RatesQuery = z.object({
  base: z.string().length(3).default("USD"),
});

router.get("/currency/rates", async (req, res, next) => {
  try {
    const parsed = RatesQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
      return;
    }
    const data = await getLatestRates(parsed.data.base.toUpperCase());
    res.json(data);
  } catch (err) {
    next(err);
  }
});

const ConvertQuery = z.object({
  amount: z.coerce.number().finite(),
  from: z.string().min(3).max(3),
  to: z.string().min(3).max(3),
});

router.get("/currency/convert", async (req, res, next) => {
  try {
    const parsed = ConvertQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
      return;
    }
    const { amount, from, to } = parsed.data;
    // Frankfurter rates from USD — conversion helper expects USD-based map
    const { rates } = await getLatestRates("USD");
    const converted = convertWithRates(amount, from.toUpperCase(), to.toUpperCase(), rates);
    res.json({
      amount,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      converted: Math.round(converted * 100) / 100,
      base: "USD",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
