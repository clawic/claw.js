export interface BrowserViewport {
  width: number;
  height: number;
}

export interface BrowserController {
  deviceId: string;
  userId: string;
  email?: string;
  acquiredAt: string;
}

export interface BrowserActor {
  deviceId: string;
  userId: string;
  email?: string;
}

export interface BrowserNavigationState {
  title: string;
  url: string;
  displayUrl: string;
  isLocalUrl: boolean;
}

export interface BrowserSessionSnapshot {
  workspaceId: string;
  active: boolean;
  status: "idle" | "ready";
  navigation: BrowserNavigationState;
  controller: BrowserController | null;
  viewport: BrowserViewport;
  startedAt?: string;
  updatedAt: string;
  lastFrameAt?: string;
}

export interface BrowserFrameEvent {
  workspaceId: string;
  seq: number;
  imageBase64: string;
  mimeType: string;
  capturedAt: string;
  viewport: BrowserViewport;
}

export interface BrowserStateEvent {
  workspaceId: string;
  reason: string;
  session: BrowserSessionSnapshot;
}

export type BrowserInputCommand =
  | {
      type: "click";
      x: number;
      y: number;
    }
  | {
      type: "type";
      text: string;
    }
  | {
      type: "key";
      key: string;
    }
  | {
      type: "navigate";
      url: string;
    };
