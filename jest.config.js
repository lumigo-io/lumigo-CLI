module.exports = {
	collectCoverage: true,
	coverageReporters: [
		"text",
		"html",
		"lcov"
	],
	testEnvironment: "node",
	// setupTestFrameworkScriptFile has been deprecated in
	// favor of setupFilesAfterEnv in jest 24
	setupFilesAfterEnv: ["./jest.setup.js"],
	testRunner: "jest-circus/runner"
};
