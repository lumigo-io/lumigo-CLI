const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockDescribeStream = jest.fn();
AWS.Kinesis.prototype.describeStream = mockDescribeStream;
const mockGetMetricData = jest.fn();
AWS.CloudWatch.prototype.getMetricData = mockGetMetricData;

afterEach(() => {
	mockDescribeStream.mockReset();
	mockGetMetricData.mockReset();
});

describe("list-kinesis-shards", () => {
	describe("when enhanced monitoring is disabled", () => {
		beforeEach(() => {
			givenDescribeStreamReturns([{
				ShardId: "shard-00001"        
			}]);
		});
      
		test
			.stdout()
			.command(["list-kinesis-shards", "-n", "my-stream", "-r", "us-east-1"])
			.it("doesn't try to fetch metrics from CloudWatch", (ctx) => {
				expect(mockDescribeStream.mock.calls).to.have.length(1);
				expect(mockGetMetricData.mock.calls).to.be.empty;
        
				expect(ctx.stdout).to.contain("enhanced monitoring is disabled");
				expect(ctx.stdout).to.contain("hint: enable enhanced monitoring to see shard level metrics");
			});
	});
  
	describe("when enhanced monitoring is enabled", () => {
		beforeEach(() => {
			givenDescribeStreamReturns([{
				ShardId: "shard-00001"
			}], "ALL");
      
			givenGetMetricDataReturns([{
				shardId: "shard-00001",
				metricName: "IncomingBytes",
				stat: "Average",
				value: 42
			}, {
				shardId: "shard-00001",
				metricName: "ReadProvisionedThroughputExceeded",
				stat: "Sum",
				value: 1
			}]);
		});
    
		test
			.stdout()
			.command(["list-kinesis-shards", "-n", "my-stream", "-r", "us-east-1"])
			.it("fetches metrics from CloudWatch", (ctx) => {
				expect(mockDescribeStream.mock.calls).to.have.length(1);
				expect(mockGetMetricData.mock.calls).to.have.length(1);
        
				expect(ctx.stdout).to.contain("enhanced monitoring is enabled");
			});
	});
});

function givenDescribeStreamReturns (shards, ...shardLevelMetrics) {
	mockDescribeStream.mockReturnValueOnce({
		promise: () => Promise.resolve({
			StreamDescription: {
				StreamARN: "stream-arn",
				StreamStatus: "ACTIVE",
				Shards: shards,
				EnhancedMonitoring: [{ 
					ShardLevelMetrics: shardLevelMetrics 
				}]
			}
		})
	});
};

function givenGetMetricDataReturns (metricValues) {
	mockGetMetricData.mockReturnValueOnce({
		promise: () => Promise.resolve({
			MetricDataResults: metricValues.map(({ shardId, metricName, stat, value }) => ({
				Label: `${shardId}:${metricName}:${stat}`,
				Values: [value]
			}))
		})
	});
};
