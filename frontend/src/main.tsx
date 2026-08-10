import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installClientLogForwarder } from '@/lib/clientLog'
import { getLocale, resolveLocale, setLocale, subscribeToLocale } from '@/lib/i18n'
import { loadWorkspacePreferences } from '@/lib/preferences'

// Installed before the first render so a failure during mount is still recorded. The panel is
// served by the plugin itself, so its own origin is the address to report back to.
installClientLogForwarder(window.location.origin)

// Applied before React mounts, otherwise the first paint is in the wrong language and then flips.
setLocale(resolveLocale(loadWorkspacePreferences().language))

/**
 * Remounts the tree when the language changes.
 *
 * `t()` reads module state so plain modules can translate too, which means memoised subtrees would
 * happily keep their old strings. Keying the root is a blunt instrument, but a language switch is
 * a deliberate, rare action, and it guarantees not a single stale label survives it.
 */
function Root() {
  const [locale, setLocaleState] = useState(getLocale)
  useEffect(() => subscribeToLocale(setLocaleState), [])
  return <App key={locale} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
