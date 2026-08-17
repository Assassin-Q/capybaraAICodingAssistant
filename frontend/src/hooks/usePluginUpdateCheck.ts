import { useEffect, useState } from "react";

import { useLocale } from "@/hooks/useLocale";
import { ideaApi, type UpdateStatus } from "@/lib/idea";

/** Delays the first release check so panel startup never competes with workspace bootstrap. */
export function usePluginUpdateCheck(): UpdateStatus | undefined {
  const locale = useLocale();
  const [status, setStatus] = useState<UpdateStatus>();

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void ideaApi.getPluginUpdate(locale, true)
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => undefined);
    };
    const initialTimer = window.setTimeout(check, 10_000);
    const interval = window.setInterval(check, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [locale]);

  return status;
}
