plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.20"
    id("org.jetbrains.intellij") version "1.17.4"
    kotlin("plugin.serialization") version "1.9.20"
}

group = "com.aicoding"
version = "1.0.0"

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
}