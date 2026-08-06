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
        version.set("2023.2.4")
        type.set("IC") // IntelliJ Community Edition
    } else {
        localPath.set(intellijLocalPath)
    }
    pluginName.set("capybaraAICodingAssistant")
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
    }

    buildSearchableOptions {
        enabled = false
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
