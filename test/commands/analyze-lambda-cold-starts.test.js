const _ = require("lodash");
const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");

const mockStartQuery = jest.fn();
AWS.CloudWatchLogs.prototype.startQuery = mockStartQuery;
const mockGetQueryResults = jest.fn();
AWS.CloudWatchLogs.prototype.getQueryResults = mockGetQueryResults;
const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;
const mockGetFunctionConfiguration = jest.fn();
AWS.Lambda.prototype.getFunctionConfiguration = mockGetFunctionConfiguration;
const mockListProvisionedConcurrencyConfigs = jest.fn();
AWS.Lambda.prototype.listProvisionedConcurrencyConfigs = mockListProvisionedConcurrencyConfigs;

const command = "analyze-lambda-cold-starts";

beforeEach(() => {
	mockListProvisionedConcurrencyConfigs.mockReturnValue({
		promise: () =>
			Promise.resolve({
				ProvisionedConcurrencyConfigs: []
			})
	});
});

afterEach(() => {
	mockStartQuery.mockReset();
	mockGetQueryResults.mockReset();
	mockListFunctions.mockReset();
	mockGetFunctionConfiguration.mockReset();
	mockListProvisionedConcurrencyConfigs.mockReset();
});

describe("analyze-lambda-cold-starts", () => {
	describe("if a function has no cold starts", () => {
		beforeEach(() => {
			givenStartQueryAlwaysSucceeds();
			givenListFunctionsAlwaysReturns(["function-a"]);
			givenGetQueryResultsAlwaysReturns("Complete", []);

			givenGetFunctionConfigurationAlwaysReturns("function-a");
		});

		test.stdout()
			.command([command])
			.it("deems the function as no cold starts", ctx => {
				const rows = ctx.stdout
					.split("\n")
					.filter(row => row.startsWith("│") && !row.includes("region"));
				rows.forEach(row => {
					const fields = row
						.split("│")
						.map(x => x.trim())
						.filter(x => !_.isEmpty(x));
					// region, name, runtime, memory, count (5th column), ...
					expect(fields[4]).to.equal("-");
				});
			});

		test.stdout()
			.command([command])
			.it("calls all regions", () => {
				expect(mockListFunctions.mock.calls).to.have.length(16);
				expect(mockStartQuery.mock.calls).to.have.length(16);
				expect(mockGetQueryResults.mock.calls).to.have.length(16);
			});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("calls only one region", () => {
				expect(mockListFunctions.mock.calls).to.have.length(1);
				expect(mockStartQuery.mock.calls).to.have.length(1);
				expect(mockGetQueryResults.mock.calls).to.have.length(1);
			});

		test.stdout()
			.command([command, "-r", "us-east-1", "-n", "function-a"])
			.it("calls only one function", () => {
				expect(mockListFunctions.mock.calls).to.be.empty;
				expect(mockGetFunctionConfiguration.mock.calls).to.have.lengthOf(1);
				expect(mockStartQuery.mock.calls).to.have.length(1);
				expect(mockGetQueryResults.mock.calls).to.have.length(1);
			});
	});

	describe("if a function has cold starts", () => {
		beforeEach(() => {
			givenStartQueryAlwaysSucceeds();
			givenListFunctionsReturns(["function"]);
			givenListFunctionsAlwaysReturns([]);

			givenGetQueryResultsAlwaysReturns("Complete", [
				[
					{ field: "memorySize", value: 128 },
					{ field: "functionName", value: "function" },
					{ field: "coldStarts", value: 1 },
					{ field: "avgInitDuration", value: 142 },
					{ field: "maxInitDuration", value: 251 }
				]
			]);

			givenGetFunctionConfigurationAlwaysReturns("function");
		});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("calculates the function cold start stats for a region", ctx => {
				expect(ctx.stdout).to.contain(
					"us-east-1: running CloudWatch Insights query against 1 log groups"
				);
				expect(ctx.stdout).to.contain(
					"us-east-1: query returned 1 rows in total"
				);
				expect(ctx.stdout).to.contain("function");
				expect(ctx.stdout).to.contain("128"); // memory
				expect(ctx.stdout).to.contain("2"); // cold starts
				expect(ctx.stdout).to.contain("142"); // avg init
				expect(ctx.stdout).to.contain("251"); // max init
			});

		test.stdout()
			.command([command, "-r", "us-east-1", "-n", "function"])
			.it("calculates the function cold start stats for a single function", ctx => {
				expect(ctx.stdout).to.contain(
					"us-east-1: running CloudWatch Insights query against 1 log groups"
				);
				expect(ctx.stdout).to.contain(
					"us-east-1: query returned 1 rows in total"
				);
				expect(ctx.stdout).to.contain("function");
				expect(ctx.stdout).to.contain("128"); // memory
				expect(ctx.stdout).to.contain("2"); // cold starts
				expect(ctx.stdout).to.contain("142"); // avg init
				expect(ctx.stdout).to.contain("251"); // max init
			});
	});

	describe("if there are more than one page of functions", () => {
		beforeEach(() => {
			givenStartQueryAlwaysSucceeds();
			givenListFunctionsReturns(["function-a"], true);
			givenListFunctionsReturns(["function-b"]);

			givenGetQueryResultsAlwaysReturns("Complete", [
				[
					{ field: "memorySize", value: 128 },
					{ field: "functionName", value: "function-a" },
					{ field: "coldStarts", value: 1 },
					{ field: "avgInitDuration", value: 142 },
					{ field: "maxInitDuration", value: 251 }
				]
			]);
		});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("recurses and fetches all functions", ctx => {
				expect(mockListFunctions.mock.calls).to.have.length(2);

				expect(ctx.stdout).to.contain(
					"us-east-1: running CloudWatch Insights query against 2 log groups"
				);
				expect(ctx.stdout).to.contain(
					"us-east-1: query returned 1 rows in total"
				);
				expect(ctx.stdout).to.contain("function-a");
				expect(ctx.stdout).to.contain("function-b");

				const rows = ctx.stdout
					.split("\n")
					.filter(row => row.startsWith("│") && !row.includes("region"));
				const rowFuncA = rows.find(x => x.includes("function-a"));
				const rowFuncB = rows.find(x => x.includes("function-b"));

				// region, name, runtime, memory, count (5th column), ...
				const funcACount = rowFuncA
					.split("│")
					.map(x => x.trim())
					.filter(x => !_.isEmpty(x))[4];
				expect(funcACount).to.equal("1");
				const funcBCount = rowFuncB
					.split("│")
					.map(x => x.trim())
					.filter(x => !_.isEmpty(x))[4];
				expect(funcBCount).to.equal("-");
			});
	});

	describe("if there are no functions", () => {
		beforeEach(() => {
			givenListFunctionsReturns([]);
		});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("short-circuits the CloudWatch Logs query", () => {
				expect(mockStartQuery.mock.calls).to.be.empty;
			});
	});

	describe("if query result is not ready yet", () => {
		beforeEach(() => {
			givenStartQueryAlwaysSucceeds();
			givenListFunctionsReturns(["function-a"]);

			givenGetQueryResultsReturns("Running", []);
			givenGetQueryResultsReturns("Complete", [
				[
					{ field: "memorySize", value: 128 },
					{ field: "functionName", value: "function-a" },
					{ field: "coldStarts", value: 1 },
					{ field: "avgInitDuration", value: 142 },
					{ field: "maxInitDuration", value: 251 }
				]
			]);
		});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("retries after delay", ctx => {
				expect(mockGetQueryResults.mock.calls).to.have.lengthOf(2);
				expect(ctx.stdout).to.contain("function-a");
			});
	});

	describe("if days is specified", () => {
		beforeEach(() => {
			givenListFunctionsReturns([]);
		});

		test.stdout()
			.command([command, "-r", "us-east-1", "-d", "6"])
			.it("converts days to minutes", ctx => {
				expect(ctx.stdout).to.contain(
					"analyzing cold starts over the last 8640 minutes"
				);
			});
	});

	describe("if log group doesn't exist", () => {
		beforeEach(() => {
			givenStartQueryFails({
				code: "ResourceNotFoundException",
				message:
					"Log group '/aws/lambda/function1' does not exist for account ID 'xxx'"
			});
			givenListFunctionsReturns(["function1", "function2"]);
		});

		test.stdout()
			.command([command, "-r", "us-east-1"])
			.it("skips the missing CloudWatch Logs log group upon retry", () => {
				expect(mockStartQuery.mock.calls).to.have.lengthOf(2);
				const [req1, req2] = mockStartQuery.mock.calls;
				expect(req1[0].logGroupNames).to.deep.equal([
					"/aws/lambda/function1",
					"/aws/lambda/function2"
				]);
				expect(req2[0].logGroupNames).to.deep.equal(["/aws/lambda/function2"]);
			});
	});
});

function givenStartQueryAlwaysSucceeds() {
	mockStartQuery.mockReturnValue({
		promise: () => Promise.resolve({ queryId: "foo" })
	});
}

function givenStartQueryFails(error) {
	mockStartQuery.mockReturnValueOnce({
		promise: () => Promise.reject(error)
	});
}

function givenGetQueryResultsReturns(status, results) {
	mockGetQueryResults.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				status,
				results
			})
	});
}

function givenGetQueryResultsAlwaysReturns(status, results) {
	mockGetQueryResults.mockReturnValue({
		promise: () =>
			Promise.resolve({
				status,
				results
			})
	});
}

function givenListFunctionsReturns(functionNames, hasMore = false) {
	mockListFunctions.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Functions: functionNames.map(name => ({
					FunctionName: name,
					Runtime: "nodejs10.x",
					MemorySize: 128,
					CodeSize: 1024,
					LastModified: new Date().toJSON()
				})),
				NextMarker: hasMore ? "more" : undefined
			})
	});
}

function givenListFunctionsAlwaysReturns(functionNames) {
	mockListFunctions.mockReturnValue({
		promise: () =>
			Promise.resolve({
				Functions: functionNames.map(name => ({
					FunctionName: name,
					Runtime: "nodejs10.x",
					MemorySize: 128,
					CodeSize: 1024,
					LastModified: new Date().toJSON()
				}))
			})
	});
}

function givenGetFunctionConfigurationAlwaysReturns(functionName) {
	mockGetFunctionConfiguration.mockReturnValue({
		promise: () =>
			Promise.resolve({
				FunctionName: functionName,
				Runtime: "nodejs10.x",
				MemorySize: 128,
				CodeSize: 1024,
				LastModified: new Date().toJSON()
			})
	});
}
