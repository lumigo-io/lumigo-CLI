const _ = require("lodash");
const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");

const mockDescribeTable = jest.fn();
AWS.DynamoDB.prototype.describeTable = mockDescribeTable;
const mockDescribeStream = jest.fn();
AWS.DynamoDBStreams.prototype.describeStream = mockDescribeStream;
const mockGetShardIterator = jest.fn();
AWS.DynamoDBStreams.prototype.getShardIterator = mockGetShardIterator;
const mockGetRecords = jest.fn();
AWS.DynamoDBStreams.prototype.getRecords = mockGetRecords;

const mockOpenStdin = jest.fn();
process.openStdin = mockOpenStdin;
process.stdin.setRawMode = jest.fn();
process.exit = jest.fn();

const consoleLog = jest.fn();
console.log = consoleLog;

beforeEach(() => {
	mockDescribeTable.mockReset();
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

describe("tail-dynamodb", () => {
	describe("when the table has no streams", () => {
		beforeEach(() => {
			givenDescribeTableReturns();
		});
    
		test
			.stdout()
			.command(["tail-dynamodb", "-n", "users-dev", "-r", "us-east-1"])
			.exit()
			.it("reports the table has no stream", async (ctx) => {
				expect(ctx.stdout).to.contain("table doesn't have a stream, exiting...");
			});
	});

	describe("when the stream has one shard", () => {
		const streamArn = "arn:aws:dynamodb:us-east-1:12345:table/users-dev/stream/2019-10-03T20:40:59.351";
    
		beforeEach(() => {
			givenDescribeTableReturns(streamArn);
			givenDescribeStreamsReturns(["shard01"]);
			givenGetRecordsReturns([genEvent("message 1"), genEvent("message 2")]);
			givenGetRecordsAlwaysReturns([]);
		});
    
		test
			.stdout()
			.command(["tail-dynamodb", "-n", "users-dev", "-r", "us-east-1"])
			.it("displays messages in the console", async (ctx) => {
				expect(ctx.stdout).to.contain(`checking DynamoDB stream [${streamArn}] in [us-east-1]`);
				expect(ctx.stdout).to.contain("polling DynamoDB stream for table [users-dev] (1 shards)...");

				// unfortunately, ctx.stdout doesn't seem to capture the messages published by console.log
				// hence this workaround...
				const logMessages = _.flatMap(consoleLog.mock.calls, call => call).join("\n");
				expect(logMessages).to.contain("message 1");
				expect(logMessages).to.contain("message 2");
			});
	});
  
	describe("when the stream has more than one shard", () => {
		const streamArn = "arn:aws:dynamodb:us-east-1:12345:table/users-dev/stream/2019-10-03T20:40:59.351";

		beforeEach(() => {
			givenDescribeTableReturns(streamArn);
			givenDescribeStreamsReturns(["shard01", "shard02"]);
			givenGetRecordsReturns([genEvent("message 1")]);
			givenGetRecordsReturns([genEvent("message 2")]);
			givenGetRecordsReturns([genEvent("message 3")]);
			givenGetRecordsAlwaysReturns([]);
		});
    
		test
			.stdout()
			.command(["tail-dynamodb", "-n", "users-dev", "-r", "us-east-1"])
			.it("displays messages in the console", ctx => {
				expect(ctx.stdout).to.contain("polling DynamoDB stream for table [users-dev] (2 shards)...");

				// unfortunately, ctx.stdout doesn't seem to capture the messages published by console.log
				// hence this workaround...
				const logMessages = _.flatMap(consoleLog.mock.calls, call => call).join("\n");
				expect(logMessages).to.contain("message 1");
				expect(logMessages).to.contain("message 2");
				expect(logMessages).to.contain("message 3");
			});
	});
});

function givenDescribeTableReturns(streamArn) {
	mockDescribeTable.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Table: {
				LatestStreamArn: streamArn
			}			
		})
	});
}

function givenDescribeStreamsReturns(shardIds) {
	mockDescribeStream.mockReturnValueOnce({
		promise: () => Promise.resolve({
			StreamDescription: {
				StreamARN: "arn",
				StreamStatus: "ACTIVE",
				StreamViewType: "NEW_AND_OLD_IMAGES",
				Shards: shardIds.map(shardId => ({ ShardId: shardId }))
			}
		})
	});
};

function givenGetRecordsReturns(records) {
	mockGetRecords.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Records: records,
			NextIterator: "iterator more"
		})
	});
};

function givenGetRecordsAlwaysReturns(records) {
	mockGetRecords.mockReturnValue({
		promise: () => Promise.resolve({
			Records: records,
			NextIterator: "iterator more"
		})
	});
};

function genEvent(id) {
	return JSON.stringify({
		eventID: "872a1c8d7006803f9e582736576baba2",
		eventName: "INSERT",
		eventSource: "aws:dynamodb",
		dynamodb: {
			ApproximateCreationDateTime: new Date().toJSON(),
			Keys: {
				Id: {
					S: id
				}
			},
			NewImage: {
				Id: {
					S: id
				}
			},
			SequenceNumber: "211494500000000012078462073",
			SizeBytes: 10,
			StreamViewType: "NEW_AND_OLD_IMAGES"
		}
	});
}
