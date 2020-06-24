import { rootLogger } from "./index";
import { DelayFunction } from "../types";

const logger = rootLogger.extend("retry");

const MAX_DELAY_MS = 5000;

/**
 * Internal use of Subscription link 
 * @private
 */ 
export class NonRetryableError extends Error {
  public readonly nonRetryable = true;
  constructor(message: string) {
    super(message);
  }
}

const isNonRetryableError = (obj: any): obj is NonRetryableError => {
  const key: keyof NonRetryableError = "nonRetryable";
  return obj && obj[key];
};

/**
 * @private
 * Internal use of Subscription link 
 */ 
export async function retry(
  functionToRetry: Function,
  args: any[],
  delayFn: DelayFunction,
  attempt: number = 1
) {
  logger(`Attempt #${attempt} for this vars: ${JSON.stringify(args)}`);
  try {
    await functionToRetry.apply(undefined, args);
  } catch (err) {
    logger(`error ${err}`);
    if (isNonRetryableError(err)) {
      logger("non retryable error");
      throw err;
    }

    const retryIn = delayFn(attempt, args, err);
    logger("retryIn ", retryIn);
    if (retryIn !== false) {
      await new Promise(res => setTimeout(res, retryIn));
      return await retry(functionToRetry, args, delayFn, attempt + 1);
    } else {
      throw err;
    }
  }
}

function jitteredBackoff(maxDelayMs: number): DelayFunction {
  const BASE_TIME_MS = 100;
  const JITTER_FACTOR = 100;

  return attempt => {
    const delay = 2 ** attempt * BASE_TIME_MS + JITTER_FACTOR * Math.random();
    return delay > maxDelayMs ? false : delay;
  };
}

/**
 * @private
 * Internal use of Subscription link 
 */ 
export const jitteredExponentialRetry = (
  functionToRetry: Function,
  args: any[],
  maxDelayMs: number = MAX_DELAY_MS
) => retry(functionToRetry, args, jitteredBackoff(maxDelayMs));
