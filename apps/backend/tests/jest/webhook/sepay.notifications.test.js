const { EventEmitter } = require("events");

describe("webhook sepay notifications", () => {
  const originalFetch = global.fetch;
  const originalAbortSignal = global.AbortSignal;

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    if (typeof originalFetch === "undefined") {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }

    if (typeof originalAbortSignal === "undefined") {
      delete global.AbortSignal;
    } else {
      global.AbortSignal = originalAbortSignal;
    }
  });

  it("uses one https request and does not retry a Telegram payload through fetch", async () => {
    const httpsRequest = jest.fn((options, callback) => {
      const req = new EventEmitter();
      req.setTimeout = jest.fn();
      req.write = jest.fn();
      req.end = jest.fn(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        callback(res);
        process.nextTick(() => {
          res.emit("data", "ok");
          res.emit("end");
        });
      });
      req.destroy = jest.fn((err) => req.emit("error", err));
      return req;
    });

    jest.doMock("https", () => ({
      request: httpsRequest,
      Agent: jest.fn(() => ({})),
    }));
    jest.doMock("dns", () => ({
      lookup: jest.fn((_hostname, _options, cb) => cb(null, "127.0.0.1", 4)),
    }));
    jest.doMock("../../../src/utils/logger", () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }));

    global.fetch = jest.fn();
    global.AbortSignal = {
      timeout: jest.fn(() => ({ aborted: true })),
    };

    const { postJson } = require("../../../webhook/sepay/notifications");
    const response = await postJson("https://api.telegram.org/botTOKEN/sendMessage", {
      text: "test",
    });

    expect(response).toBe("ok");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });
});
