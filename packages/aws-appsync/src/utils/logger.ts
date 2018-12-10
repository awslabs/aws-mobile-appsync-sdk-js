import debug from 'debug';

export type Logger = Function & {
    extend(category: string): Logger;
};

const logger: Logger = debug('aws-appsync');

export default logger;
