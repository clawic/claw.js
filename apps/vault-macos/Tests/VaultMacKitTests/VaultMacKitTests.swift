import Foundation
import Testing
@testable import VaultMacKit

@Suite("VaultMacKit", .serialized)
struct VaultMacKitTests {
    @Test("VaultClient logs in and decodes the session payload")
    func loginDecodesSession() async throws {
        let transport = StubTransport()
        transport.enqueue(path: "/v1/auth/login", method: "POST", status: 200, body: """
        {"accessToken":"token-123","tenantId":"demo-tenant","email":"admin@vault.local","role":"tenant_admin"}
        """)
        let client = VaultClient(baseURL: URL(string: "http://127.0.0.1:4610")!, session: transport.session)

        let session = try await client.login(tenantId: "demo-tenant", email: "admin@vault.local", password: "vault-admin")

        #expect(session.accessToken == "token-123")
        #expect(session.tenantId == "demo-tenant")
        #expect(transport.requests.count == 1)
    }

    @Test("VaultClient sends typed secret payloads including structured fields")
    func createSecretEncodesTypedPayload() async throws {
        let transport = StubTransport()
        transport.enqueue(path: "/v1/tenants/demo-tenant/secrets", method: "POST", status: 201, body: """
        {"secret":{"secretName":"revenuecat_primary","allowedHosts":[],"allowedHeaderNames":[],"allowInURL":false,"allowInRequestBody":false,"allowLocalNetwork":false,"readOnly":true,"exportable":false,"leaseModes":["process"],"maskedFingerprint":"sha256:demo","version":1,"updatedAt":"2026-04-14T00:00:00.000Z"}}
        """)
        let client = VaultClient(baseURL: URL(string: "http://127.0.0.1:4610")!, session: transport.session)
        let session = VaultSession(accessToken: "token-123", tenantId: "demo-tenant", email: "admin@vault.local", role: "tenant_admin")

        _ = try await client.createSecret(session: session, input: VaultCreateSecretInput(
            typeId: "revenuecat.api_key",
            secretName: "revenuecat_primary",
            secretValue: "rc_secret_123",
            label: "RevenueCat",
            notes: "Primary key",
            baseUrl: "http://127.0.0.1:7777",
            allowedHosts: "api.revenuecat.com",
            allowedHeaderNames: "Authorization,X-Platform",
            leaseModes: "process",
            allowInURL: false,
            allowInRequestBody: false,
            allowLocalNetwork: false,
            readOnly: true
        ))

        let body = try #require(transport.lastJSONBody)
        #expect(body["typeId"] as? String == "revenuecat.api_key")
        #expect((body["structuredFields"] as? [String: String])?["baseUrl"] == "http://127.0.0.1:7777")
        #expect((body["allowedHeaderNames"] as? [String])?.count == 2)
    }
}

private final class StubTransport: NSObject {
    struct StubResponse {
        let path: String
        let method: String
        let status: Int
        let body: String
    }

    var requests: [URLRequest] = []
    var lastJSONBody: [String: Any]?
    private var queue: [StubResponse] = []

    lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProtocolStub.self]
        ProtocolStub.owner = self
        return URLSession(configuration: configuration)
    }()

    func enqueue(path: String, method: String, status: Int, body: String) {
        queue.append(StubResponse(path: path, method: method, status: status, body: body))
    }

    fileprivate func response(for request: URLRequest) throws -> (HTTPURLResponse, Data) {
        requests.append(request)
        if let body = request.httpBody ?? request.httpBodyStream?.readAllData() {
            lastJSONBody = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        }
        guard let next = queue.first else {
            throw NSError(domain: "StubTransport", code: 1)
        }
        queue.removeFirst()
        #expect(request.url?.path == next.path)
        #expect(request.httpMethod == next.method)
        let response = HTTPURLResponse(url: request.url!, statusCode: next.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        return (response, Data(next.body.utf8))
    }
}

private extension InputStream {
    func readAllData() -> Data {
        open()
        defer { close() }
        var data = Data()
        let bufferSize = 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while hasBytesAvailable {
            let count = read(buffer, maxLength: bufferSize)
            if count > 0 {
                data.append(buffer, count: count)
            } else {
                break
            }
        }
        return data
    }
}

private final class ProtocolStub: URLProtocol {
    nonisolated(unsafe) static var owner: StubTransport?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        do {
            guard let owner = Self.owner else { throw NSError(domain: "ProtocolStub", code: 2) }
            let (response, data) = try owner.response(for: request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
