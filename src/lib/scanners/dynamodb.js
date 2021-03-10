const _ = require("lodash");
const { getAWSSDK } = require("./../aws");
const Async = require("async");
const Retry = require("async-retry");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	// "ap-south-1",
	// "ap-northeast-1",
	// "ap-northeast-2",
	// "ap-southeast-1",
	// "ap-southeast-2",
	// "ca-central-1",
	"eu-central-1",
	"eu-west-1",
	"eu-west-2"
	// "eu-west-3",
	// "eu-south-1",
	// "eu-north-1",
	// "sa-east-1"
];

const getDynamoDBTablesInRegion = async region => {
	const AWS = getAWSSDK({ region });
	const DynamoDB = new AWS.DynamoDB({ region });

	const getTableNames = async () => {
		const loop = async (acc = [], exclusiveStart) => {
			const resp = await Retry(() =>
				DynamoDB.listTables({
					ExclusiveStartTableName: exclusiveStart
				}).promise()
			);

			if (_.isEmpty(resp.TableNames)) {
				return acc;
			}

			if (resp.LastEvaluatedTableName) {
				return await loop(
					acc.concat(resp.TableNames),
					resp.LastEvaluatedTableName
				);
			} else {
				return acc.concat(resp.TableNames);
			}
		};

		return loop();
	};

	const tableNames = await getTableNames();
	return await Async.mapLimit(tableNames, 1, async tableName => {
		const { Table } = await Retry(() =>
			DynamoDB.describeTable({
				TableName: tableName
			}).promise()
		);

		const { Tags } = await Retry(() =>
			DynamoDB.listTagsOfResource({
				ResourceArn: Table.TableArn
			}).promise()
		);

		// turn arrays [{"Key", "Value"}] to object {"Key":"Value"}
		const tags = _.mapValues(_.keyBy(Tags || [], "Key"), "Value");

		// collect one month's worth of usage data for the table
		const oneDayInSeconds = 24 * 60 * 60;
		const oneMonthInSeconds = 30 * oneDayInSeconds;
		const endTime = new Date();
		const startTime = new Date(endTime - oneMonthInSeconds * 1000);

		const getTableMetrics = async (metricName, statistics) => {
			const datapoints = await getMetrics(
				region,
				"AWS/DynamoDB",
				startTime,
				endTime,
				{ TableName: tableName },
				oneDayInSeconds,
				[statistics],
				metricName
			);

			return datapoints || [];
		};

		const ConsumedReadCapacityUnits = await getTableMetrics(
			"ConsumedReadCapacityUnits",
			"Sum"
		);
		const ConsumedWriteCapacityUnits = await getTableMetrics(
			"ConsumedWriteCapacityUnits",
			"Sum"
		);
		const ProvisionedReadCapacityUnits = await getTableMetrics(
			"ProvisionedReadCapacityUnits",
			"Average"
		);
		const ProvisionedWriteCapacityUnits = await getTableMetrics(
			"ProvisionedWriteCapacityUnits",
			"Average"
		);
		const Metrics = {
			ConsumedReadCapacityUnits,
			ConsumedWriteCapacityUnits,
			ProvisionedReadCapacityUnits,
			ProvisionedWriteCapacityUnits
		};

		return Object.assign({}, Table, {
			Region: region,
			Arn: Table.TableArn,
			Tags: tags,
			Metrics
		});
	});
};

const getMetrics = async (
	region,
	namespace,
	startTime,
	endTime,
	dimensions,
	period,
	statistics,
	metricName
) => {
	const AWS = getAWSSDK({ region });
	const CloudWatch = new AWS.CloudWatch({ region });

	// turn { name: value } to [{ Name: name, Value: value }]
	const Dimensions = Object.keys(dimensions).map(Name => ({
		Name,
		Value: dimensions[Name]
	}));
	const resp = await Retry(() =>
		CloudWatch.getMetricStatistics({
			Namespace: namespace,
			MetricName: metricName,
			Dimensions,
			Period: period,
			Statistics: statistics,
			StartTime: startTime,
			EndTime: endTime
		}).promise()
	);

	return resp.Datapoints;
};

const getDynamoDBTables = async () => {
	const promises = regions.map(region =>
		getDynamoDBTablesInRegion(region)
			.then(tables => {
				if (tables.length > 0) {
					console.debug("found DynamoDB tables", {
						region,
						count: tables.length
					});
				}

				return tables;
			})
			.catch(err => {
				console.error(
					"failed to get DynamoDB tables, skipped...",
					{ region },
					err
				);
				return [];
			})
	);
	return {
		dynamodb: _.flatten(await Promise.all(promises))
	};
};

module.exports = {
	getDynamoDBTables
};
