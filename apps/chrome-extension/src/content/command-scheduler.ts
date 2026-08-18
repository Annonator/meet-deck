import type {
  ContentResultStatus,
  ContentToWorkerMessage,
  MeetCommand,
  WorkerToContentMessage
} from "./internal-protocol";

type ResultMessage = Extract<ContentToWorkerMessage, { kind: "meet.result" }>;

export interface ContentCommandSchedulerOptions {
  readonly execute: (command: MeetCommand) => Promise<ContentResultStatus>;
  readonly now?: () => number;
  readonly onAfterExecution: () => void;
  readonly postResult: (message: ResultMessage) => void;
}

/**
 * Serialises only commands that operate on the same Meet control. The deadline
 * check happens inside the queue, immediately before execution, so a command
 * cannot click after the service worker has already timed it out.
 */
export class ContentCommandScheduler {
  readonly #execute: ContentCommandSchedulerOptions["execute"];
  readonly #now: () => number;
  readonly #onAfterExecution: () => void;
  readonly #postResult: ContentCommandSchedulerOptions["postResult"];
  readonly #queues = new Map<string, Promise<void>>();

  constructor(options: ContentCommandSchedulerOptions) {
    this.#execute = options.execute;
    this.#now = options.now ?? Date.now;
    this.#onAfterExecution = options.onAfterExecution;
    this.#postResult = options.postResult;
  }

  enqueue(message: WorkerToContentMessage): Promise<void> {
    const key = commandQueueKey(message.command.action);
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const execution = previous.then(async () => {
      if (this.#now() >= message.deadline) {
        this.#postResult({ id: message.command.id, kind: "meet.result", status: "timeout" });
        return;
      }

      let status: ContentResultStatus;
      try {
        status = await this.#execute(message.command);
      } catch {
        status = "unsupported_ui";
      }
      this.#postResult({ id: message.command.id, kind: "meet.result", status });
      this.#onAfterExecution();
    });
    this.#queues.set(key, execution);
    void execution.then(() => {
      if (this.#queues.get(key) === execution) {
        this.#queues.delete(key);
      }
    });
    return execution;
  }
}

function commandQueueKey(action: MeetCommand["action"]): string {
  return action.startsWith("presentation.") ? "presentation" : action;
}
