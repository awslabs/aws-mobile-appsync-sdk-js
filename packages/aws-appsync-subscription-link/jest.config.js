module.exports = {
    transform: {
        "^.+\\.tsx?$": ["ts-jest", {
            tsconfig: {
                target: "es2017"
            }
        }]
    },
    testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    collectCoverageFrom: [
        "src/**/*",
        "!src/vendor/**"
    ],
    moduleFileExtensions: [
        "ts",
        "tsx",
        "js",
        "jsx",
        "json",
        "node"
    ],
    testEnvironment: "node"
};
