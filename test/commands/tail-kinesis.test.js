const {expect, test} = require("@oclif/test");
const zlib = require("zlib");
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

beforeEach(() => {
	mockGetShardIterator.mockReturnValue({
		promise: () => Promise.resolve({
			ShardIterator: "iterator"
		})
	});
  
	mockOpenStdin.mockReturnValue({
		once: (_event, cb) => Promise.delay(1000).then(cb)
	});
});

afterEach(() => {
	mockDescribeStream.mockReset();
	mockGetShardIterator.mockReset();
	mockGetRecords.mockReset();
	mockOpenStdin.mockReset();
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
				expect(ctx.stdout).to.contain("message 1");
				expect(ctx.stdout).to.contain("message 2");
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

				expect(ctx.stdout).to.contain("message 1");
				expect(ctx.stdout).to.contain("message 2");
				expect(ctx.stdout).to.contain("message 3");
			});
	});
  
	describe("when the records are zipped", () => {
		beforeEach(() => {
			givenDescribeStreamsReturns(["shard01"]);
			givenGetRecordsReturns(["message 1", "message 2"], true);
			givenGetRecordsAlwaysReturns([]);
		});
    
		test
			.stdout()
			.command(["tail-kinesis", "-n", "stream-dev", "-r", "us-east-1"])
			.it("displays unzipped messages in the console", (ctx) => {
				expect(ctx.stdout).to.contain("message 1");
				expect(ctx.stdout).to.contain("message 2");
			});
	});
  
	describe("when the records are JSON", () => {
		const data1 = { message: 42 };
		const data2 = { foo: "bar" };

		beforeEach(() => {
			givenDescribeStreamsReturns(["shard01"]);
			givenGetRecordsReturns([JSON.stringify(data1), JSON.stringify(data2)]);
			givenGetRecordsAlwaysReturns([]);
		});
    
		test
			.stdout()
			.command(["tail-kinesis", "-n", "stream-dev", "-r", "us-east-1"])
			.it("displays prettified JSON messages in the console", (ctx) => {
				expect(ctx.stdout).to.contain(JSON.stringify(data1, undefined, 2));
				expect(ctx.stdout).to.contain(JSON.stringify(data2, undefined, 2));
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

function givenGetRecordsReturns(messages, zip = false) {
	mockGetRecords.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Records: messages.map(msg => ({
				Data: zip 
					? zlib.gzipSync(Buffer.from(msg, "utf-8")).toString("base64")
					: Buffer.from(msg, "utf-8").toString("base64")
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
