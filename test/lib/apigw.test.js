const { expect } = require("@oclif/test");
const AWSMock = require("aws-sdk-mock");
const { getAWSSDK } = require("../../src/lib/aws");
const {
	getAllApiGwInRegion,
	deleteApiGw,
	deleteAllApiGw
} = require("../../src/lib/apigw");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
const sinon = require("sinon");
require("colors"); // Required for avoid fail on console printing

chai.use(chaiAsPromised);
describe("getAllApiGwInRegion", () => {
	let AWS = null;
	beforeAll(() => {
		AWS = getAWSSDK();
		AWSMock.setSDKInstance(AWS);
	});
	it("Get 2 types of api GW and return a valid representation  ", async function() {
		AWSMock.mock("ApiGatewayV2", "getApis", function(params, callback) {
			callback(null, {
				Items: [{ ApiId: "1234", Name: "httpApi" }]
			});
		});

		AWSMock.mock("APIGateway", "getRestApis", function(params, callback) {
			callback(null, {
				items: [{ id: "5678", name: "restApi" }]
			});
		});

		const result = await getAllApiGwInRegion("us-west-1", AWS);

		expect(result.length).to.equal(2);
	});
});

describe("deleteApiGw", () => {
	let AWS = null;
	beforeAll(() => {
		AWS = getAWSSDK();
		AWSMock.setSDKInstance(AWS);
	});

	afterEach(() => {
		AWSMock.restore();
	});

	it("2 api's deleted successfully", async () => {
		AWSMock.mock("ApiGatewayV2", "getApis", function(params, callback) {
			callback(null, {
				Items: [{ ApiId: "1234", Name: "httpApi" }]
			});
		});

		AWSMock.mock("APIGateway", "getRestApis", function(params, callback) {
			callback(null, {
				items: [{ id: "5678", name: "restApi" }]
			});
		});

		AWSMock.mock("ApiGatewayV2", "deleteApi", function(params, callback) {
			callback(null, {});
		});

		AWSMock.mock("APIGateway", "deleteRestApi", function(params, callback) {
			callback(null, {});
		});

		const result = await deleteAllApiGw(AWS);

		// 2 for each region
		expect(result.length).to.equal(32);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("1 api deleted successfully, one failed", async () => {
		AWSMock.mock("ApiGatewayV2", "getApis", function(params, callback) {
			callback(null, {
				Items: [{ ApiId: "1234", Name: "httpApi" }]
			});
		});

		AWSMock.mock("APIGateway", "getRestApis", function(params, callback) {
			callback(null, {
				items: [{ id: "5678", name: "restApi" }]
			});
		});

		AWSMock.mock("ApiGatewayV2", "deleteApi", function(params, callback) {
			callback(null, {});
		});

		AWSMock.mock("APIGateway", "deleteRestApi", function(params, callback) {
			callback(new Error());
		});

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
	let AWS = null;
	beforeAll(() => {
		AWS = getAWSSDK();
		AWSMock.setSDKInstance(AWS);
	});

	afterEach(() => {
		AWSMock.restore();
	});

	it("Successful delete HTTP API nothing fails ", async function() {
		AWSMock.mock("ApiGatewayV2", "deleteApi", function(params, callback) {
			callback(null, {});
		});

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
		AWSMock.mock("APIGateway", "deleteRestApi", function(params, callback) {
			callback(null, {});
		});

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
		const deleteStub = sinon.stub();
		AWSMock.mock("APIGateway", "deleteRestApi", deleteStub);
		deleteStub.onCall(0).callsFake((params, callback) => {
			callback({ code: "TooManyRequestsException" });
		});

		deleteStub.onCall(1).callsFake((params, callback) => {
			callback(new Error());
		});

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
