package com.aicoding.plugin.services

/** Reads both plain Run consoles and Maven/Gradle build-tree consoles across IDEA versions. */
object IdeaConsoleText {
    fun read(console: Any?): String? = read(console, mutableSetOf())

    private fun read(console: Any?, visited: MutableSet<Any>): String? {
        if (console == null || !visited.add(console)) return null
        runCatching {
            console.javaClass.methods.firstOrNull { it.name == "getText" && it.parameterCount == 0 }
                ?.invoke(console) as? String
        }.getOrNull()?.takeIf(String::isNotBlank)?.let { return it }
        val nested = runCatching {
            console.javaClass.methods.firstOrNull {
                it.name == "getSelectedNodeConsole" && it.parameterCount == 0
            }?.invoke(console)
        }.getOrNull()
        return read(nested, visited)
    }
}
