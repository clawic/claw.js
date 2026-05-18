# eslint-config-claw

Shared ESLint flat config for Claw projects.

## Install

```bash
npm install --save-dev eslint eslint-config-claw
```

## Usage

```js
// eslint.config.js
import claw from "eslint-config-claw";

export default claw;
```

Use the JavaScript-only preset when you do not want TypeScript rules:

```js
import { javascript } from "eslint-config-claw";

export default javascript;
```

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
