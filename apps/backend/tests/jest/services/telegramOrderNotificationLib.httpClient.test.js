const { EventEmitter } = require("events");

describe("telegramOrderNotificationLib httpClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    if (typeof originalFetch === "undefined") {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }
  });

  it("sends a Telegram payload once through https and does not call fetch", async () => {
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

    global.fetch = jest.fn();

    const { postJson } = require("../../../src/services/telegramOrderNotificationLib/httpClient");
    const response = await postJson("https://api.telegram.org/botTOKEN/sendMessage", {
      text: "test",
    });

    expect(response).toBe("ok");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("does not pass undefined DNS results to https lookup callback", async () => {
    const dnsLookup = jest
      .fn()
      .mockImplementationOnce((_hostname, _options, cb) =>
        cb(null, undefined, undefined)
      )
      .mockImplementationOnce((_hostname, _options, cb) =>
        cb(null, [{ address: "149.154.167.220", family: 4 }], undefined)
      );

    const httpsRequest = jest.fn((options, callback) => {
      const req = new EventEmitter();
      req.setTimeout = jest.fn();
      req.write = jest.fn();
      req.destroy = jest.fn((err) => req.emit("error", err));
      req.end = jest.fn(() => {
        options.agent.lookup("api.telegram.org", {}, (err, address, family) => {
          if (err) {
            req.emit("error", err);
            return;
          }

          expect(address).toBe("149.154.167.220");
          expect(family).toBe(4);

          const res = new EventEmitter();
          res.statusCode = 200;
          callback(res);
          process.nextTick(() => {
            res.emit("data", "ok");
            res.emit("end");
          });
        });
      });
      return req;
    });

    jest.doMock("https", () => ({
      request: httpsRequest,
      Agent: jest.fn((options) => ({ lookup: options.lookup })),
    }));
    jest.doMock("dns", () => ({
      lookup: dnsLookup,
    }));

    const { postJson } = require("../../../src/services/telegramOrderNotificationLib/httpClient");
    const response = await postJson("https://api.telegram.org/botTOKEN/sendMessage", {
      text: "test",
    });

    expect(response).toBe("ok");
    expect(dnsLookup).toHaveBeenCalledTimes(2);
  });

  it("returns address arrays when Node requests lookup with all=true", async () => {
    const dnsLookup = jest.fn((_hostname, _options, cb) =>
      cb(null, "149.154.167.220", 4)
    );

    const httpsRequest = jest.fn((options, callback) => {
      const req = new EventEmitter();
      req.setTimeout = jest.fn();
      req.write = jest.fn();
      req.destroy = jest.fn((err) => req.emit("error", err));
      req.end = jest.fn(() => {
        options.agent.lookup("api.telegram.org", { all: true }, (err, addresses) => {
          if (err) {
            req.emit("error", err);
            return;
          }

          expect(addresses).toEqual([{ address: "149.154.167.220", family: 4 }]);

          const res = new EventEmitter();
          res.statusCode = 200;
          callback(res);
          process.nextTick(() => {
            res.emit("data", "ok");
            res.emit("end");
          });
        });
      });
      return req;
    });

    jest.doMock("https", () => ({
      request: httpsRequest,
      Agent: jest.fn((options) => ({ lookup: options.lookup })),
    }));
    jest.doMock("dns", () => ({
      lookup: dnsLookup,
    }));

    const { postJson } = require("../../../src/services/telegramOrderNotificationLib/httpClient");
    const response = await postJson("https://api.telegram.org/botTOKEN/sendMessage", {
      text: "test",
    });

    expect(response).toBe("ok");
  });

  it("rejects with a DNS error when lookup returns no valid IP address", async () => {
    const dnsLookup = jest
      .fn()
      .mockImplementationOnce((_hostname, _options, cb) =>
        cb(null, undefined, undefined)
      )
      .mockImplementationOnce((_hostname, _options, cb) =>
        cb(null, [{ address: undefined, family: 4 }], undefined)
      );

    const httpsRequest = jest.fn((options) => {
      const req = new EventEmitter();
      req.setTimeout = jest.fn();
      req.write = jest.fn();
      req.destroy = jest.fn((err) => req.emit("error", err));
      req.end = jest.fn(() => {
        options.agent.lookup("api.telegram.org", {}, (err) => {
          if (err) req.emit("error", err);
        });
      });
      return req;
    });

    jest.doMock("https", () => ({
      request: httpsRequest,
      Agent: jest.fn((options) => ({ lookup: options.lookup })),
    }));
    jest.doMock("dns", () => ({
      lookup: dnsLookup,
    }));

    const { postJson } = require("../../../src/services/telegramOrderNotificationLib/httpClient");

    await expect(
      postJson("https://api.telegram.org/botTOKEN/sendMessage", {
        text: "test",
      })
    ).rejects.toThrow("DNS lookup returned no valid address");
  });
});
