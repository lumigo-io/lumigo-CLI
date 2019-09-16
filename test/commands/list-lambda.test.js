const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockGetMetricData = jest.fn();
AWS.CloudWatch.prototype.getMetricData = mockGetMetricData;
const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;

const consoleLog = jest.fn();
console.log = consoleLog;

afterEach(() => {
	mockGetMetricData.mockReset();
	mockListFunctions.mockReset();
	consoleLog.mockReset();
});

describe("list-lambda", () => {
	describe("if a function has no metrics", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"]);
			givenListFunctionsAlwaysReturns([]);
      
			givenGetMetricDataAlwaysReturns([
				{ functionName: "function-a", timestamps: [] }
			]);
		});
    
		test
			.stdout()
			.command(["list-lambda"])
			.it("deems the function as inactive", () => {
				const calls = consoleLog.mock.calls;
				expect(calls).to.have.length(1);
        
				const [[table]] = calls;
				expect(table).to.contain("function-a");
				expect(table).to.contain("128"); // memory
				expect(table).to.contain("1.00 KB"); // code size
				expect(table).to.contain("a few seconds ago"); // last modified
				expect(table).to.contain("inactive for 30 days"); // last used since there are no timestamp
			});
    
		test
			.stdout()
			.command(["list-lambda"])
			.it("calls all regions", () => {
				const calls = consoleLog.mock.calls;
				expect(calls).to.have.length(1);
        
				expect(mockListFunctions.mock.calls).to.have.length(16);				
			});
    
		test
			.stdout()
			.command(["list-lambda", "-r", "us-east-1"])
			.it("calls only one region", () => {
				const calls = consoleLog.mock.calls;
				expect(calls).to.have.length(1);
        
				expect(mockListFunctions.mock.calls).to.have.length(1);
			});
    
		test
			.stdout()
			.command(["list-lambda", "-r", "us-east-1", "-i"])
			.it("includes the inactive function", () => {
				expect(consoleLog.mock.calls).to.have.length(1);
				const [[table]] = consoleLog.mock.calls;
        
				expect(table).to.contain("function-a");
			});
	});
  
	describe("if a function has invocation metrics", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"]);
			givenListFunctionsAlwaysReturns([]);
      
			givenGetMetricDataAlwaysReturns([
				{ functionName: "function-a", timestamps: [new Date()] }
			]);
		});
    
		test
			.stdout()
			.command(["list-lambda"])
			.it("does not deem the function as inactive", () => {
				const calls = consoleLog.mock.calls;
				expect(calls).to.have.length(1);
        
				const [[table]] = calls;
				expect(table).to.contain("function-a");
				expect(table).to.contain("128"); // memory
				expect(table).to.contain("1.00 KB"); // code size
				expect(table).to.contain("a few seconds ago"); // last modified
				expect(table).to.not.contain("inactive for 30 days");
			});
      
		test
			.stdout()
			.command(["list-lambda", "-r", "us-east-1", "-i"])
			.it("does not include the inactive function", () => {
				expect(consoleLog.mock.calls).to.have.length(1);
				const [[table]] = consoleLog.mock.calls;
        
				expect(table).to.not.contain("function-a");
			});
	});
  
	describe("if there are more than one page of functions", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"], true);
			givenListFunctionsReturns(["function-b"]);
      
			givenGetMetricDataAlwaysReturns([
				{ functionName: "function-a", timestamps: [new Date()] },
				{ functionName: "function-b", timestamps: [new Date()] }
			]);
		});
    
		test
			.stdout()
			.command(["list-lambda", "-r", "us-east-1"])
			.it("recurses and fetches all functions", () => {
				expect(mockListFunctions.mock.calls).to.have.length(2);

				expect(consoleLog.mock.calls).to.have.length(1);
				const [[table]] = consoleLog.mock.calls;
        
				expect(table).to.contain("function-a");
				expect(table).to.contain("function-b");
			});
	});
});

function givenGetMetricDataAlwaysReturns (metricTimestamps) {
	mockGetMetricData.mockReturnValue({
		promise: () => Promise.resolve({
			MetricDataResults: metricTimestamps.map(({ functionName, timestamps }) => ({
				Label: functionName,
				Timestamps: timestamps
			}))
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
