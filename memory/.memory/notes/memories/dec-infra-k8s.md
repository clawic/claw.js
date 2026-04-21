---
id: dec-infra-k8s
slug: decision-kubernetes-infra
kind: memory
type: decision_note
title: Decision to standardize on Kubernetes
schemaVersion: 2
createdAt: 2026-04-16
updatedAt: 2026-04-16
status: active
archived: false
decisionStatus: accepted
subject: infra-platform
about:
  - sofia
  - devops
uses:
  - target: kubernetes
    confidence: 1.0
    context: orchestration layer
  - target: terraform
    confidence: 1.0
    context: infrastructure provisioning
source:
  - meeting-q1-review
---

Sofia proposed and the team accepted standardizing all deployment on Kubernetes with Terraform for provisioning. This replaced the previous ad-hoc Docker Compose setup.
