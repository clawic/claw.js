package com.clawjs.chat.data.remote

// Mirrors the private RelayConfig struct in APIService.swift, plus sensible
// Android-emulator defaults (10.0.2.2 is the host loopback from the emulator).
data class RelayConfig(
    val baseUrl: String,
    val relayIsolationId: String,
    val email: String,
    val password: String,
) {
    companion object {
        const val DEFAULT_BASE_URL = "http://10.0.2.2:4410"
        // Relay compatibility default for the legacy remote isolation namespace.
        const val DEFAULT_RELAY_ISOLATION_ID = "demo-tenant"
        const val DEFAULT_EMAIL = "user@relay.local"
        const val DEFAULT_PASSWORD = "relay-user"

        val Default = RelayConfig(
            baseUrl = DEFAULT_BASE_URL,
            relayIsolationId = DEFAULT_RELAY_ISOLATION_ID,
            email = DEFAULT_EMAIL,
            password = DEFAULT_PASSWORD,
        )
    }
}
