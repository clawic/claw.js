import { afterAll, beforeAll, beforeEach, test } from "vitest";

type NodeStyleContext = {
  after?: (callback: () => void | Promise<void>) => void;
  before?: (callback: () => void | Promise<void>) => void;
  diagnostic?: (message: string) => void;
  test?: (name: string, callback: (context: NodeStyleContext) => void | Promise<void>) => Promise<void>;
  onTestFinished?: (callback: () => void | Promise<void>) => void;
};

beforeEach((context) => {
  const nodeContext = context as NodeStyleContext;
  nodeContext.after = (callback) => {
    if (typeof nodeContext.onTestFinished === "function") {
      nodeContext.onTestFinished(callback);
      return;
    }
    afterAll(callback);
  };
  nodeContext.before = (callback) => {
    beforeAll(callback);
  };
  nodeContext.test = async (_name, callback) => {
    await callback(nodeContext);
  };
  nodeContext.diagnostic = (message) => {
    console.info(`# ${message}`);
  };
});

(test as unknown as NodeStyleContext).after = (callback) => {
  afterAll(callback);
};

(test as unknown as NodeStyleContext).before = (callback) => {
  beforeAll(callback);
};
