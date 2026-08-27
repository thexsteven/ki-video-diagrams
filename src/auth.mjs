/**
 * Passwort-Login für die gesamte Web-UI: ein geteiltes Passwort statt echter
 * Accounts (zwei vertraute Nutzer, siehe README Abschnitt "Sicherheit").
 * Session-Cookie hält den Login-Zustand; express-rate-limit bremst
 * automatisiertes Passwort-Raten, seit die UI öffentlich erreichbar ist.
 */
import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";

const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!APP_PASSWORD || !SESSION_SECRET) {
  throw new Error(
    "APP_PASSWORD und SESSION_SECRET müssen gesetzt sein (siehe .env.example) " +
      "— ohne sie würde die Web-UI ungeschützt starten.",
  );
}

export function sessionMiddleware() {
  return session({
    secret: SESSION_SECRET,
    name: "kvd.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Nur lokal (npm run web ohne TLS) abschalten; hinter Caddy immer secure.
      secure: process.env.HOST !== "127.0.0.1",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage — zwei Dauernutzer, kein Grund für kurze Sessions
    },
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[auth] Rate-Limit erreicht für ${req.ip}`);
    // Browser-Formular-POST -> ein Redirect ist die einzige Antwort, die die
    // Login-Seite sauber mit einer verständlichen Meldung neu anzeigt.
    res.redirect("/login?error=ratelimit");
  },
});

function passwordMatches(candidate) {
  const a = Buffer.from(candidate ?? "");
  const b = Buffer.from(APP_PASSWORD);
  // timingSafeEqual verlangt gleich lange Buffer — bei Längen-Mismatch ist es
  // per Definition kein Treffer, ohne dass wir Längeninfos preisgeben müssen.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** @param {string} publicDir absoluter Pfad zum public-Ordner (für login.html) */
export function createAuthRouter(publicDir) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    if (req.session?.authed) return res.redirect("/");
    res.sendFile(path.join(publicDir, "login.html"));
  });

  router.post("/login", loginLimiter, (req, res) => {
    const candidate = req.body?.password ?? "";
    if (!passwordMatches(candidate)) {
      console.warn(`[auth] Fehlgeschlagener Login-Versuch von ${req.ip}`);
      return res.redirect("/login?error=1");
    }
    req.session.regenerate((err) => {
      if (err) return res.redirect("/login?error=1");
      req.session.authed = true;
      res.redirect("/");
    });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
  });

  return router;
}

/**
 * Schützt /api und /output/web (siehe server.mjs) — beides Fetch-/Asset-Aufrufe,
 * nie eine volle Seitennavigation, daher immer 401 statt Redirect. Die
 * eigentliche Seite ("/") prüft die Session selbst und leitet dort auf
 * /login um, wo ein Redirect tatsächlich sinnvoll ist.
 */
export function requireAuth(req, res, next) {
  if (req.session?.authed) return next();
  res.status(401).json({ error: "Nicht angemeldet." });
}
