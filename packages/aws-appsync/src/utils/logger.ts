import debug from 'debug';

export type Logger = Function & {
    extend(category: string): Logger;
};

const noLogger: Logger = (() => {
    const logger = console.log.bind(console, 'aws-appsync');
    logger.extend = (_category: string) => logger;

    return logger;
})();

const debugLogger = debug('aws-appsync') as Logger;

const extend = function (category = '') {
    const newCategory = category ? [...this.namespace.split(':'), category].join(':') : this.namespace;

    const result = debug(newCategory);
    result.extend = extend.bind(result);

    return result;
};
debugLogger.extend = extend.bind(debugLogger);

const logger: Logger = debug ? debugLogger : noLogger;

export default logger;
