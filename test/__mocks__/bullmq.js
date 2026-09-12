// Mock for bullmq
class MockQueue {
  constructor(name, opts) {
    this.name = name;
    this.opts = opts;
  }
  async add() { return { id: "mock-job-id" }; }
  async close() {}
  async pause() {}
  async resume() {}
  on() {}
}

class MockWorker {
  constructor(name, processor, opts) {
    this.name = name;
    this.processor = processor;
    this.opts = opts;
  }
  async close() {}
  on() {}
}

class MockQueueEvents {
  constructor(name, opts) {
    this.name = name;
    this.opts = opts;
  }
  async close() {}
  on() {}
}

class MockQueueScheduler {
  constructor(name, opts) {
    this.name = name;
    this.opts = opts;
  }
  async close() {}
  on() {}
}

// Mock for @nestjs/bullmq
class MockWorkerHost {
  constructor() {}
  async process() {}
}

class MockJob {
  constructor(data) {
    this.data = data;
    this.id = "mock-job-id";
    this.name = "mock-job";
    this.opts = {};
    this.progress = 0;
    this.attemptsMade = 0;
    this.timestamp = Date.now();
    this.returnvalue = null;
    this.failedReason = null;
    this.stacktrace = [];
  }
  async updateProgress() {}
  async log() {}
}

function Processor(queueName, options) {
  return function (target) {
    target.prototype.queueName = queueName;
    target.prototype.options = options;
    return target;
  };
}

function OnWorkerEvent(eventName) {
  return function (target, propertyKey, descriptor) {
    return descriptor;
  };
}

function InjectQueue(queueName) {
  return function (target, propertyKey, parameterIndex) {
    return target;
  };
}

class MockBullModule {
  static registerQueueAsync(options) {
    return {
      module: class MockQueueModule {},
      providers: [],
      exports: [],
    };
  }
  
  static forRoot(options) {
    return {
      module: class MockBullRootModule {},
      providers: [],
      exports: [],
    };
  }
  
  static forRootAsync(options) {
    return {
      module: class MockBullRootAsyncModule {},
      providers: [],
      exports: [],
    };
  }
}

module.exports = {
  // bullmq exports
  Queue: MockQueue,
  Worker: MockWorker,
  QueueEvents: MockQueueEvents,
  QueueScheduler: MockQueueScheduler,
  Job: MockJob,
  
  // @nestjs/bullmq exports
  WorkerHost: MockWorkerHost,
  Processor,
  OnWorkerEvent,
  InjectQueue,
  BullModule: MockBullModule,
};
