const _ = require("lodash");
const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");

const mockDescribeStream = jest.fn();
AWS.Kinesis.prototype.describeStream = mockDescribeStream;
const mockGetShardIterator = jest.fn();
AWS.Kinesis.prototype.getShardIterator = mockGetShardIterator;
const mockGetRecords = jest.fn();
AWS.Kinesis.prototype.getRecords = mockGetRecords;
const mockOpenStdin = jest.fn();
process.openStdin = mockOpenStdin;
process.stdin.setRawMode = jest.fn();
process.exit = jest.fn();

const consoleLog = jest.fn();
console.log = consoleLog;

beforeEach(() => {
	mockDescribeStream.mockReset();
	mockGetShardIterator.mockReset();
	mockGetRecords.mockReset();
	consoleLog.mockReset();
	mockOpenStdin.mockReset();
  
	mockGetShardIterator.mockReturnValue({
		promise: () => Promise.resolve({
			ShardIterator: "iterator"
		})
	});
  
	mockOpenStdin.mockReturnValue({
		once: (_event, cb) => Promise.delay(1000).then(cb)
	});
});

describe("tail-kinesis", () => {
	describe("when the stream has one shard", () => {
		beforeEach(() => {
			givenDescribeStreamsReturns(["shard01"]);
			givenGetRecordsReturns(["message 1", "message 2"]);
			givenGetRecordsAlwaysReturns([]);
		});
    
		test
			.stdout()
			.command(["tail-kinesis", "-n", "stream-dev", "-r", "us-east-1"])
			.it("displays messages in the console", async (ctx) => {
				expect(ctx.stdout).to.contain("checking Kinesis stream [stream-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("polling Kinesis stream [stream-dev] (1 shards)...");

				// unfortunately, ctx.stdout doesn't seem to capture the messages published by console.log
				// hence this workaround...
				const logMessages = _.flatMap(consoleLog.mock.calls, call => call);
				expect(logMessages).to.contain("message 1");
				expect(logMessages).to.contain("message 2");
			});
	});
  
	describe("when the stream has more than one shard", () => {
		beforeEach(() => {
			givenDescribeStreamsReturns(["shard01", "shard02"]);
			givenGetRecordsReturns(["message 1"]);
			givenGetRecordsReturns(["message 2"]);
			givenGetRecordsReturns(["message 3"]);
			givenGetRecordsAlwaysReturns([]);
		});
    
		test
			.stdout()
			.command(["tail-kinesis", "-n", "stream-dev", "-r", "us-east-1"])
			.it("displays messages in the console", ctx => {
				expect(ctx.stdout).to.contain("checking Kinesis stream [stream-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("polling Kinesis stream [stream-dev] (2 shards)...");

				// unfortunately, ctx.stdout doesn't seem to capture the messages published by console.log
				// hence this workaround...
				const logMessages = _.flatMap(consoleLog.mock.calls, call => call);
				expect(logMessages).to.contain("message 1");
				expect(logMessages).to.contain("message 2");
				expect(logMessages).to.contain("message 3");
			});
	});
});

function givenDescribeStreamsReturns(shardIds) {
	mockDescribeStream.mockReturnValueOnce({
		promise: () => Promise.resolve({
			StreamDescription: {
				StreamARN: "arn",
				StreamStatus: "ACTIVE",
				Shards: shardIds.map(shardId => ({ ShardId: shardId }))
			}
		})
	});
};

function givenGetRecordsReturns(messages) {
	mockGetRecords.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Records: messages.map(msg => ({
				Data: Buffer.from(msg, "utf-8").toString("base64")
			})),
			NextIterator: "iterator more"
		})
	});
};

function givenGetRecordsAlwaysReturns(messages) {
	mockGetRecords.mockReturnValue({
		promise: () => Promise.resolve({
			Records: messages.map(msg => ({
				Data: Buffer.from(msg, "utf-8").toString("base64")
			})),
			NextIterator: "iterator more"
		})
	});
};
