export const clawPreV1VersionGovernancePolicy = {
  schemaVersion: 1,
  phase: "pre_v1_mutable",
  branchPolicy: "main_mutable",
  sourceOfTruth: "clawjs",
  freezeTrigger: {
    kind: "explicit_user_instruction",
    examples: ["congela V1", "freeze V1"],
  },
  currentLabels: {
    v1: "provisional_pre_release_label",
    schemaVersion1: "provisional_pre_release_label",
    compatibilityPromise: false,
  },
  approvalGate: {
    requiredForOwnedPublicContracts: true,
    decisionAuthority: "user_explicit_ok",
    blockedWithoutApproval: [
      "semver_or_package_version_bump",
      "owned_schema_version_bump",
      "owned_protocol_version_bump",
      "owned_api_route_prefix_bump",
      "owned_file_format_version_bump",
      "owned_surface_id_version_bump",
      "release_tag_or_publish_flow",
      "new_changeset_bump",
    ],
  },
  changesets: {
    mode: "frozen_until_freeze",
    existingBaseline: "docs/pre-v1-release-ledger.json",
    ordinaryWorkCreatesChangesets: false,
  },
  ownedVersionPolicy: {
    normalizeAggressively: true,
    blockedPatterns: ["owned /v2+", "schemaVersion: 2+", "protocolVersion: 2+", "owned *.v2+ surface ids"],
  },
  externalAllowlist: [
    "third_party_api_versions",
    "os_sdk_platform_versions",
    "dependency_lockfiles",
    "upstream_release_tags",
    "provider_model_version_names",
  ],
  inspections: {
    command: "claw inspect version-governance --json",
    surfaceId: "claw.versionGovernance.preV1",
  },
} as const;

export type ClawPreV1VersionGovernancePolicy = typeof clawPreV1VersionGovernancePolicy;
