import Foundation

extension MacControlWireRequest {
    var nativeRequest: MacControlActionRequest {
        MacControlActionRequest(
            requestId: requestId,
            capabilityId: capabilityId,
            actorId: actor.id,
            origin: MacControlOrigin(rawValue: actor.kind) ?? .system,
            actorKind: actor.kind,
            actorRole: actor.role,
            assignmentId: actor.assignmentId,
            runId: actor.runId,
            arguments: arguments.compactMapValues(\.coercedStringValue),
            dryRun: dryRun,
            approved: approved ?? false
        )
    }
}
