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
            <h3>3.0.1</h3>
            <ul>
              <li><b>流式滚动：</b>发送后自动跟随输出，向上滚轮、拖动滚动条或触摸会立即暂停；执行中回到底部可恢复跟随，最终 Token 用量出现 500ms 后补充一次受控到底滚动，再保留 3 秒跟随状态。</li>
              <li><b>IDEA 路径操作：</b>文件树与编辑器右键新增复制绝对路径、复制相对路径；两者都会为代码选区附带准确的真实行号范围。右键分组统一为 Capybara AI Coding，并使用适配明暗主题的 16×16 水豚图标。</li>
              <li><b>模型设置：</b>模型 ID 支持跨全部供应商、区分大小写的模糊搜索；通过预索引和延迟查询改善输入响应，并提供完整可滚动列表、失焦关闭及截断内容悬停查看全称。</li>
              <li><b>模型停用：</b>对话、视觉和记忆模型选择器直接按已保存配置过滤停用供应商与模型，即使外部 OpenCode 服务尚未重启也不会继续展示。</li>
              <li><b>界面修复：</b>打开设置前关闭命令、模型、档位、Git 等临时弹层；连接页新增滚动悬浮的锚点导航、统一一级标题与内容层级，并将设置侧栏收窄到 160px。</li>
              <li><b>会话修复：</b>合并 OpenCode 连续返回的模型与档位切换事件，避免相同模型切换分隔线重复显示。</li>
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
