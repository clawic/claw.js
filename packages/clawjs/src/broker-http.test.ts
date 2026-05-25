import { test } from "vitest";
import assert from "node:assert/strict";

import { inferBrokerDeclaredFields } from "./broker-http.ts";

test("inferBrokerDeclaredFields requires explicit fields and preserves placement", () => {
  const declared = inferBrokerDeclaredFields({
    url: "https://api.example.com/users?token={{service_token.token}}",
    headers: { Authorization: "Bearer {{service_token.token}}" },
    body: JSON.stringify({ apiKey: "{{billing_key.api_key}}" }),
  });

  assert.deepEqual(declared, [
    { secretName: "service_token", fieldName: "token", placement: "query" },
    { secretName: "billing_key", fieldName: "api_key", placement: "body" },
    { secretName: "service_token", fieldName: "token", placement: "header" },
  ]);
});

test("inferBrokerDeclaredFields rejects whole-secret placeholders", () => {
  assert.throws(
    () => inferBrokerDeclaredFields({ url: "https://api.example.com?token={{service_token}}" }),
    /must include an explicit field/,
  );
});

test("inferBrokerDeclaredFields rejects URL path and fragment secret placeholders", () => {
  assert.throws(
    () => inferBrokerDeclaredFields({ url: "https://api.example.com/{{service_token.token}}/users" }),
    /only supported in URL query parameters/,
  );
  assert.throws(
    () => inferBrokerDeclaredFields({ url: "https://api.example.com/users#token={{service_token.token}}" }),
    /only supported in URL query parameters/,
  );

  assert.deepEqual(inferBrokerDeclaredFields({
    url: "https://api.example.com/users?token={{service_token.token}}#ignored",
  }), [
    { secretName: "service_token", fieldName: "token", placement: "query" },
  ]);
});
