const { expect } = require("@oclif/test");
const AWSMock = require("aws-sdk-mock");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllStacks } = require("../../src/lib/cloudformation");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});
chai.use(chaiAsPromised);
describe("deleteAllStacks", () => {
	let AWS = null;
	beforeEach(() => {
		AWS = getAWSSDK();
		AWSMock.setSDKInstance(AWS);
	});

	afterEach(() => {
		AWSMock.restore();
	});

	it("Delete all stacks successfully", async function() {
		AWSMock.mock("CloudFormation", "listStacks", function(params, callback) {
			callback(null, {
				StackSummaries: [
					{
						StackId: "1234",
						StackName: "MyStack",
						StackStatus: "CREATE_COMPLETE"
					}
				]
			});
		});

		AWSMock.mock("CloudFormation", "deleteStack", function(params, callback) {
			callback(null, {});
		});

		AWSMock.mock("CloudFormation", "waitFor", function(params, args, callback) {
			callback(null, {});
		});

		const result = await deleteAllStacks(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("Fail Deleting all stacks", async function() {
		AWSMock.mock("CloudFormation", "listStacks", function(params, callback) {
			callback(null, {
				StackSummaries: [
					{
						StackId: "1234",
						StackName: "MyStack",
						StackStatus: "CREATE_COMPLETE"
					}
				]
			});
		});

		AWSMock.mock("CloudFormation", "deleteStack", function(params, callback) {
			callback(new Error("Boom!"));
		});

		const result = await deleteAllStacks(AWS, { retries: 1, minTimeout: 2 });

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("fail");
		});
	});
});
