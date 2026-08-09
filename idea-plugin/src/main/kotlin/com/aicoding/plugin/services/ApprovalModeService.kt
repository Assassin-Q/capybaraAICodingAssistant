package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import kotlinx.serialization.Serializable
import java.util.concurrent.ConcurrentHashMap

@Serializable
data class ApprovalModeRequest(val sessionID: String, val mode: String)

@Serializable
data class ApprovalModeResponse(val sessionID: String, val mode: String)

@Serializable
data class ApprovalDecision(
    val status: String,
    /**
     * Whether this plugin instance actually owns the session. One OpenCode process can serve
     * several IDEA projects, and the mode lives in the project that opened the session — so the
     * bridge has to be able to tell "I decided this" from "I have never seen this session".
     */
    val known: Boolean = true,
)

@Serializable
data class ApprovalModeRule(
    val id: String,
    val label: String,
    /** Human labels for the operations that run without asking. */
    val allow: List<String>,
    /** Human labels for the operations that still raise a permission card. */
    val ask: List<String>,
)

@Serializable
data class ApprovalModeRules(val modes: List<ApprovalModeRule>)

/**
 * Single source of truth for approval modes.
 *
 * OpenCode's REST API accepts `permission` on both `PATCH /session/{id}` and `PATCH /config`
 * and returns 200, but silently discards it — verified against OpenCode 1.18.12. Enforcement
 * therefore happens in the `permission.ask` plugin hook, which calls [decide] through the
 * plugin's own HTTP server. The frontend also renders its picker from [rules], so the displayed
 * behaviour and the enforced behaviour cannot drift apart.
 */
@Service(Service.Level.PROJECT)
class ApprovalModeService {
    private val modes = ConcurrentHashMap<String, String>()

    /**
     * Sessions with an approval request the user has not answered yet.
     *
     * The frontend only polls the session it is showing, so a run blocked in a background session
     * used to just look stuck. The bridge hook reports every ask here the moment it intercepts
     * one — that hook is the only place that sees all of them.
     */
    private val pending = ConcurrentHashMap.newKeySet<String>()

    fun get(sessionID: String): String = modes[sessionID] ?: DEFAULT_MODE

    fun set(sessionID: String, mode: String): String {
        val normalized = mode.takeIf { it in KNOWN_MODES } ?: DEFAULT_MODE
        modes[sessionID] = normalized
        return normalized
    }

    fun forget(sessionID: String) {
        modes.remove(sessionID)
        pending.remove(sessionID)
    }

    /** @return true when the set actually changed, so callers only broadcast on a real change. */
    fun setPending(sessionID: String, isPending: Boolean): Boolean {
        if (sessionID.isBlank()) return false
        return if (isPending) pending.add(sessionID) else pending.remove(sessionID)
    }

    fun pendingSessions(): List<String> = pending.toList().sorted()

    /** True once a mode has been set for this session, i.e. this project opened it. */
    fun knows(sessionID: String): Boolean = modes.containsKey(sessionID)

    /**
     * Records that this project owns the session, without changing a mode it already has.
     *
     * Ownership is what routes approvals and the IDEA system prompt to the right project. Reading
     * a session's mode is proof enough of ownership — otherwise a session opened before this build
     * would never be claimed by anyone and would silently lose both.
     */
    fun claim(sessionID: String): String {
        if (sessionID.isBlank()) return DEFAULT_MODE
        return modes.computeIfAbsent(sessionID) { DEFAULT_MODE }
    }

    /**
     * @param type the OpenCode permission kind, e.g. `websearch`, `bash`, `edit`.
     * Unknown kinds fall into the risky bucket so a new OpenCode tool is never auto-approved.
     */
    fun decide(sessionID: String, type: String): String {
        val mode = get(sessionID)
        if (mode == "full") return "allow"
        val kind = type.trim().lowercase()
        if (kind in ALWAYS_ALLOWED) return "allow"
        if (kind == "edit" && mode == "auto") return "allow"
        return "ask"
    }

    fun rules(): ApprovalModeRules = ApprovalModeRules(
        KNOWN_MODES.map { mode ->
            val allow = mutableListOf<String>()
            val ask = mutableListOf<String>()
            if (mode == "full") {
                allow += "全部操作，含终端命令与联网"
            } else {
                LABELLED_KINDS.forEach { (kind, label) ->
                    val target = if (decideForMode(mode, kind) == "allow") allow else ask
                    if (label !in target) target += label
                }
            }
            ApprovalModeRule(id = mode, label = MODE_LABELS.getValue(mode), allow = allow, ask = ask)
        },
    )

    private fun decideForMode(mode: String, kind: String): String {
        if (mode == "full") return "allow"
        if (kind in ALWAYS_ALLOWED) return "allow"
        if (kind == "edit" && mode == "auto") return "allow"
        return "ask"
    }

    companion object {
        const val DEFAULT_MODE = "ask"
        val KNOWN_MODES = listOf("ask", "auto", "full")

        private val MODE_LABELS = mapOf("ask" to "请求批准", "auto" to "替我审批", "full" to "完全访问")

        /** Read-only inspection. Everything else needs approval unless the mode says otherwise. */
        private val ALWAYS_ALLOWED = setOf("read", "glob", "grep", "list", "lsp", "todowrite", "question")

        /**
         * Ordered so the picker lists the safe operations first. Several kinds intentionally
         * share a label so the UI can collapse them into one readable entry.
         */
        private val LABELLED_KINDS = listOf(
            "read" to "读取与搜索文件",
            "glob" to "读取与搜索文件",
            "grep" to "读取与搜索文件",
            "list" to "读取与搜索文件",
            "edit" to "修改文件",
            "bash" to "执行终端命令",
            "task" to "派生子任务",
            "skill" to "调用技能",
            "external_directory" to "访问工作区外文件",
            "webfetch" to "抓取网页",
            "websearch" to "联网搜索",
        )
    }
}
