plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.20"
    id("org.jetbrains.intellij") version "1.17.4"
    kotlin("plugin.serialization") version "1.9.20"
}

group = "com.aicoding"
version = file("../frontend/package.json").let { file ->
    val text = file.readText()
    val regex = """"version":\s*"([^"]+)"""".toRegex()
    regex.find(text)?.groupValues?.getOrNull(1) ?: "1.0.0"
}

repositories {
    mavenCentral()
}

val buildFrontend by tasks.registering(org.gradle.api.tasks.Exec::class) {
    // Vite hashes its output names, so a renamed or dropped chunk would otherwise linger and be
    // packed into the jar forever. Note the bundle is legitimately ~310 files: Shiki emits one
    // chunk per grammar and theme. Clearing the directory keeps it honest, it does not shrink it.
    doFirst {
        file("src/main/resources/static/assets").deleteRecursively()
    }
    workingDir(file("../frontend"))
    commandLine(if (System.getProperty("os.name").startsWith("Windows")) "pnpm.cmd" else "pnpm", "build:skip")
    inputs.dir(file("../frontend/src"))
    inputs.file(file("../frontend/index.html"))
    inputs.file(file("../frontend/package.json"))
    inputs.file(file("../frontend/vite.config.ts"))
    outputs.dir(file("src/main/resources/static"))
}

dependencies {
    // 使用JDK内置的HttpServer，避免类加载冲突
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.5.1") {
        exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib")
        exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-common")
    }
}

val intellijLocalPath = providers.gradleProperty("intellijLocalPath").orNull

intellij {
    if (intellijLocalPath.isNullOrBlank()) {
        // -PintellijVersion / -PintellijType let a compatibility check run against a newer SDK
        // without touching the shipping baseline.
        version.set(providers.gradleProperty("intellijVersion").orNull ?: "2023.2.4")
        type.set(providers.gradleProperty("intellijType").orNull ?: "IC")
    } else {
        localPath.set(intellijLocalPath)
    }
    pluginName.set("capybaraAICodingAssistant")
    // Bundled plugin, referenced only for the IDEA Maven runner bridge. It is declared as an
    // optional dependency in plugin.xml so the plugin still loads when Maven support is absent.
    plugins.set(listOf("org.jetbrains.idea.maven"))
}

kotlin {
    jvmToolchain(17)
}

tasks {
    named("processResources") {
        dependsOn(buildFrontend)
    }

    named<org.gradle.api.tasks.bundling.Jar>("jar") {
        dependsOn(buildFrontend)
    }

    patchPluginXml {
        sinceBuild.set("232")
        untilBuild.set("")
        // The marketplace shows this on the plugin page and in the IDE's update dialog. Kept in
        // the build rather than plugin.xml so it travels with the version it describes.
        changeNotes.set(
            """
            <h3>3.0.0</h3>
            <ul>
              <li><b>全面重构：</b>以 OpenCode V2 API 和 AI Elements 对话交互重构插件界面，支持稳定的流式 Markdown、思考过程、工具调用、问答卡片、待办进度、上下文和 Token 用量。</li>
              <li><b>原生 IDEA 体验：</b>新增工具窗原生会话标签、溢出导航、会话改名、仅关闭标签、代码/文件跳转、IDEA 原生 Diff，以及 AI 修改后文件树与编辑器刷新。</li>
              <li><b>模型与配置：</b>更新供应商认证、模型、思考档位、自定义供应商、技能、插件、MCP 与记忆设置；设置和偏好可随 IDEA 工作区持久化。</li>
              <li><b>安全审批：</b>输入框提供请求批准、替我审批、完全访问三种模式，分别控制文件访问、编辑、命令和联网操作。</li>
              <li><b>IDE 桥接：</b>可选启用项目/编辑器上下文、诊断、符号、Run/Debug、控制台日志、Maven/Gradle 任务与水豚浏览器能力。</li>
              <li><b>性能与可靠性：</b>修复重复发送、流式重绘闪动、思考占位残留、标签切换卡顿和长会话性能问题；敏感凭据只写入用户级 OpenCode 配置。</li>
              <li><b>外观与本地化：</b>完整中英文界面、IDEA 主题实时跟随、手动明暗切换、响应式设置页与开源项目信息。</li>
            </ul>
            """.trimIndent()
        )
    }

    buildSearchableOptions {
        enabled = false
    }

    // Compiled against 2023.2.4 only, while untilBuild is open-ended — the verifier is the only
    // way to know whether the IDE APIs this plugin reaches still exist on newer builds.
    runPluginVerifier {
        // Every major release the manifest claims: sinceBuild is 232 and untilBuild is open, so
        // anything less than the full sweep leaves most of the promise untested. 2026.x only
        // exists on the Ultimate line (build 261/262); Community stops at 2025.3.
        ideVersions.set(
            listOf(
                "IC-2023.2.5", "IC-2023.3.8", "IC-2024.1.7", "IC-2024.2.6", "IC-2024.3.5",
                "IC-2025.1.5", "IC-2025.2", "IC-2025.3", "IU-2026.1", "IU-2026.2",
            ),
        )
    }

    publishPlugin {
        token.set(System.getenv("PUBLISH_TOKEN"))
    }

    signPlugin {
        certificateChain.set(System.getenv("CERTIFICATE_CHAIN"))
        privateKey.set(System.getenv("PRIVATE_KEY"))
        password.set(System.getenv("PRIVATE_KEY_PASSWORD"))
    }
}
