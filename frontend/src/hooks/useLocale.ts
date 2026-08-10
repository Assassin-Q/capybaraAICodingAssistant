import { useEffect, useState } from "react";

import { getLocale, subscribeToLocale, type Locale } from "@/lib/i18n";

/**
 * Re-renders the caller whenever the active locale changes.
 *
 * `t` itself reads module state so plain modules can use it, which means React would otherwise
 * never know a switch happened. Subscribing here is what turns that module state into something
 * the component tree reacts to; the returned locale is rarely needed, the re-render always is.
 */
export const useLocale = (): Locale => {
  const [locale, setLocaleState] = useState<Locale>(getLocale);
  useEffect(() => subscribeToLocale(setLocaleState), []);
  return locale;
};
