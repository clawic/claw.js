import Foundation
import Network

/// Discovers ClawJS relay instances on the local network via Bonjour (mDNS).
/// When a relay is found, updates UserDefaults with its URL and notifies observers.
final class RelayDiscovery: ObservableObject {
    static let shared = RelayDiscovery()

    @Published var discoveredURL: String?
    @Published var isSearching = false

    private var browser: NWBrowser?
    private var connection: NWConnection?

    private init() {}

    /// Start browsing for `_clawjs._tcp` services on the local network.
    func startBrowsing() {
        guard browser == nil else { return }
        isSearching = true

        let descriptor = NWBrowser.Descriptor.bonjour(type: "_clawjs._tcp", domain: nil)
        let params = NWParameters()
        params.includePeerToPeer = true

        let newBrowser = NWBrowser(for: descriptor, using: params)

        newBrowser.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                print("[RelayDiscovery] Browsing for _clawjs._tcp services")
            case .failed(let error):
                print("[RelayDiscovery] Browser failed: \(error)")
                DispatchQueue.main.async { self?.isSearching = false }
            case .cancelled:
                DispatchQueue.main.async { self?.isSearching = false }
            default:
                break
            }
        }

        newBrowser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self else { return }
            for result in results {
                self.resolve(result)
            }
        }

        newBrowser.start(queue: .main)
        self.browser = newBrowser
    }

    func stopBrowsing() {
        browser?.cancel()
        browser = nil
        connection?.cancel()
        connection = nil
        isSearching = false
    }

    // MARK: - Resolution

    private func resolve(_ result: NWBrowser.Result) {
        // Resolve the Bonjour endpoint by opening a TCP connection to get the IP
        let endpoint = result.endpoint
        let params = NWParameters.tcp
        let conn = NWConnection(to: endpoint, using: params)

        conn.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                if let innerEndpoint = conn.currentPath?.remoteEndpoint,
                   case .hostPort(let host, let port) = innerEndpoint {
                    let hostString: String
                    switch host {
                    case .ipv4(let addr):
                        hostString = "\(addr)"
                    case .ipv6(let addr):
                        hostString = "[\(addr)]"
                    case .name(let name, _):
                        hostString = name
                    @unknown default:
                        hostString = "\(host)"
                    }
                    let url = "http://\(hostString):\(port)"
                    self.applyDiscoveredURL(url)
                }
                conn.cancel()
            case .failed:
                conn.cancel()
            default:
                break
            }
        }

        conn.start(queue: .main)
        self.connection = conn
    }

    private func applyDiscoveredURL(_ url: String) {
        DispatchQueue.main.async {
            let defaults = UserDefaults.standard
            let current = defaults.string(forKey: "relayBaseURL") ?? ""
            let isDefault = current.isEmpty
                || current == "http://localhost:4410"
                || current == "http://127.0.0.1:4410"

            // Only auto-apply if the user hasn't set a custom URL
            if isDefault && self.discoveredURL != url {
                print("[RelayDiscovery] Found relay at \(url)")
                self.discoveredURL = url
                defaults.set(url, forKey: "relayBaseURL")
                NotificationCenter.default.post(name: .relayDiscovered, object: nil)
            }
        }
    }
}

extension Notification.Name {
    static let relayDiscovered = Notification.Name("relayDiscovered")
}
