export abstract class AuthType {

    private options;

    constructor(options) {
        this.options = options;
    }

    getOptions() {
        return this.options;
    }

    abstract async getExtraHeader(operation, url, region);

    
}
