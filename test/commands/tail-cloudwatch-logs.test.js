const _ = require("lodash");
const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");
const inquirer = require("inquirer");

const mockDescribeLogGroups = jest.fn();
AWS.CloudWatchLogs.prototype.describeLogGroups = mockDescribeLogGroups;
const mockDescribeLogStreams = jest.fn();
AWS.CloudWatchLogs.prototype.describeLogStreams = mockDescribeLogStreams;
const mockFilterLogEvents = jest.fn();
AWS.CloudWatchLogs.prototype.filterLogEvents = mockFilterLogEvents;
const mockPrompt = jest.fn();
inquirer.prompt = mockPrompt;

const mockOpenStdin = jest.fn();
process.openStdin = mockOpenStdin;
process.stdin.setRawMode = jest.fn();
process.exit = jest.fn();

beforeEach(() => {
	mockDescribeLogGroups.mockReset();
	mockDescribeLogStreams.mockReset();
	mockFilterLogEvents.mockReset();
	mockPrompt.mockReset();
	mockOpenStdin.mockReset();
  
	mockOpenStdin.mockReturnValue({
		once: (_event, cb) => Promise.delay(1000).then(cb)
	});
});

const commandArgs = ["tail-cloudwatch-logs", "-n", "/aws/lambda/function", "-r", "us-east-1", "-i", "250"];
describe("tail-cloudwatch-logs", () => {
	describe("when there are no log groups", () => {
		beforeEach(() => {
			givenDescribeLogGroupsReturns([]);
		});
    
		test
			.stdout()
			.command(commandArgs)
			.exit(1)
			.it("reports no matching log group", async (ctx) => {
				expect(ctx.stdout).to.contain("no matching log groups, please double check the prefix and region and try again");
			});
	});
  
	describe("when there are too many matching log groups", () => {
		beforeEach(() => {
			givenDescribeLogGroupsReturns(["/aws/lambda/function-a", "/aws/lambda/function-b"], true);
		});
    
		test
			.stdout()
			.command(commandArgs)
			.exit(1)
			.it("reports too many matches", async (ctx) => {
				expect(ctx.stdout).to.contain("found more than 50 log groups with matching prefix, please provide the full log group name and try again");
			});
	});
  
	describe("when there are more than one matching log groups", () => {
		beforeEach(() => {
			givenDescribeLogGroupsReturns(["/aws/lambda/function-a", "/aws/lambda/function-b"]);
			givenDescribeLogStreamsReturns(1);
			givenFilterLogEventsAlwaysReturns(["foo bar"]);
      
			mockPrompt.mockResolvedValueOnce({
				logGroupName: "/aws/lambda/function-b"
			});
		});
    
		test
			.stdout()
			.command(commandArgs)
			.exit(0)
			.it("lets user choose the log group", async () => {
				expect(mockPrompt.mock.calls).to.have.length(1);
			});
	});
  
	describe("when there is an exact match", () => {
		beforeEach(() => {
			givenDescribeLogGroupsReturns(["/aws/lambda/function-a"]);
		});
    
		describe("when there are no log streams", () => {
			beforeEach(() => {
				givenDescribeLogStreamsReturns(0);
				givenDescribeLogStreamsReturns(1);
				givenFilterLogEventsAlwaysReturns(["foo bar"]);
			});
      
			test
				.stdout()
				.command(commandArgs)
				.exit(0)
				.it("request is retried", async () => {
					expect(mockDescribeLogStreams.mock.calls).to.have.length(2);
				});
		});
    
		describe("when there are log streams", () => {
			beforeEach(() => {
				givenDescribeLogStreamsReturns(5);
				givenFilterLogEventsReturns(["old mcdonald had a farm"], true);
				givenFilterLogEventsReturns(["ye ya ye ya o"]);
				givenFilterLogEventsAlwaysReturns(["in the farm he had a lambda"]);
			});
      
			test
				.stdout()
				.command(commandArgs)
				.exit(0)
				.it("logs CloudWatch log messages", async (ctx) => {
					expect(ctx.stdout).to.contain("old mcdonald had a farm");
					expect(ctx.stdout).to.contain("ye ya ye ya o");
					expect(ctx.stdout).to.contain("in the farm he had a lambda");
				});
		});
	});
});

function givenDescribeLogGroupsReturns(logGroupNames, hasMore = false) {
	mockDescribeLogGroups.mockReturnValueOnce({
		promise: () => Promise.resolve({
			logGroups: logGroupNames.map(logGroupName => ({ 
				logGroupName
			})),
			nextToken: hasMore ? "more" : undefined
		})
	});
};

function givenDescribeLogStreamsReturns(count) {
	mockDescribeLogStreams.mockReturnValueOnce({
		promise: () => Promise.resolve({
			logStreams: _.range(0, count).map(n => ({
				logStreamName: `log-stream-${n}`
			}))
		})
	});
};

function givenFilterLogEventsReturns(messages, hasMore = false) {
	mockFilterLogEvents.mockReturnValueOnce({
		promise: () => Promise.resolve({
			events: messages.map(message => ({
				message
			})),
			nextToken: hasMore ? "more" : undefined
		})
	});
}

function givenFilterLogEventsAlwaysReturns(messages) {
	mockFilterLogEvents.mockReturnValue({
		promise: () => Promise.resolve({
			events: messages.map(message => ({
				message
			}))
		})
	});
}
