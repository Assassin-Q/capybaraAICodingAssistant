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
              <li>Full Chinese/English interface, following the IDE locale by default.</li>
              <li>Approval modes are decided by the panel, so "full access" no longer prompts.</li>
              <li>Verified against every IntelliJ release from 2023.2 to 2026.2.</li>
              <li>Checks that OpenCode is installed and new enough, with install instructions.</li>
              <li>Update detection, IDEA-backed file search, and a front-end log written beside idea.log.</li>
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

