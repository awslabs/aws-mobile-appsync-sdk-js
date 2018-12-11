import debug from 'debug';

export type Logger = Function & {
    extend(category: string): Logger;
};

const debugLogger = debug('aws-appsync') as Logger;

const extend = function (category = '') {
    const newCategory = category ? [...this.namespace.split(':'), category].join(':') : this.namespace;

    const result = debug(newCategory);
    result.extend = extend.bind(result);

    return result;
};
debugLogger.extend = extend.bind(debugLogger);

export default debugLogger;
