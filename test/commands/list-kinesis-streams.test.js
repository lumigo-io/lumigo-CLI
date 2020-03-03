const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");

const mockGetMetricData = jest.fn();
AWS.CloudWatch.prototype.getMetricData = mockGetMetricData;

const mockListStreams = jest.fn();
AWS.Kinesis.prototype.listStreams = mockListStreams;

const mockDescribeStreams = jest.fn();
AWS.Kinesis.prototype.describeStream = mockDescribeStreams;

afterEach(() => {
	mockGetMetricData.mockReset();
	mockListStreams.mockReset();
	mockDescribeStreams.mockReset();
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
			expect(mockListStreams.mock.calls).to.have.length(16);
		});

	test.stdout()
		.command(["list-kinesis-streams", "-r", "us-east-1"])
		.it("calls only one region", ctx => {
			expect(mockListStreams.mock.calls).to.have.length(1);

			expect(ctx.stdout).to.contain("stream-a");
			expect(ctx.stdout).to.contain("50.00% (MB)");
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
