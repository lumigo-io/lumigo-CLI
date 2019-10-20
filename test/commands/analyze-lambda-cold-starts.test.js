const _ = require("lodash");
const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockStartQuery = jest.fn();
AWS.CloudWatchLogs.prototype.startQuery = mockStartQuery;
const mockGetQueryResults = jest.fn();
AWS.CloudWatchLogs.prototype.getQueryResults = mockGetQueryResults;
const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;
const mockGetFunctionConfiguration = jest.fn();
AWS.Lambda.prototype.getFunctionConfiguration = mockGetFunctionConfiguration;

const consoleLog = jest.fn();
console.log = consoleLog;

const command = "analyze-lambda-cold-starts";

beforeEach(() => {
	mockStartQuery.mockReturnValue({
		promise: () => Promise.resolve({ queryId: "foo" })
	});
});

afterEach(() => {
	mockStartQuery.mockReset();
	mockGetQueryResults.mockReset();
	mockListFunctions.mockReset();
	mockGetFunctionConfiguration.mockReset();
	consoleLog.mockReset();
});

describe("analyze-lambda-cold-starts", () => {
	describe("if a function has no cold starts", () => {
		beforeEach(() => {
			givenListFunctionsAlwaysReturns(["function-a"]);      
			givenGetQueryResultsAlwaysReturns("Complete", []);
      
			givenGetFunctionConfigurationAlwaysReturns("function-a");
		});
    
		test
			.stdout()
			.command([command])
			.it("deems the function as no cold starts", () => {
				const logs = collectLogMessages();
				expect(logs).to.not.contain("function-a");
			});
    
		test
			.stdout()
			.command([command])
			.it("calls all regions", () => {
				expect(mockListFunctions.mock.calls).to.have.length(16);
				expect(mockStartQuery.mock.calls).to.have.length(16);
				expect(mockGetQueryResults.mock.calls).to.have.length(16);
			});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1"])
			.it("calls only one region", () => {
				expect(mockListFunctions.mock.calls).to.have.length(1);
				expect(mockStartQuery.mock.calls).to.have.length(1);
				expect(mockGetQueryResults.mock.calls).to.have.length(1);
			});
    
		test
			.stdout()
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
			givenListFunctionsReturns(["function"]);
			givenListFunctionsAlwaysReturns([]);
      
			givenGetQueryResultsAlwaysReturns("Complete", [
				[ { field: "memorySize", value: 128 }, 
				  { field: "functionName", value: "function" },
					{ field: "coldStarts", value: 1 },
					{ field: "avgInitDuration", value: 142 },
					{ field: "maxInitDuration", value: 251 } ]
			]);
      
			givenGetFunctionConfigurationAlwaysReturns("function");
		});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1"])
			.it("calculates the function cold start stats for a region", () => {
				const logs = collectLogMessages();
				expect(logs).to.contain("us-east-1: running CloudWatch Insights query against 1 log groups");
				expect(logs).to.contain("us-east-1: query returned 1 rows in total");
				expect(logs).to.contain("function");
				expect(logs).to.contain("128"); // memory
				expect(logs).to.contain("2");   // cold starts
				expect(logs).to.contain("142"); // avg init
				expect(logs).to.contain("251"); // max init
			});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1", "-n", "function"])
			.it("calculates the function cold start stats for a single function", () => {
				const logs = collectLogMessages();
				expect(logs).to.contain("us-east-1: running CloudWatch Insights query against 1 log groups");
				expect(logs).to.contain("us-east-1: query returned 1 rows in total");
				expect(logs).to.contain("function");
				expect(logs).to.contain("128"); // memory
				expect(logs).to.contain("2");   // cold starts
				expect(logs).to.contain("142"); // avg init
				expect(logs).to.contain("251"); // max init
			});
	});
  
	describe("if there are more than one page of functions", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"], true);
			givenListFunctionsReturns(["function-b"]);
      
			givenGetQueryResultsAlwaysReturns("Complete", [
				[ { field: "memorySize", value: 128 }, 
				  { field: "functionName", value: "function-a" },
					{ field: "coldStarts", value: 1 },
					{ field: "avgInitDuration", value: 142 },
					{ field: "maxInitDuration", value: 251 } ]
			]);
		});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1"])
			.it("recurses and fetches all functions", () => {
				expect(mockListFunctions.mock.calls).to.have.length(2);

				const logs = collectLogMessages();
				expect(logs).to.contain("us-east-1: running CloudWatch Insights query against 2 log groups");
				expect(logs).to.contain("us-east-1: query returned 1 rows in total");
				expect(logs).to.contain("function-a");
				expect(logs).to.not.contain("function-b"); // function-b has no cold start results
			});
	});
  
	describe("if there are no functions", () => {
		beforeEach(() => {
			givenListFunctionsReturns([]);
		});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1"])
			.it("short-circuits the CloudWatch Logs query", () => {
				expect(mockStartQuery.mock.calls).to.be.empty;
			});
	});
  
	describe("if query result is not ready yet", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"]);
      
			givenGetQueryResultsReturns("Running", []);
			givenGetQueryResultsReturns("Complete", [
				[ { field: "memorySize", value: 128 }, 
				  { field: "functionName", value: "function-a" },
					{ field: "coldStarts", value: 1 },
					{ field: "avgInitDuration", value: 142 },
					{ field: "maxInitDuration", value: 251 } ]
			]);
		});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1"])
			.it("retries after delay", () => {
				expect(mockGetQueryResults.mock.calls).to.have.lengthOf(2);
        
				const logs = collectLogMessages();
				expect(logs).to.contain("function-a");
			});
	});
  
	describe("if days is specified", () => {
		beforeEach(() => {
			givenListFunctionsReturns([]);
		});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1", "-d", "6"])
			.it("converts days to hours", (ctx) => {
				expect(ctx.stdout).to.contain("analyzing cold starts over the last 144 hours");
			});
	});
});

function collectLogMessages () {
	return _.flatMap(consoleLog.mock.calls, call => call).join("\n");
}

function givenGetQueryResultsReturns (status, results) {
	mockGetQueryResults.mockReturnValueOnce({
		promise: () => Promise.resolve({
			status,
			results
		})
	});
};

function givenGetQueryResultsAlwaysReturns (status, results) {
	mockGetQueryResults.mockReturnValue({
		promise: () => Promise.resolve({
			status,
			results
		})
	});
};

function givenListFunctionsReturns (functionNames, hasMore = false) {
	mockListFunctions.mockReturnValueOnce({
		promise: () => Promise.resolve({
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
};

function givenListFunctionsAlwaysReturns (functionNames) {
	mockListFunctions.mockReturnValue({
		promise: () => Promise.resolve({
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

function givenGetFunctionConfigurationAlwaysReturns (functionName) {
	mockGetFunctionConfiguration.mockReturnValue({
		promise: () => Promise.resolve({
			FunctionName: functionName,
			Runtime: "nodejs10.x",
			MemorySize: 128,
			CodeSize: 1024,
			LastModified: new Date().toJSON()        
		})
	});
}
