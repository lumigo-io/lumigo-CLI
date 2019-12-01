const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");

const mockGetMetricData = jest.fn();
const originalGetMetricData = AWS.CloudWatch.prototype.getMetricData;
AWS.CloudWatch.prototype.getMetricData = mockGetMetricData;

const mockListStreams = jest.fn();
const originalListStreams = AWS.Kinesis.prototype.listStreams;
AWS.Kinesis.prototype.listStreams = mockListStreams;

const mockDescribeStreams = jest.fn();
const originalDescribeStream = AWS.Kinesis.prototype.describeStream;
AWS.Kinesis.prototype.describeStream = mockDescribeStreams;

const consoleLog = jest.fn();
console.log = consoleLog;

after(() => {
	AWS.CloudWatch.prototype.getMetricData = originalGetMetricData;
	AWS.Kinesis.prototype.listStreams = originalListStreams;
	AWS.Kinesis.prototype.describeStream = originalDescribeStream;
});

afterEach(() => {
	mockGetMetricData.mockReset();
	mockListStreams.mockReset();
	mockDescribeStreams.mockReset();
	consoleLog.mockReset();
});

describe("list-kinesis-streams", () => {
	beforeEach(() => {
		givenListStreamsAlwaysReturns(["stream-a"]);
		givenDescribeStreamsAlwaysReturns();

		givenGetMetricDataReturns([
			{
				streamName: "stream-a",
				metricName: "IncomingBytes",
				stat: "Sum",
				value: 1024 * 512 * 60 * 5 // Half a MB per second for 5 minutes
			},
			{
				streamName: "stream-a",
				metricName: "IncomingRecords",
				stat: "Sum",
				value: 2
			},
			{
				streamName: "stream-a",
				metricName: "GetRecords.Bytes",
				stat: "Sum",
				value: 42
			},
			{
				streamName: "stream-a",
				metricName: "GetRecords.Records",
				stat: "Sum",
				value: 2
			}
		]);
	});

	test.stdout()
		.command(["list-kinesis-streams"])
		.it("calls all regions", () => {
			expect(mockListStreams.mock.calls).to.have.length(18);
		});

	test.stdout()
		.command(["list-kinesis-streams", "-r", "us-east-1"])
		.it("calls only one region", () => {
			expect(mockListStreams.mock.calls).to.have.length(1);

			const [table] = consoleLog.mock.calls[2];

			expect(table).to.contain("stream-a");
			expect(table).to.contain("50.00% (MB)");
		});
});

function givenListStreamsAlwaysReturns(streamNames) {
	mockListStreams.mockReturnValue({
		promise: () =>
			Promise.resolve({ StreamNames: streamNames, HasMoreStreams: false })
	});
}

function givenDescribeStreamsAlwaysReturns() {
	mockDescribeStreams.mockReturnValue({
		promise: () =>
			Promise.resolve({
				StreamDescription: {
					Shards: ["shard001"],
					StreamStatus: "valid",
					StreamARN: "arn:aws:us-west-2:bla:bla"
				}
			})
	});
}

function givenGetMetricDataReturns(metricValues) {
	mockGetMetricData.mockReturnValue({
		promise: () =>
			Promise.resolve({
				MetricDataResults: metricValues.map(
					({ streamName, metricName, stat, value }) => ({
						Label: `${streamName}:${metricName}:${stat}`,
						Values: [value]
					})
				)
			})
	});
}
