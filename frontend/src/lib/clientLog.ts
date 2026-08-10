/**
 * Forwards the panel's console to the plugin, which writes it beside `idea.log`.
 *
 * The UI runs inside JCEF with no devtools reachable from outside, so a render that threw was
 * previously invisible — the plugin saw only the requests that did happen, never the failure that
 * stopped one from being made. Mirroring the console to disk makes frontend faults as inspectable
 * as a Kotlin stack trace already is.
 *
 * Everything here is best-effort and must never become the problem it exists to report: the
 * original console is always called first, delivery failures are swallowed, and the forwarder
 * refuses to describe its own traffic.
 */

interface ClientLogEntry {
  at: number;
  level: string;
  message: string;
  stack?: string;
  url?: string;
}

/** Kept small: this is a diagnostic tail, not an audit trail. */
const MAX_QUEUE = 200;
const FLUSH_DELAY_MS = 1200;
const ROUTE = "/api/ide/client-log";

let queue: ClientLogEntry[] = [];
let timer: number | undefined;
let installed = false;
let sending = false;

const describe = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    return JSON.stringify(value);
  } catch {
    // Circular structures and DOM nodes are common in console output and must not throw here.
    return String(value);
  }
};

const flush = (baseUrl: string) => {
  timer = undefined;
  if (sending || queue.length === 0) return;
  const entries = queue;
  queue = [];
  sending = true;
  // Plain fetch rather than the shared client: this must not run through interceptors that
  // themselves log, and a failure here is not worth surfacing anywhere.
  void fetch(`${baseUrl}${ROUTE}`, {
    body: JSON.stringify({ entries }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
    .catch(() => undefined)
    .finally(() => {
      sending = false;
      if (queue.length > 0) schedule(baseUrl);
    });
};

const schedule = (baseUrl: string) => {
  if (timer !== undefined) return;
  timer = window.setTimeout(() => flush(baseUrl), FLUSH_DELAY_MS);
};

const push = (baseUrl: string, entry: ClientLogEntry) => {
  // Dropping the oldest keeps a runaway loop from evicting the newest entries, which are the ones
  // describing what it turned into.
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(entry);
  schedule(baseUrl);
};

/**
 * @param baseUrl the plugin's own server, which is where the panel was loaded from.
 * @param levels which console methods to mirror. `log` is off by default — it is noisy and the
 *   interesting failures arrive as `error`, `warn`, or an uncaught throw.
 */
export const installClientLogForwarder = (
  baseUrl: string,
  levels: Array<"error" | "warn" | "log"> = ["error", "warn"]
): void => {
  if (installed || typeof window === "undefined") return;
  installed = true;

  levels.forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      // The real console runs first and unconditionally, so forwarding can never cost a message.
      original(...args);
      const stack = args.find((arg): arg is Error => arg instanceof Error)?.stack;
      push(baseUrl, {
        at: Date.now(),
        level,
        message: args.map(describe).join(" "),
        stack,
        url: window.location.href,
      });
    };
  });

  window.addEventListener("error", (event) => {
    push(baseUrl, {
      at: Date.now(),
      level: "unhandled",
      message: event.message || describe(event.error),
      stack: event.error instanceof Error ? event.error.stack : undefined,
      url: `${event.filename}:${event.lineno}:${event.colno}`,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    push(baseUrl, {
      at: Date.now(),
      level: "rejection",
      message: describe(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined,
      url: window.location.href,
    });
  });

  // The panel is disposed with the IDE tool window rather than navigated away from, so this is the
  // only chance to deliver whatever is still queued.
  window.addEventListener("beforeunload", () => flush(baseUrl));
};
