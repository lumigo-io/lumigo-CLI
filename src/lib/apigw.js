const _ = require("lodash");
const { ClearResult } = require("./utils");
const retry = require("async-retry");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"ca-central-1",
	"eu-north-1",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"eu-central-1",
	"ap-northeast-1",
	"ap-northeast-2",
	"ap-southeast-1",
	"ap-southeast-2",
	"ap-south-1",
	"sa-east-1"
];
const getAllApiGwInRegion = async (region, AWS) => {
	const HttpApiGw = new AWS.ApiGatewayV2({ region });

	let foundApiGw = [];
	let response = {};
	do {
		const params = response.NextToken ? { NextToken: response.NextToken } : {};
		response = await HttpApiGw.getApis(params).promise();
		foundApiGw = foundApiGw.concat(
			response.Items.map(val => {
				return {
					apiId: val.ApiId,
					name: val.Name,
					type: "HTTP",
					region
				};
			})
		);
	} while (response.NextToken);

	const RestApiGw = new AWS.APIGateway({ region });

	response = {};
	do {
		const params = response.position
			? { position: response.position, limit: 500 }
			: { limit: 500 };
		response = await RestApiGw.getRestApis(params).promise();
		foundApiGw = foundApiGw.concat(
			response.items.map(val => {
				return {
					apiId: val.id,
					name: val.name,
					type: "REST",
					region
				};
			})
		);
	} while (response.position);

	return foundApiGw;
};
const getAllApiGwCount = async AWS => {
	const allApiPromises = regions.map(region => getAllApiGwInRegion(region, AWS));
	const allApis = await Promise.all(allApiPromises);

	return _.flatten(allApis).length;
};

const deleteApiGw = async (apiGw, AWS) => {
	const HttpApiGw = new AWS.ApiGatewayV2({ region: apiGw.region });
	const RestApiGw = new AWS.APIGateway({ region: apiGw.region });
	await retry(
		async bail => {
			try {
				if (apiGw.type === "REST") {
					await RestApiGw.deleteRestApi({ restApiId: apiGw.apiId }).promise();
				} else if (apiGw.type === "HTTP") {
					await HttpApiGw.deleteApi({ ApiId: apiGw.apiId }).promise();
				} else {
					throw new Error(`Unknown API Gateway type '${apiGw.type}'`);
				}
			} catch (e) {
				if (e.code !== "TooManyRequestsException") {
					bail(e);
				} else {
					throw e;
				}
			}
		},
		{ maxTimeout: 30000 }
	);
};

const deleteAllApiGw = async AWS => {
	const allApiPromises = regions.map(region => getAllApiGwInRegion(region, AWS));
	const allApis = await Promise.all(allApiPromises);

	const apiToDelete = _.flatten(allApis);
	const apiToDeletePromises = apiToDelete.map(async val => {
		try {
			await deleteApiGw(val, AWS);
			process.stdout.write(".".green);
			return ClearResult.getSuccess(val.name, val.region);
		} catch (e) {
			process.stdout.write("F".red);
			return ClearResult.getFailed(val.name, val.region, e);
		}
	});

	return await Promise.all(apiToDeletePromises);
};
module.exports = {
	deleteApiGw,
	deleteAllApiGw,
	getAllApiGwInRegion,
	getAllApiGwCount,
	apiGwRegions: regions
};
