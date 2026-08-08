package com.aicoding.plugin.services

internal data class PatchedFileText(
    val before: String,
    val after: String,
)

internal object UnifiedPatchParser {
    fun parse(patch: String): PatchedFileText {
        if (patch.isEmpty()) return PatchedFileText(before = "", after = "")

        val before = StringBuilder()
        val after = StringBuilder()
        var inHunk = false
        var lastPrefix: Char? = null

        patch.split('\n').forEach { rawLine ->
            val line = rawLine.removeSuffix("\r")
            when {
                line.startsWith("@@ ") -> {
                    inHunk = true
                    lastPrefix = null
                }

                !inHunk -> Unit
                line == "\\ No newline at end of file" -> {
                    when (lastPrefix) {
                        ' ' -> {
                            trimTrailingNewline(before)
                            trimTrailingNewline(after)
                        }
                        '-' -> trimTrailingNewline(before)
                        '+' -> trimTrailingNewline(after)
                    }
                }

                line.isEmpty() -> Unit
                else -> {
                    val prefix = line.first()
                    val content = line.drop(1)
                    when (prefix) {
                        ' ' -> {
                            before.append(content).append('\n')
                            after.append(content).append('\n')
                        }
                        '-' -> before.append(content).append('\n')
                        '+' -> after.append(content).append('\n')
                    }
                    if (prefix == ' ' || prefix == '-' || prefix == '+') lastPrefix = prefix
                }
            }
        }

        return PatchedFileText(before = before.toString(), after = after.toString())
    }

    private fun trimTrailingNewline(text: StringBuilder) {
        if (text.isNotEmpty() && text.last() == '\n') text.setLength(text.length - 1)
    }
}
