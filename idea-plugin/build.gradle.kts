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

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.20")
    // 使用JDK内置的HttpServer，避免类加载冲突
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.5.1")
}

intellij {
    version.set("2023.2.4")
    type.set("IC") // IntelliJ Community Edition
    pluginName.set("capybaraAICodingAssistant")
}

kotlin {
    jvmToolchain(17)
}

tasks {
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