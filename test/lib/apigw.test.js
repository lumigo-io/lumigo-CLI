const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteApiGw, deleteAllApiGw } = require("../../src/lib/apigw");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors");
const { getPromiseResponse, success, fail } = require("../test-utils/jest-mocks"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});
chai.use(chaiAsPromised);

let AWS = null;
beforeEach(() => {
	AWS = getAWSSDK();

	AWS.ApiGatewayV2.prototype.getApis = getPromiseResponse({
		Items: [{ ApiId: "1234", Name: "httpApi" }]
	});

	AWS.APIGateway.prototype.getRestApis = getPromiseResponse({
		items: [{ id: "5678", name: "restApi" }]
	});
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe("deleteApiGw", () => {
	it("2 api's deleted successfully", async () => {
		AWS.ApiGatewayV2.prototype.deleteApi = success;
		AWS.APIGateway.prototype.deleteRestApi = success;

		const result = await deleteAllApiGw(AWS);

		// 2 for each region
		expect(result.length).to.equal(32);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("1 api deleted successfully, one failed", async () => {
		AWS.ApiGatewayV2.prototype.deleteApi = success;
		AWS.APIGateway.prototype.deleteRestApi = fail;

		const result = await deleteAllApiGw(AWS);

		// 2 for each region
		expect(result.length).to.equal(32);
		const successResult = result.filter(val => {
			return val.status === "success";
		});
		const failResult = result.filter(val => {
			return val.status === "fail";
		});

		expect(successResult.length).to.equal(16);
		expect(failResult.length).to.equal(16);
	});
});

describe("deleteApiGw", () => {
	it("Successful delete HTTP API nothing fails ", async function() {
		AWS.ApiGatewayV2.prototype.deleteApi = success;

		await deleteApiGw(
			{
				apiId: "1234",
				name: "no-name",
				type: "HTTP",
				region: "us-east-1"
			},
			AWS
		);
	});

	it("Successful delete REST API nothing fails ", async function() {
		AWS.APIGateway.prototype.deleteRestApi = success;

		await deleteApiGw(
			{
				apiId: "1234",
				name: "no-name",
				type: "REST",
				region: "us-east-1"
			},
			AWS
		);
	});

	it("Unknown type, throw exception ", async function() {
		const func = async () => {
			await deleteApiGw(
				{
					apiId: "1234",
					name: "no-name",
					type: "XYZ",
					region: "us-east-1"
				},
				AWS
			);
		};

		await expect(func()).to.be.rejectedWith(Error);
	});

	it("TooManyRequestsException, retry ", async function() {
		const fail = jest.fn();
		let counter = 1;
		fail.mockImplementation(() => {
			return {
				promise() {
					if (counter === 1) {
						counter++;
						return Promise.reject({ code: "TooManyRequestsException" });
					} else {
						return Promise.reject(new Error());
					}
				}
			};
		});

		AWS.APIGateway.prototype.deleteRestApi = fail;

		const func = async () => {
			await deleteApiGw(
				{
					apiId: "1234",
					name: "no-name",
					type: "REST",
					region: "us-east-1"
				},
				AWS
			);
		};

		await expect(func()).to.be.rejectedWith(Error);
	});
});
